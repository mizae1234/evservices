// Queue service: check-in (idempotent), เลขคิวรายวันต่อสาขา, เปลี่ยนสถานะ + log

import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { getBangkokDateString } from '@/lib/utils';
import { publishQueueChange } from '@/lib/queue-events';
import {
    ACTIVE_STATUSES,
    QueueStatus,
    canTransition,
    requiresRepairDetail,
} from '@/lib/queue-status';

export function normalizePlate(plate: string): string {
    return plate.replace(/\s/g, '').toUpperCase();
}

/** วันที่ Bangkok ปัจจุบัน เป็น UTC midnight (ตามรูปแบบ BookingDate) */
export function getTodayQueueDate(): Date {
    const [y, m, d] = getBangkokDateString().split('-').map(Number);
    return new Date(Date.UTC(y, m - 1, d, 0, 0, 0, 0));
}

function isUniqueViolation(error: unknown): boolean {
    if (error instanceof Prisma.PrismaClientKnownRequestError) return error.code === 'P2002';
    return error instanceof Error && /Cannot insert duplicate key/i.test(error.message);
}

export class QueueInputError extends Error {}

// ต่อคิวการจองเลขคิวต่อ (สาขา+วัน+ตัวอักษร) ในโปรเซสเดียวกัน ลดการชนกันของ MAX+1 เมื่อเช็คอินพร้อมกันหลายคน
// (หลาย instance ยังปลอดภัยด้วย unique constraint + retry)
const numberingLocks = new Map<string, Promise<unknown>>();
async function withNumberingLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
    const prev = numberingLocks.get(key) ?? Promise.resolve();
    const run = prev.catch(() => undefined).then(fn);
    const tail = run.catch(() => undefined);
    numberingLocks.set(key, tail);
    try {
        return await run;
    } finally {
        if (numberingLocks.get(key) === tail) numberingLocks.delete(key);
    }
}

export interface CheckInInput {
    branchId: number;
    carRegister: string;
    customerName?: string | null;
    customerPhone?: string | null;
    serviceTypeId?: number | null;
    /** บริการ "อื่นๆ" ที่พิมพ์เอง (ใช้เมื่อไม่ได้เลือกประเภทบริการ) */
    serviceOther?: string | null;
    claimsBooking: boolean;
    bookingType?: string;
    vehicle?: { vinNo?: string | null; carModel?: string | null; inventoryItemId?: number | null; customerName?: string | null } | null;
}

/** การจองที่อนุมัติแล้วของวันนี้ ตรงสาขา+ทะเบียน และยังไม่ผูกกับคิวที่ใช้งานอยู่ */
export function findTodayBooking(branchId: number, plate: string, queueDate: Date) {
    return prisma.cM_Booking.findFirst({
        where: {
            BranchID: branchId,
            BookingDate: queueDate,
            CarRegister: plate,
            Status: 1,
            IsActive: true,
            Queues: { none: { Status: { notIn: ['CANCELLED', 'NO_SHOW'] } } },
        },
        include: { ServiceType: { select: { Name: true } } },
        orderBy: { StartTime: 'asc' },
    });
}

/** ตัวอักษรนำหน้าเลขคิวตามประเภทบริการ: ประเภทที่ 1 = A, 2 = B, 3 = C ... (เรียงตาม SortOrder, ID) */
// บริการ "อื่นๆ" ใช้ตัวอักษร Z แยกจากประเภทบริการปกติ
export const OTHER_QUEUE_LETTER = 'Z';

export async function getQueueLetter(serviceTypeId: number): Promise<string> {
    const types = await prisma.cM_ServiceType.findMany({
        orderBy: [{ SortOrder: 'asc' }, { ServiceTypeID: 'asc' }],
        select: { ServiceTypeID: true },
    });
    const idx = types.findIndex((t) => t.ServiceTypeID === serviceTypeId);
    return String.fromCharCode(65 + Math.min(Math.max(idx, 0), 25));
}

