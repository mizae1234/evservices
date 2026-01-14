// Request Info API Route
// Admin requests more information for a claim

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { CLAIM_STATUS } from '@/types';

interface RouteParams {
    params: Promise<{ id: string }>;
}

// POST /api/claims/[id]/request-info - Request more information
export async function POST(request: NextRequest, { params }: RouteParams) {
    try {
        const session = await getServerSession(authOptions);

        if (!session?.user) {
            return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
        }

        // Only admin can request info
        if (session.user.role !== 'ADMIN') {
            return NextResponse.json(
                { success: false, error: 'ไม่มีสิทธิ์ขอข้อมูลเพิ่มเติม' },
                { status: 403 }
            );
        }

        const { id } = await params;
        const claimId = parseInt(id);
        const body = await request.json();
        const { note } = body;

        if (!note) {
            return NextResponse.json(
                { success: false, error: 'กรุณาระบุข้อมูลที่ต้องการเพิ่มเติม' },
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

        // Only pending claims can have info requested
        if (Number(existingClaim.Status) !== CLAIM_STATUS.PENDING) {
            return NextResponse.json(
                { success: false, error: 'ไม่สามารถขอข้อมูลเพิ่มเติมสำหรับใบงานนี้ได้' },
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
                Status: CLAIM_STATUS.NEED_INFO,
                ApprovalNote: note,
                UpdateBy: user!.UserID,
            },
        });

        // Create info request log
        await prisma.cM_ClaimLog.create({
            data: {
                ClaimID: claim.ClaimID,
                Action: 'INFO_REQUESTED',
                Description: note,
                OldStatus: CLAIM_STATUS.PENDING,
                NewStatus: CLAIM_STATUS.NEED_INFO,
                ActionBy: user!.UserID,
            },
        });

        return NextResponse.json({
            success: true,
            data: claim,
            message: 'ส่งคำขอข้อมูลเพิ่มเติมสำเร็จ',
        });
    } catch (error) {
        console.error('Error requesting info:', error);
        return NextResponse.json(
            { success: false, error: 'Failed to request info' },
            { status: 500 }
        );
    }
}
