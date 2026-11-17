// Public: ลูกค้ายกเลิกการจองของตัวเอง (เฉพาะคิวที่รออนุมัติ/ยืนยันแล้ว)

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { notifyBookingEvent } from '@/lib/booking-notify';
import { getClientIp, rateLimit } from '@/lib/rate-limit';
import { parseBookingKey } from '@/lib/queue-token';
import { toBookingView } from '@/lib/self-booking';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest, { params }: { params: Promise<{ key: string }> }) {
    if (!rateLimit(`pbook-cancel:${getClientIp(request)}`, 10, 60_000)) {
        return NextResponse.json({ success: false, error: 'คำขอมากเกินไป กรุณาลองใหม่ภายหลัง' }, { status: 429 });
    }
    try {
        const id = parseBookingKey(decodeURIComponent((await params).key));
        if (!id) return NextResponse.json({ success: false, error: 'ไม่พบการจอง' }, { status: 404 });

        // เลยเวลานัดหมายแล้วยกเลิกไม่ได้ (ให้สาขาดูแลต่อ)
        const current = await prisma.cM_Booking.findUnique({
            where: { BookingID: id },
            include: { Branch: { select: { BranchName: true } }, ServiceType: { select: { Name: true } } },
        });
        if (!current) return NextResponse.json({ success: false, error: 'ไม่พบการจอง' }, { status: 404 });
        if (toBookingView(current).expired) {
            return NextResponse.json({ success: false, error: 'การจองนี้เลยเวลานัดหมายแล้ว ไม่สามารถยกเลิกได้ หากต้องการจองใหม่ให้เลือกเวลาใหม่ได้เลย' }, { status: 400 });
        }

        // อัปเดตแบบมีเงื่อนไขสถานะ กันกดซ้ำ/แข่งกับการอนุมัติ
        const { count } = await prisma.cM_Booking.updateMany({ where: { BookingID: id, Status: { in: [0, 1] } }, data: { Status: 2 } });
        const booking = await prisma.cM_Booking.findUnique({
            where: { BookingID: id },
            include: { Branch: { select: { BranchName: true } }, ServiceType: { select: { Name: true } }, Bay: { select: { BayName: true } } },
        });
        if (!booking) return NextResponse.json({ success: false, error: 'ไม่พบการจอง' }, { status: 404 });
        if (count === 0) return NextResponse.json({ success: false, error: 'การจองนี้ไม่สามารถยกเลิกได้แล้ว' }, { status: 400 });

        await prisma.cM_BookingLog.create({
            data: { BookingID: id, LogType: 'CANCEL', Content: 'ลูกค้ายกเลิกการจองเองผ่านหน้าเว็บ', CreateBy: 'ลูกค้าจองเอง' },
        });
        await notifyBookingEvent({
            event: 'CANCELLED',
            booking,
            actorName: 'ลูกค้า',
            branchName: booking.Branch?.BranchName ?? null,
            reason: 'ลูกค้ายกเลิกการจองเอง',
            bayName: booking.Bay?.BayName || null,
            serviceTypeName: booking.ServiceType?.Name || null,
        });
        return NextResponse.json({ success: true, data: { booking: toBookingView(booking) }, message: 'ยกเลิกการจองเรียบร้อยแล้ว' });
    } catch (error) {
        console.error('Public booking cancel error:', error);
        return NextResponse.json({ success: false, error: 'ไม่สามารถยกเลิกการจองได้' }, { status: 500 });
    }
}