export async function checkInQueue(input: CheckInInput) {
    const queueDate = getTodayQueueDate();
    const plate = normalizePlate(input.carRegister);

    for (let attempt = 0; attempt < 8; attempt++) {
        if (attempt > 0) await new Promise((r) => setTimeout(r, 20 + Math.random() * 60 * attempt));
        // idempotent: มีคิวที่ยังเปิดของทะเบียนนี้แล้ว -> คืนคิวเดิม
        const existing = await prisma.cM_Queue.findFirst({
            where: { BranchID: input.branchId, QueueDate: queueDate, CarRegister: plate, Status: { in: ACTIVE_STATUSES } },
        });
        if (existing) return { queue: existing, created: false };

        const booking = await findTodayBooking(input.branchId, plate, queueDate);

        const customerName = input.customerName?.trim() || booking?.CustomerName || input.vehicle?.customerName?.trim() || '';
        if (!customerName) throw new QueueInputError('กรุณากรอกชื่อ');
        // เบอร์ติดต่อ: ใช้ที่ลูกค้ากรอก ไม่เช่นนั้นใช้เบอร์ในการจอง; ถ้าไม่มีทั้งคู่ต้องกรอก
        const customerPhone = input.customerPhone?.trim() || booking?.CustomerPhone?.trim() || '';
        if (customerPhone.length !== 10) throw new QueueInputError('กรุณากรอกเบอร์โทร 10 หลัก');
        const serviceTypeId = input.serviceTypeId ?? booking?.ServiceTypeID ?? null;
        const serviceOther = !serviceTypeId ? input.serviceOther?.trim().slice(0, 200) || null : null;
        if (!serviceTypeId && !serviceOther) throw new QueueInputError('กรุณาเลือกประเภทบริการ หรือระบุบริการที่ต้องการ');
        const letter = serviceTypeId ? await getQueueLetter(serviceTypeId) : OTHER_QUEUE_LETTER;
        // ลูกค้าที่จองมาแล้ว: ดึงรายละเอียดจากใบจองมาใช้เลย (ไม่ต้องให้พนักงานพิมพ์ซ้ำ)
        const bookingDetail = booking
            ? booking.ClaimDetail?.trim()
                || [booking.ServiceType?.Name, booking.Mileage ? `${booking.Mileage.toLocaleString('en-US')} กม.` : null].filter(Boolean).join(' ')
                || null
            : null;

        try {
            const queue = await withNumberingLock(`${input.branchId}:${queueDate.getTime()}:${letter}`, () => prisma.$transaction(async (tx) => {
                const last = await tx.cM_Queue.aggregate({
                    where: { BranchID: input.branchId, QueueDate: queueDate, QueueLabel: { startsWith: letter } },
                    _max: { QueueNo: true },
                });
                const queueNo = (last._max.QueueNo ?? 0) + 1;
                const created = await tx.cM_Queue.create({
                    data: {
                        BranchID: input.branchId,
                        QueueDate: queueDate,
                        QueueNo: queueNo,
                        QueueLabel: `${letter}${String(queueNo).padStart(3, '0')}`,
                        BookingID: booking?.BookingID ?? null,
                        NeedsReview: input.claimsBooking && !booking,
                        CarRegister: plate,
                        CustomerName: customerName,
                        CustomerPhone: customerPhone,
                        CarModel: input.vehicle?.carModel ?? booking?.CarModel ?? null,
                        VinNo: input.vehicle?.vinNo ?? booking?.VinNo ?? null,
                        InventoryItemID: input.vehicle?.inventoryItemId ?? booking?.InventoryItemID ?? null,
                        BookingType: booking?.BookingType ?? input.bookingType ?? 'EV7',
                        ServiceTypeID: serviceTypeId,
                        ServiceOther: serviceOther,
                        RepairDetail: bookingDetail,
                    },
                });
                await tx.cM_QueueLog.create({
                    data: {
                        QueueID: created.QueueID,
                        ToStatus: 'WAITING_CALL',
                        ActionByName: 'ลูกค้า (เช็คอิน)',
                        Note: booking
                            ? `ผูกกับการจอง ${booking.BookingNo}`
                            : input.claimsBooking
                                ? 'ลูกค้าแจ้งว่ามีการจอง แต่ไม่พบรายการ — รอพนักงานยืนยัน'
                                : 'Walk-in',
                    },
                });
                return created;
            }));
            publishQueueChange(input.branchId);
            return { queue, created: true };
        } catch (error) {
            // เช็คอินพร้อมกัน / เลขคิวชน -> วนอ่านคิวเดิมหรือขอเลขใหม่
            if (!isUniqueViolation(error)) throw error;
        }
    }
    throw new Error('ไม่สามารถสร้างคิวได้ กรุณาลองใหม่อีกครั้ง');
}

