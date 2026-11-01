// Admin: เปลี่ยนสถานะคิว (เดินหน้าทีละขั้น + ยกเลิก/ไม่พบลูกค้า) พร้อม optimistic lock

import { NextRequest, NextResponse } from 'next/server';
import { getQueueUser } from '@/lib/queue-auth';
import { changeQueueStatus } from '@/lib/queue-service';
import { isQueueStatus } from '@/lib/queue-status';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const auth = await getQueueUser();
    if ('error' in auth) return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    if (!isQueueStatus(body.to)) {
        return NextResponse.json({ success: false, error: 'สถานะไม่ถูกต้อง' }, { status: 400 });
    }
    const result = await changeQueueStatus({
        queueId: Number(id),
        to: body.to,
        expectedVersion: typeof body.expectedVersion === 'number' ? body.expectedVersion : undefined,
        repairDetail: typeof body.repairDetail === 'string' ? body.repairDetail : undefined,
        note: typeof body.note === 'string' ? body.note.slice(0, 500) : undefined,
        actor: { id: auth.user.id, name: auth.user.name },
        branchGuard: auth.guard,
    });
    if (!result.ok) {
        const status = result.code === 'NOT_FOUND' ? 404 : result.code === 'CONFLICT' ? 409 : 400;
        return NextResponse.json({ success: false, error: result.message, code: result.code }, { status });
    }
    return NextResponse.json({ success: true, data: result.queue });
}
