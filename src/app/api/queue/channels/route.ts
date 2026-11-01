// Admin: ตั้งค่าช่องบริการต่อสถานะของสาขา (ใช้ตอนประกาศเรียกคิว)

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getQueueUser } from '@/lib/queue-auth';
import { CHANNEL_STATUSES } from '@/lib/queue-channel';

export const dynamic = 'force-dynamic';

function resolveBranch(auth: Exclude<Awaited<ReturnType<typeof getQueueUser>>, { error: string }>, raw: unknown) {
    const id = raw != null && raw !== '' ? Number(raw) : auth.user.branchId;
    if (!id || Number.isNaN(id) || !auth.guard(id)) return null;
    return id;
}

export async function GET(request: NextRequest) {
    const auth = await getQueueUser();
    if ('error' in auth) return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
    const branchId = resolveBranch(auth, request.nextUrl.searchParams.get('branchId'));
    if (!branchId) return NextResponse.json({ success: false, error: 'ไม่มีสิทธิ์เข้าถึงสาขานี้' }, { status: 403 });
    const rows = await prisma.cM_QueueChannel.findMany({ where: { BranchID: branchId } });
    return NextResponse.json({
        success: true,
        data: rows.map((r) => ({ status: r.Status, channelName: r.ChannelName, channelNo: r.ChannelNo })),
    });
}

export async function PUT(request: NextRequest) {
    const auth = await getQueueUser();
    if ('error' in auth) return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
    const body = await request.json().catch(() => ({}));
    const branchId = resolveBranch(auth, body.branchId);
    if (!branchId) return NextResponse.json({ success: false, error: 'ไม่มีสิทธิ์เข้าถึงสาขานี้' }, { status: 403 });
    if (!Array.isArray(body.channels)) return NextResponse.json({ success: false, error: 'ข้อมูลไม่ถูกต้อง' }, { status: 400 });

    const items: { status: string; name: string; no: string }[] = [];
    for (const c of body.channels) {
        const status = String(c?.status ?? '');
        const name = String(c?.channelName ?? '').trim();
        const no = String(c?.channelNo ?? '').trim();
        if (!CHANNEL_STATUSES.includes(status as never)) continue;
        if (name.length > 50 || no.length > 10) {
            return NextResponse.json({ success: false, error: 'ชื่อช่องยาวเกิน 50 ตัวอักษร หรือหมายเลขยาวเกิน 10 ตัวอักษร' }, { status: 400 });
        }
        items.push({ status, name, no });
    }

    await prisma.$transaction(
        items.map((i) =>
            // ไม่ระบุหมายเลข = ไม่ประกาศช่องสำหรับสถานะนั้น
            i.no === ''
                ? prisma.cM_QueueChannel.deleteMany({ where: { BranchID: branchId, Status: i.status } })
                : prisma.cM_QueueChannel.upsert({
                    where: { BranchID_Status: { BranchID: branchId, Status: i.status } },
                    update: { ChannelName: i.name || 'ช่องบริการ', ChannelNo: i.no },
                    create: { BranchID: branchId, Status: i.status, ChannelName: i.name || 'ช่องบริการ', ChannelNo: i.no },
                }),
        ),
    );
    return NextResponse.json({ success: true });
}