/** ข้อมูลคิวสำหรับลูกค้าดูสถานะของตัวเอง (ไม่มีข้อมูลส่วนบุคคล) */
export async function getTicketView(queueId: number, branchId: number) {
    const q = await prisma.cM_Queue.findUnique({
        where: { QueueID: queueId },
        include: { ServiceType: { select: { Name: true } } },
    });
    if (!q || q.BranchID !== branchId) return null;
    const ahead = q.Status === 'WAITING_CALL'
        ? await prisma.cM_Queue.count({
            where: { BranchID: q.BranchID, QueueDate: q.QueueDate, Status: 'WAITING_CALL', CheckInDate: { lt: q.CheckInDate } },
        })
        : 0;
    return {
        queueLabel: q.QueueLabel,
        status: q.Status as QueueStatus,
        serviceTypeName: q.ServiceType?.Name ?? (q.ServiceOther ? 'อื่นๆ' : null),
        checkInAt: q.CheckInDate.toISOString(),
        aheadCount: ahead,
        expired: q.QueueDate.getTime() !== getTodayQueueDate().getTime(),
        needsReview: q.NeedsReview,
    };
}

export type ChangeStatusResult =
    | { ok: true; queue: NonNullable<Awaited<ReturnType<typeof prisma.cM_Queue.findUnique>>> }
    | { ok: false; code: 'NOT_FOUND' | 'INVALID_TRANSITION' | 'CONFLICT' | 'REPAIR_DETAIL_REQUIRED'; message: string };

export async function changeQueueStatus(params: {
    queueId: number;
    to: QueueStatus;
    expectedVersion?: number;
    repairDetail?: string | null;
    note?: string | null;
    actor: { id: number; name: string };
    branchGuard: (branchId: number) => boolean;
}): Promise<ChangeStatusResult> {
    const current = await prisma.cM_Queue.findUnique({ where: { QueueID: params.queueId } });
    if (!current || !params.branchGuard(current.BranchID)) {
        return { ok: false, code: 'NOT_FOUND', message: 'ไม่พบคิว' };
    }
    const from = current.Status as QueueStatus;
    // บริการ "อื่นๆ" (ไม่มีประเภทบริการ) ข้ามสถานะได้
    const canSkip = current.ServiceTypeID == null;
    if (!canTransition(from, params.to, canSkip)) {
        return { ok: false, code: 'INVALID_TRANSITION', message: 'ไม่สามารถเปลี่ยนสถานะข้ามลำดับหรือย้อนกลับได้' };
    }
    const detail = params.repairDetail?.trim() || current.RepairDetail?.trim() || '';
    if (requiresRepairDetail(from, params.to, canSkip) && !detail) {
        return { ok: false, code: 'REPAIR_DETAIL_REQUIRED', message: 'กรุณาบันทึกรายละเอียดงานซ่อมก่อนรับเข้าซ่อม' };
    }

    // optimistic lock: อัปเดตเฉพาะเมื่อ Version/Status ยังตรง กันกดซ้ำและแก้พร้อมกัน
    // เปลี่ยนสถานะ + บันทึก log ใน transaction เดียว ไม่ให้สถานะเปลี่ยนโดยไม่มีประวัติ
    const changed = await prisma.$transaction(async (tx) => {
        const result = await tx.cM_Queue.updateMany({
            where: {
                QueueID: current.QueueID,
                Status: from,
                Version: params.expectedVersion ?? current.Version,
            },
            data: {
                Status: params.to,
                Version: { increment: 1 },
                ...(params.repairDetail != null ? { RepairDetail: params.repairDetail.trim() } : {}),
                ...(from === 'WAITING_CALL' && params.to !== 'CANCELLED' && params.to !== 'NO_SHOW' ? { CalledDate: new Date() } : {}),
            },
        });
        if (result.count === 0) return false;
        await tx.cM_QueueLog.create({
            data: {
                QueueID: current.QueueID,
                FromStatus: from,
                ToStatus: params.to,
                ActionBy: params.actor.id,
                ActionByName: params.actor.name,
                Note: params.note ?? null,
            },
        });
        return true;
    });
    if (!changed) {
        return { ok: false, code: 'CONFLICT', message: 'ข้อมูลคิวถูกเปลี่ยนแปลงแล้ว กรุณารีเฟรช' };
    }
    publishQueueChange(current.BranchID);
    const queue = await prisma.cM_Queue.findUniqueOrThrow({ where: { QueueID: current.QueueID } });
    return { ok: true, queue };
}
