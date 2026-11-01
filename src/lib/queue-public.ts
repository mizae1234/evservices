// Helper สำหรับ public queue endpoints: ตรวจ token และ resolve สาขาจาก DB (ไม่เชื่อ branchId จาก client)

import { prisma } from '@/lib/prisma';
import { verifyBranchToken } from '@/lib/queue-token';

export async function resolvePublicBranch(branchCode: string, purpose: 'checkin' | 'monitor', token: string | null | undefined) {
    if (!verifyBranchToken(branchCode, purpose, token)) return null;
    return prisma.cM_MsServiceBranch.findFirst({
        where: { BranchCode: branchCode, IsActive: true },
        select: { BranchID: true, BranchCode: true, BranchName: true },
    });
}
