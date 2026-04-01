// Dashboard Stats API Route
// Returns claim statistics for dashboard

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { CLAIM_STATUS } from '@/types';

// GET /api/dashboard/stats - Get dashboard statistics
// Query params: startDate (YYYY-MM-DD), endDate (YYYY-MM-DD)
export async function GET(request: NextRequest) {
    try {
        const session = await getServerSession(authOptions);

        if (!session?.user) {
            return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
        }

        const searchParams = request.nextUrl.searchParams;
        const startDate = searchParams.get('startDate');
        const endDate = searchParams.get('endDate');

        // Build where clause based on role
        const where: Record<string, unknown> = { IsActive: true };

        if (session.user.role === 'SERVICE_CENTER' && session.user.branchId) {
            where.BranchID = session.user.branchId;
        }

        // Add date range filter if provided
        if (startDate || endDate) {
            where.ClaimDate = {};
            if (startDate) {
                (where.ClaimDate as Record<string, Date>).gte = new Date(startDate);
            }
            if (endDate) {
                // Add 1 day to include the end date fully
                const end = new Date(endDate);
                end.setDate(end.getDate() + 1);
                (where.ClaimDate as Record<string, Date>).lt = end;
            }
        }

        // Get total count
        const total = await prisma.cM_DocClaim.count({ where });

        // Get counts grouped by status
        const groupedStats = await prisma.cM_DocClaim.groupBy({
            by: ['Status'],
            where,
            _count: {
                Status: true
            }
        });

        // Initialize status counts
        let draft = 0, pending = 0, approved = 0, rejected = 0, needInfo = 0;

        // Map grouped results to variables
        groupedStats.forEach((group) => {
            const count = group._count.Status;
            switch (group.Status) {
                case CLAIM_STATUS.DRAFT: draft = count; break;
                case CLAIM_STATUS.PENDING: pending = count; break;
                case CLAIM_STATUS.APPROVED: approved = count; break;
                case CLAIM_STATUS.REJECTED: rejected = count; break;
                case CLAIM_STATUS.NEED_INFO: needInfo = count; break;
            }
        });

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
