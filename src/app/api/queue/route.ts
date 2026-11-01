// Admin: รายการคิวตามสาขาและวันที่

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getQueueUser } from '@/lib/queue-auth';
import { sweepStaleQueuesThrottled } from '@/lib/queue-maintenance';
import { getTodayQueueDate } from '@/lib/queue-service';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
    const auth = await getQueueUser();
    if ('error' in auth) return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });

    const sp = request.nextUrl.searchParams;
    const requested = sp.get('branchId') ? Number(sp.get('branchId')) : auth.user.branchId;
    if (!requested || Number.isNaN(requested) || !auth.guard(requested)) {
        return NextResponse.json({ success: false, error: 'ไม่มีสิทธิ์เข้าถึงสาขานี้' }, { status: 403 });
    }

    await sweepStaleQueuesThrottled();
    let queueDate = getTodayQueueDate();
    const dateStr = sp.get('date');
    if (dateStr) {
        const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr);
        if (!m) return NextResponse.json({ success: false, error: 'รูปแบบวันที่ไม่ถูกต้อง' }, { status: 400 });
        queueDate = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
    }

    const queues = await prisma.cM_Queue.findMany({
        where: { BranchID: requested, QueueDate: queueDate },
        orderBy: { CheckInDate: 'asc' },
        include: {
            ServiceType: { select: { Name: true } },
            Booking: { select: { BookingNo: true, StartTime: true, EndTime: true, ClaimDetail: true, CarModel: true } },
        },
    });
    return NextResponse.json({ success: true, data: queues });
}
