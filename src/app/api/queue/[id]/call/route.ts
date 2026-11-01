// Admin: ประกาศเรียกคิว (ส่งเสียงเรียกไปที่หน้า Monitor ของสาขา)

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getQueueUser } from '@/lib/queue-auth';
import { publishQueueCall } from '@/lib/queue-events';
import { ACTIVE_STATUSES } from '@/lib/queue-status';
import { getQueueChannel } from '@/lib/queue-channel';
import { rateLimit } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const auth = await getQueueUser();
    if ('error' in auth) return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
    const { id } = await params;
    const queue = await prisma.cM_Queue.findUnique({ where: { QueueID: Number(id) } });
    if (!queue || !auth.guard(queue.BranchID)) return NextResponse.json({ success: false, error: 'ไม่พบคิว' }, { status: 404 });
    if (!ACTIVE_STATUSES.includes(queue.Status as never)) {
        return NextResponse.json({ success: false, error: 'คิวนี้ปิดแล้ว ไม่สามารถประกาศเรียกได้' }, { status: 400 });
    }
    // กันกดรัว: เรียกคิวเดียวกันได้ทุก 3 วินาที
    if (!rateLimit(`call:${queue.QueueID}`, 1, 3000)) {
        return NextResponse.json({ success: false, error: 'เพิ่งประกาศไปแล้ว กรุณารอสักครู่' }, { status: 429 });
    }
    const channel = await getQueueChannel(queue.BranchID, queue.Status);
    publishQueueCall(queue.BranchID, {
        id: `${queue.QueueID}-${Date.now()}`,
        label: queue.QueueLabel,
        plate: queue.CarRegister,
        ...(channel ? { channel } : {}),
    });
    await prisma.cM_QueueLog.create({
        data: { QueueID: queue.QueueID, FromStatus: queue.Status, ToStatus: queue.Status, ActionBy: auth.user.id, ActionByName: auth.user.name, Note: channel ? `ประกาศเรียกคิว (${channel.name} ${channel.no})` : 'ประกาศเรียกคิว' },
    });
    return NextResponse.json({ success: true });
}
