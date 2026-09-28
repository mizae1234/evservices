// Booking Notification Dispatcher
// จุดเดียวที่ตัดสินใจว่า "action ของการจอง 1 ครั้ง ควรแจ้งเตือนใครบ้าง" แล้วส่งออก 2 ช่องทาง:
//   1. In-app  → CM_Notification
//   2. LINE OA → push/multicast ไปยังผู้ใช้ที่ผูกบัญชีไว้แล้ว (CM_UserLineLink)
//
// กติกาผู้รับ (สำคัญ — ต้องแจ้งให้ถูกสาขา):
//   - ADMIN                : ได้รับทุกสาขา ทุก BookingType
//   - SERVICE_CENTER       : ได้รับเฉพาะ "สาขาตัวเอง" เท่านั้น
//   - CS / CS_*            : ได้รับเฉพาะ BookingType ที่ตัวเองดูแล (AllowedBookingType = null คือดูแลทุกประเภท)
//                            และถ้า CS คนนั้นถูกผูกสาขาไว้ ก็จะได้รับเฉพาะสาขานั้น
//   - ผู้ที่กด action เอง  : ได้รับด้วย — ทุกคนที่อยู่ในขอบเขตต้องเห็นความเคลื่อนไหวชุดเดียวกัน

import prisma from '@/lib/prisma';
import { getAllowedBookingType, isCSRole } from '@/lib/permissions';
import {
    bookingFlexMessage,
    getAppBaseUrl,
    isLineConfigured,
    lineMulticast,
    type BookingFlexRow,
} from '@/lib/line';

/** ชื่อลูกค้าที่ระบบใช้แทนการปิดช่องซ่อมชั่วคราว (ไม่ใช่คิวจริง) */
const BLOCK_BOOKING_NAME = '[ปิดช่องซ่อมชั่วคราว]';

// ============================================================
// Event catalog
// ============================================================

export type BookingEventType =
    | 'CREATED'
    | 'AUTO_APPROVED'
    | 'APPROVED'
    | 'REJECTED'
    | 'CANCELLED'
    | 'RESCHEDULED'
    | 'DURATION_CHANGED'
    | 'UPDATED'
    | 'BAY_CHANGED'
    | 'CLAIMED'
    | 'COMPLETED'
    | 'CS_STATUS';

interface EventMeta {
    /** หัวข้อบนการ์ด LINE + หัวข้อ in-app */
    label: string;
    emoji: string;
    /** สีหัวการ์ด LINE */
    color: string;
    /** สีอ่อนของชุดเดียวกัน ใช้เป็นพื้นกล่องวันที่-เวลา */
    soft: string;
    /** ค่าที่เก็บลง CM_Notification.Type */
    notiType: string;
}

