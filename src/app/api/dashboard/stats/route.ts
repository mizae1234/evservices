// Dashboard Stats API Route
// Returns claim statistics for dashboard

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { CLAIM_STATUS } from '@/types';

// GET /api/dashboard/stats - Get dashboard statistics
export async function GET(request: NextRequest) {
    try {
        const session = await getServerSession(authOptions);

        if (!session?.user) {
            return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
        }

        // Build where clause based on role
        const where: Record<string, unknown> = { IsActive: true };

        if (session.user.role === 'SERVICE_CENTER' && session.user.branchId) {
            where.BranchID = session.user.branchId;
        }

        // Get counts for each status
        const [total, draft, pending, approved, rejected, needInfo] = await Promise.all([
            prisma.cM_DocClaim.count({ where }),
            prisma.cM_DocClaim.count({ where: { ...where, Status: CLAIM_STATUS.DRAFT } }),
            prisma.cM_DocClaim.count({ where: { ...where, Status: CLAIM_STATUS.PENDING } }),
            prisma.cM_DocClaim.count({ where: { ...where, Status: CLAIM_STATUS.APPROVED } }),
            prisma.cM_DocClaim.count({ where: { ...where, Status: CLAIM_STATUS.REJECTED } }),
            prisma.cM_DocClaim.count({ where: { ...where, Status: CLAIM_STATUS.NEED_INFO } }),
        ]);

        return NextResponse.json({
            success: true,
            data: {
                total,
                draft,
                pending,
                approved,
                rejected,
                needInfo,
            },
        });
    } catch (error) {
        console.error('Error fetching stats:', error);
        return NextResponse.json(
            { success: false, error: 'Failed to fetch stats' },
            { status: 500 }
        );
    }
}
