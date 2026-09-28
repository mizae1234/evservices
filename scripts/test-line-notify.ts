// End-to-end test ของระบบแจ้งเตือนคิวจอง (in-app + LINE OA)
//
// รันกับ LOCAL database เท่านั้น — สร้างข้อมูลทดสอบ ตรวจผล แล้วลบทิ้งทั้งหมด
//   npm run test:notify
//
// ถ้าตั้ง TEST_LINE_USER_ID=<LINE userId จริง> จะส่งข้อความจริงเข้า LINE ด้วย
//   TEST_LINE_USER_ID=Uxxxx npm run test:notify

import fs from 'fs';

// ts-node ไม่โหลด .env ให้อัตโนมัติ (ต่างจาก Next/Prisma) จึงต้องอ่านเองก่อน import module ที่ใช้ env
for (const line of fs.readFileSync('.env', 'utf8').split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
}

import { PrismaClient } from '@prisma/client';
import { formatCustomerPhone, maskCustomerName, notifyBookingEvent, resolveBookingRecipients, type BookingEventType } from '../src/lib/booking-notify';
import {
    bookingFlexMessage,
    getLinkUrl,
    isLiffConfigured,
    isLineConfigured,
    linkAccountMessage,
    textMessage,
    verifyLineIdToken,
    LINE_CHANNEL_ACCESS_TOKEN,
    LINE_LIFF_ID,
} from '../src/lib/line';

const prisma = new PrismaClient();

const TEST_PREFIX = 'TEST-NOTI-';
const FAKE_LINE_PREFIX = 'Utest0000';

let passed = 0;
let failed = 0;

const c = {
    green: (s: string) => `\x1b[32m${s}\x1b[0m`,
    red: (s: string) => `\x1b[31m${s}\x1b[0m`,
    dim: (s: string) => `\x1b[2m${s}\x1b[0m`,
    bold: (s: string) => `\x1b[1m${s}\x1b[0m`,
};

function check(label: string, actual: string[], expected: string[]) {
    const a = [...actual].sort();
    const e = [...expected].sort();
    const ok = a.length === e.length && a.every((v, i) => v === e[i]);

    if (ok) {
        passed++;
        console.log(`  ${c.green('✓')} ${label}`);
        console.log(`    ${c.dim('→ ' + (a.length ? a.join(', ') : '(ไม่มีใครได้รับ)'))}`);
    } else {
        failed++;
        console.log(`  ${c.red('✗')} ${label}`);
        console.log(`    ${c.red('คาดหวัง:')} ${e.join(', ') || '(ว่าง)'}`);
        console.log(`    ${c.red('ได้จริง :')} ${a.join(', ') || '(ว่าง)'}`);
    }
}

/**
 * ตรวจรูปแบบข้อความกับ LINE API โดยไม่ส่งจริง
 *
 * สำคัญ: ถ้า LINE ปฏิเสธข้อความ (เช่น template text เกิน 60 ตัวอักษร) ผู้ใช้จะ
 * "ไม่เห็นอะไรเลย" โดยไม่มี error ฝั่งผู้ใช้ — เคยเกิดมาแล้วกับการ์ดผูกบัญชี
 */
