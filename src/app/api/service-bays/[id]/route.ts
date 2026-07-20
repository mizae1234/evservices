// Service Bay Detail API Route
// PUT: Update a bay (rename, toggle active, reorder)
// DELETE: Soft-delete a bay

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';

export async function PUT(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user) {
            return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
        }

        const { id } = await params;
        const bayId = parseInt(id);
        const body = await request.json();
        const { BayName, IsActive, SortOrder, IsOnline } = body;

        // Verify the bay exists and user has access
        const existingBay = await prisma.cM_ServiceBay.findUnique({
            where: { BayID: bayId },
        });

        if (!existingBay) {
            return NextResponse.json({ success: false, error: 'Bay not found' }, { status: 404 });
        }

        // Check permission: SERVICE_CENTER can only manage their own branch's bays
        if (session.user.role === 'SERVICE_CENTER') {
            if (existingBay.BranchID !== session.user.branchId) {
                return NextResponse.json({ success: false, error: 'Permission denied' }, { status: 403 });
            }
        } else if (session.user.role !== 'ADMIN') {
            return NextResponse.json({ success: false, error: 'Permission denied' }, { status: 403 });
        }

        const updateData: Record<string, unknown> = {};
        if (BayName !== undefined) updateData.BayName = BayName.trim();
        if (IsActive !== undefined) updateData.IsActive = Boolean(IsActive);
        if (IsOnline !== undefined) updateData.IsOnline = Boolean(IsOnline);
        if (SortOrder !== undefined) updateData.SortOrder = parseInt(SortOrder);

        const bay = await prisma.cM_ServiceBay.update({
            where: { BayID: bayId },
            data: updateData,
        });

        return NextResponse.json({
            success: true,
            data: bay,
            message: 'Service bay updated successfully',
        });
    } catch (error) {
        console.error('Error updating service bay:', error);
        return NextResponse.json(
            { success: false, error: 'Failed to update service bay' },
            { status: 500 }
        );
    }
}

export async function DELETE(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user) {
            return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
        }

        const { id } = await params;
        const bayId = parseInt(id);

        const existingBay = await prisma.cM_ServiceBay.findUnique({
            where: { BayID: bayId },
        });

        if (!existingBay) {
            return NextResponse.json({ success: false, error: 'Bay not found' }, { status: 404 });
        }

        // Check permission
        if (session.user.role === 'SERVICE_CENTER') {
            if (existingBay.BranchID !== session.user.branchId) {
                return NextResponse.json({ success: false, error: 'Permission denied' }, { status: 403 });
            }
        } else if (session.user.role !== 'ADMIN') {
            return NextResponse.json({ success: false, error: 'Permission denied' }, { status: 403 });
        }

        // Check if bay has any active bookings
        const activeBookings = await prisma.cM_Booking.count({
            where: {
                BayID: bayId,
                Status: { in: [0, 1] }, // PENDING or APPROVED
            },
        });

        if (activeBookings > 0) {
            return NextResponse.json(
                { success: false, error: `ไม่สามารถลบ Bay ได้ มีการจองที่ยังดำเนินอยู่ ${activeBookings} รายการ` },
                { status: 400 }
            );
        }

        // Soft delete
        await prisma.cM_ServiceBay.update({
            where: { BayID: bayId },
            data: { IsActive: false },
        });

        return NextResponse.json({
            success: true,
            message: 'Service bay deleted successfully',
        });
    } catch (error) {
        console.error('Error deleting service bay:', error);
        return NextResponse.json(
            { success: false, error: 'Failed to delete service bay' },
            { status: 500 }
        );
    }
}
