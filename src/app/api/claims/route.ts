// Claims API Route
// Handles GET (list) and POST (create) operations

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { generateClaimNo } from '@/lib/utils';
import { CLAIM_STATUS } from '@/types';

// GET /api/claims - List claims with filtering
export async function GET(request: NextRequest) {
    try {
        const session = await getServerSession(authOptions);

        if (!session?.user) {
            return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
        }

        const { searchParams } = new URL(request.url);
        const page = parseInt(searchParams.get('page') || '1');
        const pageSize = parseInt(searchParams.get('pageSize') || '10');
        const status = searchParams.get('status');
        const branchId = searchParams.get('branchId');
        const search = searchParams.get('search');
        const startDate = searchParams.get('startDate');
        const endDate = searchParams.get('endDate');

        // Build where clause
        const where: Record<string, unknown> = { IsActive: true };

        // Filter by branch for service center users
        // Filter by branch for service center users
        if (session.user.role === 'SERVICE_CENTER') {
            // Force filter by user's branch
            if (session.user.branchId) {
                where.BranchID = session.user.branchId;
            } else {
                // If service center user has no branch assigned, return empty list or error
                // For safety, let's return empty result by setting an impossible ID
                where.BranchID = -1;
            }
        } else if (branchId) {
            where.BranchID = parseInt(branchId);
        }

        // Filter by status
        if (status !== null && status !== '') {
            where.Status = parseInt(status);
        }

        // Filter by date range
        if (startDate || endDate) {
            where.ClaimDate = {};
            if (startDate) {
                (where.ClaimDate as Record<string, Date>).gte = new Date(startDate);
            }
            if (endDate) {
                // Add 1 day to include the end date
                const end = new Date(endDate);
                end.setDate(end.getDate() + 1);
                (where.ClaimDate as Record<string, Date>).lt = end;
            }
        }

        // Search filter (SQL Server uses case-insensitive collation by default)
        if (search) {
            where.OR = [
                { ClaimNo: { contains: search } },
                { CustomerName: { contains: search } },
                { CarRegister: { contains: search } },
            ];
        }

        // Get total count
        const total = await prisma.cM_DocClaim.count({ where });

        // Get claims with pagination
        const claims = await prisma.cM_DocClaim.findMany({
            where,
            include: {
                Branch: true,
                Creator: {
                    select: { FullName: true },
                },
            },
            orderBy: { ClaimDate: 'desc' },
            skip: (page - 1) * pageSize,
            take: pageSize,
        });

        return NextResponse.json({
            success: true,
            data: claims,
            total,
            page,
            pageSize,
            totalPages: Math.ceil(total / pageSize),
        });
    } catch (error) {
        console.error('Error fetching claims:', error);
        return NextResponse.json(
            { success: false, error: 'Failed to fetch claims' },
            { status: 500 }
        );
    }
}

// POST /api/claims - Create new claim
export async function POST(request: NextRequest) {
    try {
        const session = await getServerSession(authOptions);

        if (!session?.user) {
            return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
        }

        const body = await request.json();
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

        // Validation
        if (!CustomerName || !CarModel || !CarRegister) {
            return NextResponse.json(
                { success: false, error: 'กรุณากรอกข้อมูลให้ครบถ้วน' },
                { status: 400 }
            );
        }

        // Get user's branch
        const user = await prisma.cM_User.findUnique({
            where: { Email: session.user.email },
        });

        if (!user?.BranchID && session.user.role === 'SERVICE_CENTER') {
            return NextResponse.json(
                { success: false, error: 'ไม่พบข้อมูลสาขาของผู้ใช้' },
                { status: 400 }
            );
        }

        // Generate unique claim number by getting the last sequence for current year
        const currentYear = new Date().getFullYear();
        const yearPrefix = `CLM-${currentYear}-`;

        // Find the last claim number for this year
        const lastClaim = await prisma.cM_DocClaim.findFirst({
            where: {
                ClaimNo: {
                    startsWith: yearPrefix,
                },
            },
            orderBy: {
                ClaimNo: 'desc',
            },
            select: {
                ClaimNo: true,
            },
        });

        // Extract last sequence number
        let lastSequence = 0;
        if (lastClaim?.ClaimNo) {
            const match = lastClaim.ClaimNo.match(/^CLM-\d{4}-(\d{4})$/);
            if (match) {
                lastSequence = parseInt(match[1]);
            }
        }

        const claimNo = generateClaimNo(lastSequence);

        // Create claim
        const claim = await prisma.cM_DocClaim.create({
            data: {
                ClaimNo: claimNo,
                CustomerName,
                CarModel,
                CarRegister,
                VinNo: VinNo || null,
                ProjectType: ProjectType || null,
                InventoryItemID: InventoryItemID ? parseInt(InventoryItemID) : null,
                ClaimDetail: ClaimDetail || '',
                Amount: parseFloat(Amount) || 0,
                IsCheckMileage: IsCheckMileage || false,
                Mileage: parseInt(Mileage) || 0,
                LastMileage: parseInt(LastMileage) || 0,
                Status: submitNow ? CLAIM_STATUS.PENDING : CLAIM_STATUS.DRAFT,
                BranchID: (session.user.role === 'ADMIN' && body.BranchID) ? parseInt(body.BranchID) : (user?.BranchID || 1),
                CreateBy: user!.UserID,
            },
        });

        // Create log
        await prisma.cM_ClaimLog.create({
            data: {
                ClaimID: claim.ClaimID,
                Action: 'CREATED',
                Description: 'สร้างใบงานใหม่',
                OldStatus: null,
                NewStatus: claim.Status,
                ActionBy: user!.UserID,
            },
        });

        // If submitted, add submit log
        if (submitNow) {
            await prisma.cM_ClaimLog.create({
                data: {
                    ClaimID: claim.ClaimID,
                    Action: 'SUBMITTED',
                    Description: 'ส่งใบงานเพื่ออนุมัติ',
                    OldStatus: CLAIM_STATUS.DRAFT,
                    NewStatus: CLAIM_STATUS.PENDING,
                    ActionBy: user!.UserID,
                },
            });
        }

        return NextResponse.json({
            success: true,
            data: claim,
            message: 'สร้างใบงานสำเร็จ',
        });
    } catch (error) {
        console.error('Error creating claim:', error);
        return NextResponse.json(
            { success: false, error: 'Failed to create claim' },
            { status: 500 }
        );
    }
}
