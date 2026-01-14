// Single Claim API Route
// Handles GET (detail), PUT (update), DELETE operations

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { CLAIM_STATUS } from '@/types';

interface RouteParams {
    params: Promise<{ id: string }>;
}

// GET /api/claims/[id] - Get claim detail
export async function GET(request: NextRequest, { params }: RouteParams) {
    try {
        const session = await getServerSession(authOptions);

        if (!session?.user) {
            return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
        }

        const { id } = await params;
        const claimId = parseInt(id);

        const claim = await prisma.cM_DocClaim.findUnique({
            where: { ClaimID: claimId, IsActive: true },
            include: {
                Branch: true,
                Creator: {
                    select: { FullName: true, Email: true },
                },
                Files: {
                    where: { IsActive: true },
                    orderBy: { CreateDate: 'desc' },
                },
                Logs: {
                    include: {
                        User: {
                            select: { FullName: true },
                        },
                    },
                    orderBy: { ActionDate: 'desc' },
                },
            },
        });

        if (!claim) {
            return NextResponse.json(
                { success: false, error: 'ไม่พบใบงาน' },
                { status: 404 }
            );
        }

        // Check access for service center users
        if (
            session.user.role === 'SERVICE_CENTER' &&
            session.user.branchId &&
            claim.BranchID !== session.user.branchId
        ) {
            return NextResponse.json(
                { success: false, error: 'ไม่มีสิทธิ์เข้าถึงใบงานนี้' },
                { status: 403 }
            );
        }

        return NextResponse.json({ success: true, data: claim });
    } catch (error) {
        console.error('Error fetching claim:', error);
        return NextResponse.json(
            { success: false, error: 'Failed to fetch claim' },
            { status: 500 }
        );
    }
}

// PUT /api/claims/[id] - Update claim
export async function PUT(request: NextRequest, { params }: RouteParams) {
    try {
        const session = await getServerSession(authOptions);

        if (!session?.user) {
            return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
        }

        const { id } = await params;
        const claimId = parseInt(id);
        const body = await request.json();

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

        // Only allow editing draft or need_info claims
        const canEdit = existingClaim.Status === CLAIM_STATUS.DRAFT || existingClaim.Status === CLAIM_STATUS.NEED_INFO;
        if (!canEdit && session.user.role !== 'ADMIN') {
            return NextResponse.json(
                { success: false, error: 'ไม่สามารถแก้ไขใบงานที่ส่งแล้ว' },
                { status: 400 }
            );
        }

        const user = await prisma.cM_User.findUnique({
            where: { Email: session.user.email },
        });

        const {
            CustomerName,
            CarModel,
            CarRegister,
            VinNo,
            ProjectType,
            InventoryItemID,
            ClaimDetail,
            Amount,
            IsCheckMileage,
            Mileage,
            LastMileage,
            submitNow,
        } = body;

        // Update claim
        const newStatus = submitNow ? CLAIM_STATUS.PENDING : existingClaim.Status;

        const claim = await prisma.cM_DocClaim.update({
            where: { ClaimID: claimId },
            data: {
                CustomerName,
                CarModel,
                CarRegister,
                VinNo: VinNo || null,
                ProjectType: ProjectType || null,
                InventoryItemID: InventoryItemID ? parseInt(InventoryItemID) : null,
                ClaimDetail,
                Amount: parseFloat(Amount) || 0,
                IsCheckMileage: IsCheckMileage || false,
                Mileage: parseInt(Mileage) || 0,
                LastMileage: parseInt(LastMileage) || 0,
                Status: newStatus,
                BranchID: (session.user.role === 'ADMIN' && body.BranchID) ? parseInt(body.BranchID) : undefined,
                UpdateBy: user!.UserID,
            },
        });

        // Create update log
        await prisma.cM_ClaimLog.create({
            data: {
                ClaimID: claim.ClaimID,
                Action: 'UPDATED',
                Description: 'แก้ไขข้อมูลใบงาน',
                OldStatus: existingClaim.Status,
                NewStatus: claim.Status,
                ActionBy: user!.UserID,
            },
        });

        // If submitted, add submit log
        if (submitNow && (existingClaim.Status === CLAIM_STATUS.DRAFT || existingClaim.Status === CLAIM_STATUS.NEED_INFO)) {
            await prisma.cM_ClaimLog.create({
                data: {
                    ClaimID: claim.ClaimID,
                    Action: 'SUBMITTED',
                    Description: existingClaim.Status === CLAIM_STATUS.NEED_INFO
                        ? 'ส่งใบงานใหม่หลังแก้ไขข้อมูล'
                        : 'ส่งใบงานเพื่ออนุมัติ',
                    OldStatus: existingClaim.Status,
                    NewStatus: CLAIM_STATUS.PENDING,
                    ActionBy: user!.UserID,
                },
            });
        }

        return NextResponse.json({
            success: true,
            data: claim,
            message: 'อัพเดทใบงานสำเร็จ',
        });
    } catch (error) {
        console.error('Error updating claim:', error);
        return NextResponse.json(
            { success: false, error: 'Failed to update claim' },
            { status: 500 }
        );
    }
}

// DELETE /api/claims/[id] - Soft delete claim
export async function DELETE(request: NextRequest, { params }: RouteParams) {
    try {
        const session = await getServerSession(authOptions);

        if (!session?.user) {
            return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
        }

        const { id } = await params;
        const claimId = parseInt(id);

        const claim = await prisma.cM_DocClaim.findUnique({
            where: { ClaimID: claimId },
        });

        if (!claim) {
            return NextResponse.json(
                { success: false, error: 'ไม่พบใบงาน' },
                { status: 404 }
            );
        }

        // Only allow deleting draft claims (or admin can delete any)
        if (claim.Status !== CLAIM_STATUS.DRAFT && session.user.role !== 'ADMIN') {
            return NextResponse.json(
                { success: false, error: 'ไม่สามารถลบใบงานที่ส่งแล้ว' },
                { status: 400 }
            );
        }

        // Soft delete
        await prisma.cM_DocClaim.update({
            where: { ClaimID: claimId },
            data: { IsActive: false },
        });

        return NextResponse.json({
            success: true,
            message: 'ลบใบงานสำเร็จ',
        });
    } catch (error) {
        console.error('Error deleting claim:', error);
        return NextResponse.json(
            { success: false, error: 'Failed to delete claim' },
            { status: 500 }
        );
    }
}