const EVENT_META: Record<BookingEventType, EventMeta> = {
    CREATED:          { label: 'มีคิวจองใหม่',          emoji: '📥', color: '#2563EB', soft: '#EFF6FF', notiType: 'BOOKING_NEW' },
    AUTO_APPROVED:    { label: 'คิวจองใหม่ (อนุมัติอัตโนมัติ)', emoji: '⚡', color: '#0EA5E9', soft: '#F0F9FF', notiType: 'BOOKING_NEW' },
    APPROVED:         { label: 'อนุมัติคิวแล้ว',          emoji: '✅', color: '#16A34A', soft: '#F0FDF4', notiType: 'BOOKING_APPROVED' },
    REJECTED:         { label: 'ปฏิเสธคิว',              emoji: '🚫', color: '#DC2626', soft: '#FEF2F2', notiType: 'BOOKING_REJECTED' },
    CANCELLED:        { label: 'ยกเลิกคิว',              emoji: '❌', color: '#DC2626', soft: '#FEF2F2', notiType: 'BOOKING_CANCELLED' },
    RESCHEDULED:      { label: 'เลื่อนนัดหมาย',          emoji: '📅', color: '#F59E0B', soft: '#FFFBEB', notiType: 'BOOKING_RESCHEDULED' },
    DURATION_CHANGED: { label: 'ปรับเวลาซ่อม',           emoji: '⏱️', color: '#F59E0B', soft: '#FFFBEB', notiType: 'BOOKING_DURATION_CHANGED' },
    UPDATED:          { label: 'แก้ไขข้อมูลคิว',          emoji: '✏️', color: '#6366F1', soft: '#EEF2FF', notiType: 'BOOKING_UPDATED' },
    BAY_CHANGED:      { label: 'เปลี่ยนช่องซ่อม',        emoji: '🔀', color: '#6366F1', soft: '#EEF2FF', notiType: 'BOOKING_BAY_CHANGED' },
    CLAIMED:          { label: 'เปิดใบเคลมแล้ว',         emoji: '📄', color: '#0F766E', soft: '#F0FDFA', notiType: 'BOOKING_CLAIMED' },
    COMPLETED:        { label: 'ปิดงานแล้ว',             emoji: '🏁', color: '#0F766E', soft: '#F0FDFA', notiType: 'BOOKING_COMPLETED' },
    CS_STATUS:        { label: 'อัปเดตสถานะการติดต่อลูกค้า', emoji: '📞', color: '#7C3AED', soft: '#F5F3FF', notiType: 'BOOKING_CS_STATUS' },
};

// ============================================================
// Formatting helpers (BookingDate เก็บเป็น UTC-midnight → ต้องอ่านด้วย getUTC*)
// ============================================================

const THAI_MONTHS_SHORT = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];

/** 2026-09-14 → "14 ก.ย. 69" */
export function formatThaiBookingDate(date: Date | string): string {
    const d = new Date(date);
    const buddhistYear = (d.getUTCFullYear() + 543) % 100;
    return `${d.getUTCDate()} ${THAI_MONTHS_SHORT[d.getUTCMonth()]} ${buddhistYear.toString().padStart(2, '0')}`;
}

/** "2026-09-14" (string จาก request body) → "14 ก.ย. 69" */
export function formatThaiDateString(dateStr: string): string {
    const [y, m, d] = dateStr.split('-').map(Number);
    if (!y || !m || !d) return dateStr;
    return `${d} ${THAI_MONTHS_SHORT[m - 1]} ${((y + 543) % 100).toString().padStart(2, '0')}`;
}

/**
 * ปิดบังนามสกุลลูกค้าก่อนส่งออกนอกระบบ (LINE / push banner)
 * แสดงเฉพาะชื่อต้น ส่วนนามสกุลแทนด้วย ***
 *
 *   'นายสมชาย ใจดี'      → 'นายสมชาย ***'
 *   'นาย สมชาย ใจดี'     → 'นาย สมชาย ***'
 *   'สมชาย'              → 'สมชาย'        (ไม่มีนามสกุลให้ปิด)
 */
export function maskCustomerName(fullName: string): string {
    const name = (fullName || '').trim();
    if (!name) return '-';

    const parts = name.split(/\s+/);
    if (parts.length < 2) return name;

    return [...parts.slice(0, -1), '***'].join(' ');
}

/**
 * จัดรูปแบบเบอร์โทรให้อ่านง่าย พร้อม tel: URI สำหรับกดโทรออกจากการ์ด LINE
 *
 *   '0812345678' → { display: '081-234-5678', telUri: 'tel:0812345678' }
 *   '021234567'  → { display: '02-123-4567',  telUri: 'tel:021234567'  }
 *
 * แสดงเบอร์เต็มโดยตั้งใจ เพื่อให้ CS กดโทรหาลูกค้าได้ทันทีจากการ์ด
 * (ต่างจากชื่อลูกค้าที่ยังปิดนามสกุลไว้ — ดู maskCustomerName)
 */
