// Flat Rate Detail API Route
// PUT: Update a flat rate (ADMIN only)
// DELETE: Soft-delete a flat rate (ADMIN only)

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

        if (session.user.role !== 'ADMIN') {
            return NextResponse.json({ success: false, error: 'Permission denied' }, { status: 403 });
        }

        const { id } = await params;
        const flatRateId = parseInt(id);
        const body = await request.json();
        const { CarModelID, DurationMinutes, Description } = body;

        if (!DurationMinutes) {
            return NextResponse.json(
                { success: false, error: 'DurationMinutes is required' },
                { status: 400 }
            );
        }

        if (DurationMinutes % 30 !== 0 || DurationMinutes <= 0) {
            return NextResponse.json(
                { success: false, error: 'DurationMinutes must be a positive multiple of 30' },
                { status: 400 }
            );
        }

        const flatRate = await prisma.cM_FlatRate.update({
            where: { FlatRateID: flatRateId },
            data: {
                DurationMinutes: parseInt(DurationMinutes),
                Description: Description !== undefined ? Description : undefined,
                CarModelID: CarModelID !== undefined ? (CarModelID ? parseInt(CarModelID) : null) : undefined,
            },
            include: {
                ServiceType: {
                    select: { Code: true, Name: true },
                },
                Mileage: {
                    select: { Value: true, Label: true },
                },
                CarModel: {
                    select: { ModelName: true, Brand: true },
                },
            },
        });

        return NextResponse.json({
            success: true,
            data: flatRate,
            message: 'Flat rate updated successfully',
        });
    } catch (error) {
        console.error('Error updating flat rate:', error);
        return NextResponse.json(
            { success: false, error: 'Failed to update flat rate' },
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

        if (session.user.role !== 'ADMIN') {
            return NextResponse.json({ success: false, error: 'Permission denied' }, { status: 403 });
        }

        const { id } = await params;
        const flatRateId = parseInt(id);

        // Soft delete
        await prisma.cM_FlatRate.update({
            where: { FlatRateID: flatRateId },
            data: { IsActive: false },
        });

        return NextResponse.json({
            success: true,
            message: 'Flat rate deleted successfully',
        });
    } catch (error) {
        console.error('Error deleting flat rate:', error);
        return NextResponse.json(
            { success: false, error: 'Failed to delete flat rate' },
            { status: 500 }
        );
    }
}
