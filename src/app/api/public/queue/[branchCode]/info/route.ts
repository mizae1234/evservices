// Public: ข้อมูลสาขา + ประเภทบริการสำหรับหน้า Check-in (ต้องมี QR token)

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { resolvePublicBranch } from '@/lib/queue-public';
import { getClientIp, rateLimit } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest, { params }: { params: Promise<{ branchCode: string }> }) {
    if (!rateLimit(`info:${getClientIp(request)}`, 60, 60_000)) {
        return NextResponse.json({ success: false, error: 'คำขอมากเกินไป กรุณาลองใหม่ภายหลัง' }, { status: 429 });
    }
    const { branchCode } = await params;
    const branch = await resolvePublicBranch(branchCode, 'checkin', request.nextUrl.searchParams.get('t'));
    if (!branch) {
        return NextResponse.json({ success: false, error: 'QR Code ไม่ถูกต้องหรือหมดอายุ' }, { status: 404 });
    }
    const serviceTypes = await prisma.cM_ServiceType.findMany({
        where: { IsActive: true },
        orderBy: { SortOrder: 'asc' },
        select: { ServiceTypeID: true, Name: true },
    });
    return NextResponse.json({ success: true, data: { branchName: branch.BranchName, serviceTypes } });
}
