// Admin: รายละเอียดคิว + ประวัติ, บันทึกรายละเอียดงานซ่อม

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getQueueUser } from '@/lib/queue-auth';
import { publishQueueChange } from '@/lib/queue-events';
import { ACTIVE_STATUSES } from '@/lib/queue-status';

export const dynamic = 'force-dynamic';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const auth = await getQueueUser();
    if ('error' in auth) return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
    const { id } = await params;
    const queue = await prisma.cM_Queue.findUnique({
        where: { QueueID: Number(id) },
        include: { Logs: { orderBy: { CreateDate: 'desc' } }, ServiceType: { select: { Name: true } }, Booking: true },
    });
    if (!queue || !auth.guard(queue.BranchID)) return NextResponse.json({ success: false, error: 'ไม่พบคิว' }, { status: 404 });
    return NextResponse.json({ success: true, data: queue });
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const auth = await getQueueUser();
    if ('error' in auth) return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const queue = await prisma.cM_Queue.findUnique({ where: { QueueID: Number(id) } });
    if (!queue || !auth.guard(queue.BranchID)) return NextResponse.json({ success: false, error: 'ไม่พบคิว' }, { status: 404 });
    if (!ACTIVE_STATUSES.includes(queue.Status as never)) {
        return NextResponse.json({ success: false, error: 'คิวนี้ปิดแล้ว ไม่สามารถแก้ไขได้' }, { status: 400 });
    }
    if (typeof body.repairDetail !== 'string' || body.repairDetail.length > 4000) {
        return NextResponse.json({ success: false, error: 'รายละเอียดงานซ่อมไม่ถูกต้อง' }, { status: 400 });
    }
    const updated = await prisma.cM_Queue.update({
        where: { QueueID: queue.QueueID },
        data: { RepairDetail: body.repairDetail.trim(), Version: { increment: 1 }, NeedsReview: false },
    });
    publishQueueChange(queue.BranchID);
    return NextResponse.json({ success: true, data: updated });
}
