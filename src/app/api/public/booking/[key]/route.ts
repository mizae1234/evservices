// Public: ดูสถานะคิวที่ลูกค้าจองเอง (bearer key; ไม่ส่งชื่อ/เบอร์กลับ)

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getClientIp, rateLimit } from '@/lib/rate-limit';
import { parseBookingKey } from '@/lib/queue-token';
import { toBookingView } from '@/lib/self-booking';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest, { params }: { params: Promise<{ key: string }> }) {
    if (!rateLimit(`pbook-status:${getClientIp(request)}`, 600, 60_000)) {
        return NextResponse.json({ success: false, error: 'คำขอมากเกินไป กรุณาลองใหม่ภายหลัง' }, { status: 429 });
    }
    const id = parseBookingKey(decodeURIComponent((await params).key));
    if (!id) return NextResponse.json({ success: false, error: 'ไม่พบการจอง' }, { status: 404 });
    const booking = await prisma.cM_Booking.findUnique({
        where: { BookingID: id },
        include: { Branch: { select: { BranchName: true } }, ServiceType: { select: { Name: true } } },
    });
    if (!booking) return NextResponse.json({ success: false, error: 'ไม่พบการจอง' }, { status: 404 });
    return NextResponse.json({ success: true, data: { booking: toBookingView(booking) } });
}
