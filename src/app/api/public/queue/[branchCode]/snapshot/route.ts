// Public: สถานะคิวของสาขาสำหรับหน้าจอ Monitor — เลขคิว + สถานะ + ทะเบียนรถ (ไม่มีชื่อ/เบอร์โทร)

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { resolvePublicBranch } from '@/lib/queue-public';
import { getTodayQueueDate } from '@/lib/queue-service';
import { ACTIVE_STATUSES } from '@/lib/queue-status';
import { listQueueChannels } from '@/lib/queue-channel';
import { getClientIp, rateLimit } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest, { params }: { params: Promise<{ branchCode: string }> }) {
    if (!rateLimit(`snap:${getClientIp(request)}`, 120, 60_000)) {
        return NextResponse.json({ success: false, error: 'คำขอมากเกินไป' }, { status: 429 });
    }
    const { branchCode } = await params;
    const branch = await resolvePublicBranch(branchCode, 'monitor', request.nextUrl.searchParams.get('t'));
    if (!branch) return NextResponse.json({ success: false, error: 'ลิงก์ไม่ถูกต้อง' }, { status: 404 });

    const queues = await prisma.cM_Queue.findMany({
        where: { BranchID: branch.BranchID, QueueDate: getTodayQueueDate(), Status: { in: ACTIVE_STATUSES } },
        orderBy: { CheckInDate: 'asc' },
        select: { QueueLabel: true, Status: true, CarRegister: true, ServiceOther: true, ServiceType: { select: { Name: true } } },
    });
    return NextResponse.json({
        success: true,
        data: {
            branchName: branch.BranchName,
            // บริการ "อื่นๆ" แสดงเพียงคำว่าอื่นๆ (ไม่เปิดเผยข้อความที่ลูกค้าพิมพ์บนจอสาธารณะ)
            queues: queues.map((q) => ({ label: q.QueueLabel, status: q.Status, plate: q.CarRegister, service: q.ServiceType?.Name ?? 'อื่นๆ' })),
            channels: await listQueueChannels(branch.BranchID),
        },
    });
}
