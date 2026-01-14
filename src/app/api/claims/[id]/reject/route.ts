// Claim Rejection API Route
// Admin rejects a claim

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { CLAIM_STATUS } from '@/types';

interface RouteParams {
    params: Promise<{ id: string }>;
}

// POST /api/claims/[id]/reject - Reject claim
export async function POST(request: NextRequest, { params }: RouteParams) {
    try {
        const session = await getServerSession(authOptions);

        if (!session?.user) {
            return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
        }

        // Only admin can reject
        if (session.user.role !== 'ADMIN') {
            return NextResponse.json(
                { success: false, error: 'ไม่มีสิทธิ์ปฏิเสธใบงาน' },
                { status: 403 }
            );
        }

        const { id } = await params;
        const claimId = parseInt(id);
        const body = await request.json();
        const { note } = body;

        if (!note) {
            return NextResponse.json(
                { success: false, error: 'กรุณาระบุเหตุผลในการปฏิเสธ' },
                { status: 400 }
            );
        }

        // Get existing claim
        const existingClaim = await prisma.cM_DocClaim.findUnique({
            where: { ClaimID: claimId, IsActive: true },
        });

        if (!existingClaim) {
            return NextResponse.json(
                { success: false, error: 'ไม่พบใบงาน' },
                { status: 404 }
            );
        }

        // Only pending claims can be rejected
        if (Number(existingClaim.Status) !== CLAIM_STATUS.PENDING) {
            return NextResponse.json(
                { success: false, error: 'ไม่สามารถปฏิเสธใบงานนี้ได้' },
                { status: 400 }
            );
        }

        const user = await prisma.cM_User.findUnique({
            where: { Email: session.user.email },
        });

        // Update claim status
        const claim = await prisma.cM_DocClaim.update({
            where: { ClaimID: claimId },
            data: {
                Status: CLAIM_STATUS.REJECTED,
                ApprovalNote: note,
                ApprovedDate: new Date(),
                ApprovedBy: user!.UserID,
                UpdateBy: user!.UserID,
            },
        });

        // Create rejection log
        await prisma.cM_ClaimLog.create({
            data: {
                ClaimID: claim.ClaimID,
                Action: 'REJECTED',
                Description: note,
                OldStatus: CLAIM_STATUS.PENDING,
                NewStatus: CLAIM_STATUS.REJECTED,
                ActionBy: user!.UserID,
            },
        });

        return NextResponse.json({
            success: true,
            data: claim,
            message: 'ปฏิเสธใบงานสำเร็จ',
        });
    } catch (error) {
        console.error('Error rejecting claim:', error);
        return NextResponse.json(
            { success: false, error: 'Failed to reject claim' },
            { status: 500 }
        );
    }
}
