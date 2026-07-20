// Flat Rates API Route
// GET: Fetch flat rates (optionally filtered by serviceTypeId)
// POST: Create a new flat rate (ADMIN only)

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
        const serviceTypeIdStr = searchParams.get('serviceTypeId');

        const where: Record<string, unknown> = { IsActive: true };
        if (serviceTypeIdStr) {
            where.ServiceTypeID = parseInt(serviceTypeIdStr);
        }

        const flatRates = await prisma.cM_FlatRate.findMany({
            where,
            orderBy: [
                { ServiceTypeID: 'asc' },
                { MileageID: 'asc' },
            ],
            include: {
                ServiceType: {
                    select: {
                        ServiceTypeID: true,
                        Code: true,
                        Name: true,
                        RequiresMileage: true,
                    },
                },
                Mileage: {
                    select: {
                        MileageID: true,
                        Value: true,
                        Label: true,
                    },
                },
            },
        });

        return NextResponse.json({
            success: true,
            data: flatRates,
        });
    } catch (error) {
        console.error('Error fetching flat rates:', error);
        return NextResponse.json(
            { success: false, error: 'Failed to fetch flat rates' },
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

        // Only ADMIN can manage flat rates
        if (session.user.role !== 'ADMIN') {
            return NextResponse.json({ success: false, error: 'Permission denied. Only HO Admin can manage flat rates.' }, { status: 403 });
        }

        const body = await request.json();
        const { ServiceTypeID, MileageID, DurationMinutes, Description } = body;

        if (!ServiceTypeID || !DurationMinutes) {
            return NextResponse.json(
                { success: false, error: 'ServiceTypeID and DurationMinutes are required' },
                { status: 400 }
            );
        }

        // Validate DurationMinutes is a multiple of 30
        if (DurationMinutes % 30 !== 0 || DurationMinutes <= 0) {
            return NextResponse.json(
                { success: false, error: 'DurationMinutes must be a positive multiple of 30' },
                { status: 400 }
            );
        }

        // Check for duplicate
        const existing = await prisma.cM_FlatRate.findFirst({
            where: {
                ServiceTypeID: parseInt(ServiceTypeID),
                MileageID: MileageID ? parseInt(MileageID) : null,
                IsActive: true,
            },
        });

        if (existing) {
            return NextResponse.json(
                { success: false, error: 'Flat rate already exists for this service type and mileage combination' },
                { status: 409 }
            );
        }

        const flatRate = await prisma.cM_FlatRate.create({
            data: {
                ServiceTypeID: parseInt(ServiceTypeID),
                MileageID: MileageID ? parseInt(MileageID) : null,
                DurationMinutes: parseInt(DurationMinutes),
                Description: Description || null,
            },
            include: {
                ServiceType: {
                    select: { Code: true, Name: true },
                },
                Mileage: {
                    select: { Value: true, Label: true },
                },
            },
        });

        return NextResponse.json({
            success: true,
            data: flatRate,
            message: 'Flat rate created successfully',
        });
    } catch (error) {
        console.error('Error creating flat rate:', error);
        return NextResponse.json(
            { success: false, error: 'Failed to create flat rate' },
            { status: 500 }
        );
    }
}
