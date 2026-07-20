// Service Bays API Route
// GET: Fetch bays for a branch
// POST: Create a new bay (Manager of the branch only)

export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';

export async function GET(request: NextRequest) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user) {
            return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
        }

        const { searchParams } = new URL(request.url);
        let branchIdStr = searchParams.get('branchId');

        // If service center user, force their branch
        if (session.user.role === 'SERVICE_CENTER') {
            if (!session.user.branchId) {
                return NextResponse.json({ success: false, error: 'User is not assigned to a branch' }, { status: 400 });
            }
            branchIdStr = session.user.branchId.toString();
        }

        if (!branchIdStr) {
            return NextResponse.json({ success: false, error: 'Missing branchId' }, { status: 400 });
        }

        const branchId = parseInt(branchIdStr);
        const includeInactive = searchParams.get('includeInactive') === 'true';

        const where: Record<string, unknown> = { BranchID: branchId };
        if (!includeInactive) {
            where.IsActive = true;
        }

        const bays = await prisma.cM_ServiceBay.findMany({
            where,
            orderBy: { SortOrder: 'asc' },
            select: {
                BayID: true,
                BranchID: true,
                BayName: true,
                SortOrder: true,
                IsActive: true,
                IsOnline: true,
                CreateDate: true,
            },
        });

        return NextResponse.json({
            success: true,
            data: bays,
        });
    } catch (error) {
        console.error('Error fetching service bays:', error);
        return NextResponse.json(
            { success: false, error: 'Failed to fetch service bays' },
            { status: 500 }
        );
    }
}

export async function POST(request: NextRequest) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user) {
            return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
        }

        const body = await request.json();
        const { BranchID, BayName, IsOnline } = body;

        // Determine the branch to add bay to
        let branchId: number;
        if (session.user.role === 'SERVICE_CENTER') {
            if (!session.user.branchId) {
                return NextResponse.json({ success: false, error: 'User is not assigned to a branch' }, { status: 400 });
            }
            branchId = session.user.branchId;
        } else if (session.user.role === 'ADMIN') {
            if (!BranchID) {
                return NextResponse.json({ success: false, error: 'BranchID is required for admin' }, { status: 400 });
            }
            branchId = parseInt(BranchID);
        } else {
            return NextResponse.json({ success: false, error: 'Permission denied' }, { status: 403 });
        }

        if (!BayName || !BayName.trim()) {
            return NextResponse.json(
                { success: false, error: 'BayName is required' },
                { status: 400 }
            );
        }

        // Get the next sort order
        const lastBay = await prisma.cM_ServiceBay.findFirst({
            where: { BranchID: branchId },
            orderBy: { SortOrder: 'desc' },
            select: { SortOrder: true },
        });

        const nextSortOrder = (lastBay?.SortOrder ?? 0) + 1;

        const bay = await prisma.cM_ServiceBay.create({
            data: {
                BranchID: branchId,
                BayName: BayName.trim(),
                SortOrder: nextSortOrder,
                IsActive: true,
                IsOnline: IsOnline !== undefined ? Boolean(IsOnline) : true,
            },
        });

        return NextResponse.json({
            success: true,
            data: bay,
            message: 'Service bay created successfully',
        });
    } catch (error) {
        console.error('Error creating service bay:', error);
        return NextResponse.json(
            { success: false, error: 'Failed to create service bay' },
            { status: 500 }
        );
    }
}