async function validateMessage(label: string, messages: unknown[]) {
    if (!isLineConfigured()) {
        console.log(`  ${c.dim('–')} ${label} ${c.dim('(ข้าม: ไม่ได้ตั้งค่า LINE)')}`);
        return;
    }
    const res = await fetch('https://api.line.me/v2/bot/message/validate/push', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${LINE_CHANNEL_ACCESS_TOKEN}` },
        body: JSON.stringify({ messages }),
    });
    if (res.status === 200) {
        passed++;
        console.log(`  ${c.green('✓')} ${label}`);
    } else {
        failed++;
        console.log(`  ${c.red('✗')} ${label} → ${res.status} ${(await res.text()).slice(0, 160)}`);
    }
}

/**
 * ตาราง CM_UserLineLink มีการผูกบัญชีจริงของผู้ใช้อยู่ — เทสต้องไม่ทำของจริงหาย
 * จึงสำรองไว้ก่อน ลบออกเพื่อให้เทสเริ่มจากสถานะสะอาด แล้วคืนกลับตอนจบ
 */
type LinkSnapshot = {
    UserID: number; LineUserID: string; DisplayName: string | null; PictureUrl: string | null;
    NotifyEnabled: boolean; IsActive: boolean; LinkedDate: Date;
};
let linkSnapshot: LinkSnapshot[] | null = null;

async function snapshotRealLinks() {
    linkSnapshot = await prisma.cM_UserLineLink.findMany({
        select: {
            UserID: true, LineUserID: true, DisplayName: true, PictureUrl: true,
            NotifyEnabled: true, IsActive: true, LinkedDate: true,
        },
    });
    if (linkSnapshot.length > 0) {
        console.log(c.dim(`   สำรองการผูกบัญชีจริงไว้ ${linkSnapshot.length} รายการ (จะคืนกลับตอนจบ)`));
        await prisma.cM_UserLineLink.deleteMany({});
    }
}

async function restoreRealLinks() {
    if (!linkSnapshot || linkSnapshot.length === 0) return;
    await prisma.cM_UserLineLink.deleteMany({});
    for (const l of linkSnapshot) {
        await prisma.cM_UserLineLink.create({ data: l });
    }
    console.log(c.dim(`   คืนการผูกบัญชีจริงกลับแล้ว ${linkSnapshot.length} รายการ`));
    linkSnapshot = null;
}

/**
 * การส่ง LINE ทำแบบ fire-and-forget แล้ว (ไม่บล็อก request ของผู้ใช้)
 * outbox จึงถูกเขียนหลัง notifyBookingEvent คืนค่า — เทสต้องรอให้แถวโผล่
 */
async function waitForOutbox(bookingId: number, timeoutMs = 8000) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        const rows = await prisma.cM_LineMessageLog.findMany({ where: { BookingID: bookingId } });
        if (rows.length > 0) return rows;
        await new Promise((r) => setTimeout(r, 200));
    }
    return [];
}

async function cleanup() {
    const testBookings = await prisma.cM_Booking.findMany({
        where: { BookingNo: { startsWith: TEST_PREFIX } },
        select: { BookingID: true },
    });
    const ids = testBookings.map((b) => b.BookingID);

    if (ids.length > 0) {
        await prisma.cM_LineMessageLog.deleteMany({ where: { BookingID: { in: ids } } });
        await prisma.cM_Notification.deleteMany({ where: { BookingID: { in: ids } } });
        await prisma.cM_BookingLog.deleteMany({ where: { BookingID: { in: ids } } });
        await prisma.cM_Booking.deleteMany({ where: { BookingID: { in: ids } } });
    }
    await prisma.cM_UserLineLink.deleteMany({ where: { LineUserID: { startsWith: FAKE_LINE_PREFIX } } });
    await restoreRealLinks();
}

/** ใครได้รับ in-app notification ของการจองนี้บ้าง */
async function notifiedEmails(bookingId: number): Promise<string[]> {
    const rows = await prisma.cM_Notification.findMany({
        where: { BookingID: bookingId },
        select: { User: { select: { Email: true } } },
    });
    return rows.map((r) => r.User.Email);
}

async function main() {
    const url = process.env.DATABASE_URL || '';
    if (!/(localhost|127\.0\.0\.1|host\.docker\.internal|mssql-dev)/.test(url)) {
        throw new Error('ปฏิเสธการรัน: DATABASE_URL ไม่ใช่ฐานข้อมูล local');
    }

    console.log(c.bold('\n🧪 ทดสอบระบบแจ้งเตือนคิวจอง (local database)\n'));
    console.log(`   LINE configured: ${isLineConfigured() ? c.green('yes') : c.dim('no (จะข้ามการส่งจริง)')}`);

    await cleanup();
    await snapshotRealLinks();

    // --- โหลด master data ---
    const users = await prisma.cM_User.findMany({
        select: { UserID: true, Email: true, BranchID: true, Role: { select: { RoleCode: true } } },
    });
    const byEmail = Object.fromEntries(users.map((u) => [u.Email, u]));
    const branches = await prisma.cM_MsServiceBranch.findMany({ select: { BranchID: true, BranchName: true, BranchCode: true } });
    const byCode = Object.fromEntries(branches.map((b) => [b.BranchCode, b]));

    const ladprao = byCode['BR003'];
    const minburi = byCode['BR001'];

    if (!ladprao || !minburi || !byEmail['ladprao@demo.com']) {
        throw new Error('ไม่พบข้อมูลตั้งต้น — รัน npm run db:seed:dev ก่อน');
    }

    let seq = 0;
    async function makeBooking(branchId: number, bookingType: string, customerName = 'ทดสอบ ระบบแจ้งเตือน') {
        seq++;
        return prisma.cM_Booking.create({
            data: {
                BookingNo: `${TEST_PREFIX}${Date.now()}-${seq}`,
                BookingDate: new Date(Date.UTC(2026, 8, 20)),
                StartTime: '09:00',
                EndTime: '11:00',
                CustomerName: customerName,
                CustomerPhone: '0812345678',
                CarModel: 'AION Y PLUS',
                CarRegister: 'ทส1234',
                BranchID: branchId,
                BookingType: bookingType,
                CreateBy: byEmail['admin@demo.com'].UserID,
                Status: 0,
            },
        });
    }

    // ==========================================================
    console.log(c.bold('\n00. LIFF / การยืนยันตัวตนตอนผูกบัญชี'));
    // ==========================================================
    {
        const liffOn = isLiffConfigured();
        console.log(`  ${c.dim('LIFF: ' + (liffOn ? 'เปิดใช้งาน (บังคับ ID token)' : 'ยังไม่ได้ตั้งค่า (ใช้ token อย่างเดียว)'))}`);

        // ลิงก์ที่ส่งเข้า LINE ต้องเป็น liff.line.me เมื่อตั้ง LIFF ID แล้ว
        const url = getLinkUrl('abc123');
        const expectsLiffUrl = Boolean(LINE_LIFF_ID);
        const isLiffUrl = (url || '').startsWith('https://liff.line.me/');
        if (isLiffUrl === expectsLiffUrl) {
            passed++;
            console.log(`  ${c.green('✓')} ลิงก์ผูกบัญชีชี้ถูกปลายทาง`);
            console.log(`    ${c.dim('→ ' + url)}`);
        } else {
            failed++;
            console.log(`  ${c.red('✗')} ลิงก์ผูกบัญชีผิดปลายทาง → ${url}`);
        }

        // ID token ปลอม/ว่าง ต้องไม่ผ่านเด็ดขาด
        for (const [label, bad] of [['ว่าง', ''], ['ปลอม', 'eyJhbGciOiJIUzI1NiJ9.fake.signature']] as const) {
            const res = await verifyLineIdToken(bad);
            if (res === null) {
                passed++;
                console.log(`  ${c.green('✓')} ID token ${label} ถูกปฏิเสธ`);
            } else {
                failed++;
                console.log(`  ${c.red('✗')} ID token ${label} ผ่านได้ (ไม่ควรเกิดขึ้น)`);
            }
        }
    }

    // ==========================================================
    console.log(c.bold('\n0a. ปิดบังนามสกุลลูกค้า (ข้อมูลที่ออกนอกระบบ)'));
    // ==========================================================
    {
        const maskCases: [string, string][] = [
            ['นายสมชาย ใจดี', 'นายสมชาย ***'],
            ['นางสาวสุดา สวยงาม', 'นางสาวสุดา ***'],
            ['นาย สมชาย ใจดี', 'นาย สมชาย ***'],
            ['สมชาย', 'สมชาย'],
            ['John Smith', 'John ***'],
            ['', '-'],
        ];
        for (const [input, expect] of maskCases) {
            check(`ปิดบัง "${input || '(ว่าง)'}"`, [maskCustomerName(input)], [expect]);
        }

        // เบอร์โทรแสดงเต็มโดยตั้งใจ เพื่อให้ CS กดโทรออกได้จากการ์ด
        const phoneCases: [string | null, string[]][] = [
            ['0812345678', ['081-234-5678', 'tel:0812345678']],
            ['081-234-5678', ['081-234-5678', 'tel:0812345678']],
            ['021234567', ['02-123-4567', 'tel:021234567']],
            // ไม่มีเบอร์ → ไม่คืนค่า (แถวเบอร์โทรจะไม่ถูกใส่ในการ์ด)
            ['', []],
            [null, []],
        ];
        for (const [input, expect] of phoneCases) {
            const got = formatCustomerPhone(input);
            check(
                `เบอร์ "${input ?? '(null)'}" → แสดง + ลิงก์โทร`,
                got ? [got.display, got.telUri] : [],
                expect
            );
        }

        // ต้องไม่มีนามสกุลจริงหลุดไปกับ in-app notification
        const booking = await makeBooking(ladprao.BranchID, 'EV7', 'นายสมชาย นามสกุลลับ');
        await notifyBookingEvent({ event: 'CREATED', booking, actorName: 'ผู้ดูแลระบบ' });
        const noti = await prisma.cM_Notification.findFirst({
            where: { BookingID: booking.BookingID }, select: { Message: true },
        });
        const leaked = (noti?.Message || '').includes('นามสกุลลับ');
        if (leaked) {
            failed++;
            console.log(`  ${c.red('✗')} นามสกุลจริงหลุดไปกับข้อความแจ้งเตือน`);
        } else {
            passed++;
            console.log(`  ${c.green('✓')} ข้อความแจ้งเตือนไม่มีนามสกุลจริง`);
            console.log(`    ${c.dim('→ ' + noti?.Message)}`);
        }
    }

    // ==========================================================
    console.log(c.bold('\n0b. LINE ยอมรับรูปแบบข้อความทุกแบบหรือไม่ (ตรวจกับ LINE API, ไม่ส่งจริง)'));
    // ==========================================================
    {
        const linkUrl = 'https://example.com/line/link?token=validation-only';
        await validateMessage('ข้อความต้อนรับ + การ์ดผูกบัญชี (ตอน follow)', [
            textMessage('ยินดีต้อนรับสู่ EV Services 🚗⚡\n\nกรุณาผูกบัญชีเพื่อรับการแจ้งเตือนคิวจองของสาขาคุณ'),
            linkAccountMessage(linkUrl),
        ]);

        // การ์ดแจ้งเตือนแบบยาวที่สุดเท่าที่ระบบจะสร้างได้
        await validateMessage('การ์ดแจ้งเตือนคิว (ทุกแถว + footer + ปุ่ม)', [
            bookingFlexMessage({
                headerIcon: '📅',
                headerText: 'เลื่อนนัดหมาย',
                headerColor: '#F59E0B',
                softColor: '#FFFBEB',
                bookingNo: 'BKG-20260920-0001',
                dateText: '20 ก.ย. 69',
                timeText: '09:00 - 11:00 น.',
                rows: [
                    { label: 'ลูกค้า', value: 'คุณสมชาย ***', highlight: 'strong' },
                    { label: 'เบอร์โทร', value: '📞 081-234-5678', highlight: 'link', action: { type: 'uri', label: 'โทร', uri: 'tel:0812345678' } },
                    { label: 'ทะเบียน', value: 'กข1234 (AION Y PLUS)', highlight: 'strong' },
                    { label: 'สาขา', value: 'สาขาลาดพร้าว' },
                    { label: 'ช่องซ่อม', value: 'ช่องที่ 2' },
                    { label: 'บริการ', value: 'เช็คระยะ + ซ่อม' },
                    { label: 'นัดเดิม', value: '14 ก.ย. 69 13:00-15:00 น.', highlight: 'muted' },
                    { label: 'เหตุผล', value: 'ลูกค้าขอเลื่อนเนื่องจากติดธุระด่วน', highlight: 'warn' },
                    { label: 'โดย', value: 'เจ้าหน้าที่ สาขาลาดพร้าว', highlight: 'muted' },
                ],
                footerNote: 'หมายเหตุ: ลูกค้ายืนยันทางโทรศัพท์แล้ว',
                detailUrl: 'https://example.com/service-center/bookings?bookingId=1',
                altText: 'เลื่อนนัดหมาย BKG-20260920-0001',
            }),
        ]);

        await validateMessage('การ์ดแจ้งเตือนคิว (แถวเดียว ไม่มีปุ่ม)', [
            bookingFlexMessage({
                headerIcon: '✅',
                headerText: 'อนุมัติคิวแล้ว',
                headerColor: '#16A34A',
                bookingNo: 'BKG-20260920-0002',
                rows: [{ label: 'ลูกค้า', value: 'คุณสมหญิง', highlight: 'strong' }],
                altText: 'อนุมัติคิว',
            }),
        ]);
    }

    // ==========================================================
    console.log(c.bold('\n1. การจองของสาขาลาดพร้าว (EV7) — สร้างโดยเจ้าหน้าที่ลาดพร้าว'));
    // ==========================================================
    {
        const booking = await makeBooking(ladprao.BranchID, 'EV7');
        await notifyBookingEvent({
            event: 'CREATED',
            booking,
            actorName: 'เจ้าหน้าที่ สาขาลาดพร้าว',
        });

        check(
            'แจ้ง admin + CS + เจ้าหน้าที่ลาดพร้าวเอง (คนกด action ได้รับด้วย) และไม่รั่วไปสาขาอื่น',
            await notifiedEmails(booking.BookingID),
            ['admin@demo.com', 'cs@demo.com', 'ladprao@demo.com']
        );
    }

    // ==========================================================
    console.log(c.bold('\n2. การจองของสาขามีนบุรี (EV7) — สร้างโดย admin'));
    // ==========================================================
    {
        const booking = await makeBooking(minburi.BranchID, 'EV7');
        await notifyBookingEvent({
            event: 'CREATED',
            booking,
            actorName: 'ผู้ดูแลระบบ',
        });

        check(
            'เจ้าหน้าที่มีนบุรี + admin (คนกด) ได้รับ แต่ลาดพร้าวต้องไม่ได้รับ',
            await notifiedEmails(booking.BookingID),
            ['admin@demo.com', 'minburi@demo.com', 'cs@demo.com']
        );
    }

    // ==========================================================
    console.log(c.bold('\n3. การจองประเภท LINEMAN ที่สาขาลาดพร้าว — สร้างโดย CS ส่วนกลาง'));
    // ==========================================================
    {
        const booking = await makeBooking(ladprao.BranchID, 'LINEMAN');
        await notifyBookingEvent({
            event: 'CREATED',
            booking,
            actorName: 'CS ส่วนกลาง',
        });

        check(
            'CS_LINEMAN ได้รับด้วย (ตรงประเภท) + สาขาเจ้าของคิว + admin + CS ที่กด action',
            await notifiedEmails(booking.BookingID),
            ['admin@demo.com', 'ladprao@demo.com', 'cs.lineman@demo.com', 'cs@demo.com']
        );
    }

    // ==========================================================
    console.log(c.bold('\n4. CS_LINEMAN ต้องไม่เห็นคิว EV7'));
    // ==========================================================
    {
        const booking = await makeBooking(minburi.BranchID, 'EV7');
        await notifyBookingEvent({ event: 'APPROVED', booking });
        const got = await notifiedEmails(booking.BookingID);

        check(
            'คิว EV7 ไม่ถูกส่งไปหา CS_LINEMAN',
            got.filter((e) => e === 'cs.lineman@demo.com'),
            []
        );
        check('ผู้รับคิว EV7 ของมีนบุรี', got, [
            'admin@demo.com',
            'minburi@demo.com',
            'cs@demo.com',
        ]);
    }

    // ==========================================================
    console.log(c.bold('\n5. รายการปิดช่องซ่อมชั่วคราว — ต้องไม่แจ้งเตือนใครเลย'));
    // ==========================================================
    {
        const booking = await makeBooking(ladprao.BranchID, 'EV7', '[ปิดช่องซ่อมชั่วคราว]');
        await notifyBookingEvent({ event: 'CREATED', booking });
        check('ไม่มีการแจ้งเตือนสำหรับการปิดช่องซ่อม', await notifiedEmails(booking.BookingID), []);
    }

    // ==========================================================
    console.log(c.bold('\n6. การเลือกปลายทาง LINE (ใครที่ผูกบัญชีแล้วเท่านั้นจึงถูกส่ง)'));
    // ==========================================================
    {
        // ผูกบัญชี LINE ปลอมให้ ladprao + minburi, ส่วน minburi ปิดแจ้งเตือนไว้
        await prisma.cM_UserLineLink.create({
            data: { UserID: byEmail['ladprao@demo.com'].UserID, LineUserID: `${FAKE_LINE_PREFIX}ladprao`, NotifyEnabled: true, IsActive: true },
        });
        await prisma.cM_UserLineLink.create({
            data: { UserID: byEmail['minburi@demo.com'].UserID, LineUserID: `${FAKE_LINE_PREFIX}minburi`, NotifyEnabled: false, IsActive: true },
        });
        await prisma.cM_UserLineLink.create({
            data: { UserID: byEmail['admin@demo.com'].UserID, LineUserID: `${FAKE_LINE_PREFIX}admin`, NotifyEnabled: true, IsActive: false },
        });

        const recipients = await resolveBookingRecipients({
            branchId: ladprao.BranchID,
            bookingType: 'EV7',
        });

        const withLine = recipients.filter((r) => r.LineUserID).map((r) => r.FullName);
        check(
            'ส่ง LINE เฉพาะคนที่ผูกบัญชี + เปิดแจ้งเตือน + ไม่ได้บล็อก OA',
            withLine,
            ['เจ้าหน้าที่ สาขาลาดพร้าว']
        );

        // minburi ผูกไว้แต่ปิดแจ้งเตือน / admin ผูกไว้แต่บล็อก OA → ยังอยู่ในรายชื่อ in-app แต่ไม่มีปลายทาง LINE
        check(
            'คนที่ปิดแจ้งเตือน/บล็อก OA ยังได้รับ in-app แต่ไม่ถูกส่ง LINE',
            recipients.filter((r) => !r.LineUserID).map((r) => r.FullName).sort(),
            ['CS ส่วนกลาง', 'ผู้ดูแลระบบ'].sort()
        );
    }

    // ==========================================================
    console.log(c.bold('\n7. การส่ง LINE ล้มเหลว ต้องไม่ทำให้ action พัง + ต้องบันทึก outbox'));
    // ==========================================================
    {
        const booking = await makeBooking(ladprao.BranchID, 'EV7');

        // ตอนนี้ ladprao มีปลายทาง LINE ปลอมอยู่ → LINE API จะตอบ error กลับมา
        await notifyBookingEvent({
            event: 'CANCELLED',
            booking,
            actorName: 'ผู้ดูแลระบบ',
            reason: 'ลูกค้าแจ้งยกเลิก',
        });
        console.log(`  ${c.green('✓')} notifyBookingEvent ไม่ throw แม้ LINE API ตอบ error`);
        passed++;

        const logs = await waitForOutbox(booking.BookingID);

        if (logs.length > 0) {
            passed++;
            console.log(`  ${c.green('✓')} บันทึก CM_LineMessageLog แล้ว ${logs.length} รายการ`);
            console.log(`    ${c.dim('EventType: ' + logs[0].EventType)}`);
            console.log(`    ${c.dim('Title    : ' + logs[0].Title)}`);
            console.log(`    ${c.dim('IsSuccess: ' + logs[0].IsSuccess)}`);
            console.log(`    ${c.dim('ErrorMsg : ' + (logs[0].ErrorMsg || '-').slice(0, 110))}`);
        } else {
            failed++;
            console.log(`  ${c.red('✗')} ไม่พบ CM_LineMessageLog`);
        }
    }

    // ==========================================================
    console.log(c.bold('\n8. ข้อความที่ผู้ใช้จะเห็น (ทุก event)'));
    // ==========================================================
    {
        const booking = await makeBooking(ladprao.BranchID, 'EV7');
        const events: BookingEventType[] = [
            'CREATED', 'AUTO_APPROVED', 'APPROVED', 'REJECTED', 'CANCELLED',
            'RESCHEDULED', 'DURATION_CHANGED', 'BAY_CHANGED', 'UPDATED',
            'CLAIMED', 'COMPLETED', 'CS_STATUS',
        ];

        for (const event of events) {
            await prisma.cM_Notification.deleteMany({ where: { BookingID: booking.BookingID } });
            await notifyBookingEvent({
                event,
                booking,
                actorName: 'ผู้ดูแลระบบ',
                bayName: 'ช่องที่ 2',
                serviceTypeName: 'เช็คระยะ + ซ่อม',
                reason: event === 'CANCELLED' ? 'ลูกค้าแจ้งยกเลิก' : null,
            });
            const noti = await prisma.cM_Notification.findFirst({
                where: { BookingID: booking.BookingID },
                select: { Title: true, Message: true, Type: true },
            });
            console.log(`  ${c.dim(event.padEnd(17))} ${noti?.Title}`);
            console.log(`  ${' '.repeat(17)} ${c.dim(noti?.Message || '')}`);
        }
        passed++;
    }

    // ==========================================================
    // ส่งจริง (ต้องระบุ TEST_LINE_USER_ID เอง)
    // ==========================================================
    const realLineUserId = process.env.TEST_LINE_USER_ID;
    if (realLineUserId) {
        console.log(c.bold('\n9. ส่งข้อความจริงเข้า LINE'));
        const testUser = byEmail['ladprao@demo.com'];
        await prisma.cM_UserLineLink.deleteMany({ where: { UserID: testUser.UserID } });
        await prisma.cM_UserLineLink.create({
            data: { UserID: testUser.UserID, LineUserID: realLineUserId, NotifyEnabled: true, IsActive: true },
        });

        const booking = await makeBooking(ladprao.BranchID, 'EV7', 'คุณทดสอบ ระบบจริง');
        await notifyBookingEvent({
            event: 'APPROVED',
            booking,
            actorName: 'ผู้ดูแลระบบ',
            bayName: 'ช่องที่ 2',
            serviceTypeName: 'เช็คระยะ + ซ่อม',
        });

        const log = await prisma.cM_LineMessageLog.findFirst({
            where: { BookingID: booking.BookingID },
            orderBy: { LogID: 'desc' },
        });
        if (log?.IsSuccess) {
            passed++;
            console.log(`  ${c.green('✓')} ส่งสำเร็จ — เช็คในแชท LINE ได้เลย`);
        } else {
            failed++;
            console.log(`  ${c.red('✗')} ส่งไม่สำเร็จ: ${log?.ErrorMsg}`);
        }
        await prisma.cM_UserLineLink.deleteMany({ where: { LineUserID: realLineUserId } });
    } else {
        console.log(c.dim('\n9. ข้ามการส่งจริง (ตั้ง TEST_LINE_USER_ID=<LINE userId> เพื่อทดสอบส่งเข้า LINE จริง)'));
    }

    await cleanup();

    console.log(c.bold(`\n${'─'.repeat(60)}`));
    console.log(c.bold(`ผลรวม: ${c.green(passed + ' passed')}${failed ? ', ' + c.red(failed + ' failed') : ''}`));
    console.log(c.dim('ข้อมูลทดสอบถูกลบออกหมดแล้ว\n'));

    if (failed > 0) process.exit(1);
}

main()
    .catch(async (e) => {
        console.error(c.red('\n❌ Test failed: ' + e.message));
        await cleanup().catch(() => {});
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