export function formatCustomerPhone(phone?: string | null): { display: string; telUri: string } | null {
    const digits = (phone || '').replace(/[^0-9]/g, '');
    if (!digits) return null;

    let display = digits;
    if (digits.length === 10) {
        display = `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
    } else if (digits.length === 9) {
        display = `${digits.slice(0, 2)}-${digits.slice(2, 5)}-${digits.slice(5)}`;
    }

    return { display, telUri: `tel:${digits}` };
}

/** BookingDate เก็บเป็น UTC-midnight → คืนค่าเป็น YYYY-MM-DD สำหรับ query string */
function toDateParam(date: Date | string): string {
    const d = new Date(date);
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

/** เติมคำว่า "สาขา" ให้ชื่อสาขาโดยไม่ซ้ำ */
export function withBranchPrefix(branchName?: string | null): string {
    const name = (branchName || '').trim();
    if (!name) return 'ไม่ระบุสาขา';
    return name.startsWith('สาขา') ? name : `สาขา${name}`;
}

// ============================================================
// Recipient resolution
// ============================================================

export interface NotifyRecipient {
    UserID: number;
    FullName: string;
    RoleCode: string;
    BranchID: number | null;
    LineUserID: string | null;
}

/**
 * หาผู้ใช้ที่ควรได้รับแจ้งเตือนของการจองนี้ ตามกติกาที่อธิบายไว้หัวไฟล์
 *
 * หมายเหตุ: ไม่มีการตัดผู้ที่กด action ออก — คนทำรายการเองก็ได้รับแจ้งเตือนด้วย
 */
export async function resolveBookingRecipients(params: {
    branchId: number;
    bookingType?: string | null;
}): Promise<NotifyRecipient[]> {
    const { branchId } = params;
    const bookingType = (params.bookingType || 'EV7').toUpperCase();

    // กรองบทบาท/สาขาที่ระดับ SQL เพื่อไม่ต้องดึง user ทั้งองค์กรมาทุกครั้ง
    // เหลือเฉพาะเงื่อนไข BookingType ที่ตัดสินใน JS เพราะใช้ตรรกะ fuzzy ของ getAllowedBookingType
    const users = await prisma.cM_User.findMany({
        where: {
            IsActive: true,
            Role: { IsActive: true },
            OR: [
                { Role: { RoleCode: 'ADMIN' } },
                { Role: { RoleCode: 'SERVICE_CENTER' }, BranchID: branchId },
                {
                    Role: { OR: [{ RoleCode: 'CS' }, { RoleCode: { startsWith: 'CS_' } }] },
                    OR: [{ BranchID: null }, { BranchID: branchId }],
                },
            ],
        },
        select: {
            UserID: true,
            FullName: true,
            BranchID: true,
            Role: { select: { RoleCode: true, AllowedBookingType: true } },
            LineLink: {
                select: { LineUserID: true, IsActive: true, NotifyEnabled: true },
            },
        },
    });

    const recipients: NotifyRecipient[] = [];

    for (const u of users) {
        const roleCode = u.Role.RoleCode;
        let shouldNotify = false;

        if (roleCode === 'ADMIN') {
            // Admin เห็นภาพรวมทั้งหมด
            shouldNotify = true;
        } else if (roleCode === 'SERVICE_CENTER') {
            // สาขาต้องตรงกันเท่านั้น
            shouldNotify = u.BranchID === branchId;
        } else if (isCSRole(roleCode)) {
            const allowedType = getAllowedBookingType({
                role: roleCode,
                allowedBookingType: u.Role.AllowedBookingType,
            });
            const typeMatches = !allowedType || allowedType === bookingType;
            // CS ที่ถูกผูกสาขาไว้ → เห็นเฉพาะสาขานั้น, CS ที่ไม่ผูกสาขา (call center) → เห็นทุกสาขา
            const branchMatches = u.BranchID === null || u.BranchID === branchId;
            shouldNotify = typeMatches && branchMatches;
        }

        if (!shouldNotify) continue;

        const link = u.LineLink;
        const lineUserId = link && link.IsActive && link.NotifyEnabled ? link.LineUserID : null;

        recipients.push({
            UserID: u.UserID,
            FullName: u.FullName,
            RoleCode: roleCode,
            BranchID: u.BranchID,
            LineUserID: lineUserId,
        });
    }

    return recipients;
}

// ============================================================
// Dispatcher
// ============================================================

export interface BookingLike {
    BookingID: number;
    BookingNo: string;
    BookingDate: Date | string;
    StartTime: string;
    EndTime: string;
    CustomerName: string;
    CustomerPhone?: string | null;
    CarRegister: string;
    CarModel?: string | null;
    BranchID: number;
    BookingType?: string | null;
}

export interface NotifyBookingEventParams {
    event: BookingEventType;
    booking: BookingLike;
    /** ชื่อคนที่กด action (แสดงบนการ์ด) */
    actorName?: string | null;
    /** ชื่อสาขา ถ้าไม่ส่งมาจะ query ให้ */
    branchName?: string | null;
    /** เหตุผล เช่น เหตุผลการยกเลิก / เลื่อนคิว */
    reason?: string | null;
    /** บรรทัดรายละเอียดเพิ่มเติมเฉพาะ event เช่น "จาก 14 ก.ย. → 20 ก.ย." */
    extraRows?: BookingFlexRow[];
    /** ข้อความท้ายการ์ด */
    footerNote?: string | null;
    /** ชื่อช่องซ่อม */
    bayName?: string | null;
    /** ชื่อประเภทบริการ */
    serviceTypeName?: string | null;
}

/**
 * ส่งแจ้งเตือน 1 event ออกทั้ง in-app และ LINE
 * ฟังก์ชันนี้ "ไม่ throw" — ความล้มเหลวของการแจ้งเตือนต้องไม่ทำให้ action หลักพัง
 */
export async function notifyBookingEvent(params: NotifyBookingEventParams): Promise<void> {
    try {
        const { event, booking, actorName, reason, extraRows, footerNote, bayName, serviceTypeName } = params;
        const meta = EVENT_META[event];
        if (!meta) {
            console.error('[booking-notify] unknown event:', event);
            return;
        }

        // การ "ปิดช่องซ่อมชั่วคราว" ไม่ใช่คิวลูกค้า → ไม่ต้องแจ้งเตือน
        if (booking.CustomerName === BLOCK_BOOKING_NAME) return;

        // 1. ชื่อสาขา
        let branchName = params.branchName;
        if (!branchName) {
            const branch = await prisma.cM_MsServiceBranch.findUnique({
                where: { BranchID: booking.BranchID },
                select: { BranchName: true },
            });
            branchName = branch?.BranchName || '';
        }
        const branchLabel = withBranchPrefix(branchName);

        // 2. ผู้รับ
        const recipients = await resolveBookingRecipients({
            branchId: booking.BranchID,
            bookingType: booking.BookingType,
        });

        if (recipients.length === 0) return;

        // 3. ข้อความ
        const dateText = formatThaiBookingDate(booking.BookingDate);
        const timeText = booking.EndTime ? `${booking.StartTime} - ${booking.EndTime} น.` : `${booking.StartTime} น.`;

        // ปิดบังนามสกุลก่อนนำไปแสดงทุกช่องทาง
        const customerLabel = maskCustomerName(booking.CustomerName);

        const title = `${meta.label} ${booking.BookingNo} ${meta.emoji}`;
        const messageParts = [
            `ลูกค้า ${customerLabel} (ทะเบียน ${booking.CarRegister})`,
            `${branchLabel} วันที่ ${dateText} เวลา ${timeText}`,
        ];
        if (reason) messageParts.push(`เหตุผล: ${reason}`);
        if (actorName) messageParts.push(`โดย ${actorName}`);
        const message = messageParts.join(' | ');

        // 4. In-app notification
        try {
            await prisma.cM_Notification.createMany({
                data: recipients.map((r) => ({
                    UserID: r.UserID,
                    Type: meta.notiType,
                    Title: title.slice(0, 200),
                    Message: message.slice(0, 500),
                    BookingID: booking.BookingID,
                })),
            });
        } catch (err) {
            console.error('[booking-notify] in-app notification failed:', err);
        }

        // 5. LINE — ไม่ await เพราะต้องข้ามเครือข่ายออกไปหา LINE (วัดได้ ~500ms)
        // ผู้ใช้ไม่ควรรอเรื่องนี้ในเมื่อการจองเขียนลงฐานข้อมูลเสร็จไปแล้ว
        const lineTargets = recipients
            .map((r) => r.LineUserID)
            .filter((id): id is string => Boolean(id));

        if (lineTargets.length === 0 || !isLineConfigured()) return;

        // วันที่/เวลาไม่อยู่ในรายการแถว เพราะถูกยกไปไว้ในกล่องเน้นด้านบนของการ์ด
        const phone = formatCustomerPhone(booking.CustomerPhone);
        const rows: BookingFlexRow[] = [
            { label: 'ลูกค้า', value: customerLabel, highlight: 'strong' },
        ];
        if (phone) {
            rows.push({
                label: 'เบอร์โทร',
                value: `📞 ${phone.display}`,
                highlight: 'link',
                action: { type: 'uri', label: 'โทร', uri: phone.telUri },
            });
        }
        rows.push({
            label: 'ทะเบียน',
            value: `${booking.CarRegister}${booking.CarModel ? ` (${booking.CarModel})` : ''}`,
            highlight: 'strong',
        });
        rows.push({ label: 'สาขา', value: branchLabel });
        if (bayName) rows.push({ label: 'ช่องซ่อม', value: bayName });
        if (serviceTypeName) rows.push({ label: 'บริการ', value: serviceTypeName });
        if (extraRows?.length) rows.push(...extraRows);
        if (reason) rows.push({ label: 'เหตุผล', value: reason, highlight: 'warn' });
        if (actorName) rows.push({ label: 'โดย', value: actorName, highlight: 'muted' });

        // ไม่มี route /service-center/bookings/[id] — แอปแสดงรายละเอียดผ่าน modal บนหน้า list
        // จึง deep link ไปหน้า list พร้อม bookingId (เปิด modal) และ date (ให้ตารางเบื้องหลังตรงวัน)
        const baseUrl = getAppBaseUrl();
        const detailUrl = baseUrl
            ? `${baseUrl}/service-center/bookings?bookingId=${booking.BookingID}&date=${toDateParam(booking.BookingDate)}`
            : undefined;

        const flex = bookingFlexMessage({
            headerIcon: meta.emoji,
            headerText: meta.label,
            headerColor: meta.color,
            softColor: meta.soft,
            bookingNo: booking.BookingNo,
            dateText,
            timeText,
            rows,
            footerNote: footerNote || undefined,
            detailUrl,
            altText: `${title} — ${customerLabel} ${dateText} ${timeText}`,
        });

        // ปล่อยให้ทำงานเบื้องหลัง — notifyBookingEvent จับ error ครบอยู่แล้ว จึงไม่มี unhandled rejection
        void (async () => {
            const result = await lineMulticast(lineTargets, [flex]);

            // 6. Outbox log (ไว้ตรวจว่าใครควรได้รับอะไร / ส่งไม่สำเร็จเพราะอะไร)
            try {
                await prisma.cM_LineMessageLog.createMany({
                    data: recipients
                        .filter((r) => r.LineUserID)
                        .map((r) => ({
                            UserID: r.UserID,
                            LineUserID: r.LineUserID,
                            BookingID: booking.BookingID,
                            EventType: event,
                            Title: title.slice(0, 200),
                            Message: message.slice(0, 1000),
                            IsSuccess: result.ok,
                            ErrorMsg: result.error ? result.error.slice(0, 500) : null,
                        })),
                });
            } catch (err) {
                console.error('[booking-notify] message log failed:', err);
            }
        })().catch((err) => console.error('[booking-notify] LINE dispatch failed:', err));
    } catch (err) {
        console.error('[booking-notify] dispatch failed:', err);
    }
}
