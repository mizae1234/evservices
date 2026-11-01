// Admin: URL สำหรับ QR Check-in และหน้า Monitor ของสาขา (พร้อม token)

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getQueueUser } from '@/lib/queue-auth';
import { signBranchToken } from '@/lib/queue-token';
import { getAppBaseUrl } from '@/lib/line';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
    const auth = await getQueueUser();
    if ('error' in auth) return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
    const branchId = Number(request.nextUrl.searchParams.get('branchId') || auth.user.branchId);
    if (!branchId || !auth.guard(branchId)) return NextResponse.json({ success: false, error: 'ไม่มีสิทธิ์เข้าถึงสาขานี้' }, { status: 403 });
    const branch = await prisma.cM_MsServiceBranch.findUnique({ where: { BranchID: branchId }, select: { BranchCode: true, BranchName: true } });
    if (!branch) return NextResponse.json({ success: false, error: 'ไม่พบสาขา' }, { status: 404 });
    const base = getAppBaseUrl();
    const code = encodeURIComponent(branch.BranchCode);
    return NextResponse.json({
        success: true,
        data: {
            branchName: branch.BranchName,
            checkinUrl: `${base}/checkin/${code}?t=${signBranchToken(branch.BranchCode, 'checkin')}`,
            monitorUrl: `${base}/monitor/${code}?t=${signBranchToken(branch.BranchCode, 'monitor')}`,
        },
    });
}
