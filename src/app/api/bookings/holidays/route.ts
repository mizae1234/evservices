// Branch Holidays API Route
// Handles GET (list branch holidays), POST (add holiday), and DELETE (remove holiday)

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

        // Fetch active holidays from 30 days ago to future
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

        const holidays = await prisma.cM_BranchHoliday.findMany({
            where: {
                BranchID: branchId,
                IsActive: true,
                HolidayDate: {
                    gte: thirtyDaysAgo,
                },
            },
            orderBy: {
                HolidayDate: 'asc',
            },
        });

        return NextResponse.json({
            success: true,
            data: holidays,
        });
    } catch (error) {
        console.error('Error fetching branch holidays:', error);
        return NextResponse.json(
            { success: false, error: 'Failed to fetch holidays' },
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
        const { branchId: bodyBranchId, date, description } = body;

        let branchId = bodyBranchId ? parseInt(bodyBranchId) : null;

        // If service center user, force their branch
        if (session.user.role === 'SERVICE_CENTER') {
            if (!session.user.branchId) {
                return NextResponse.json({ success: false, error: 'User is not assigned to a branch' }, { status: 400 });
            }
            branchId = session.user.branchId;
        }

        if (!branchId || !date) {
            return NextResponse.json({ success: false, error: 'Missing branchId or date' }, { status: 400 });
        }

        const [year, month, day] = date.split('-').map(Number);
        const holidayDate = new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0));

        // Check if already exists (active or inactive)
        const existing = await prisma.cM_BranchHoliday.findFirst({
            where: {
                BranchID: branchId,
                HolidayDate: holidayDate,
            },
        });

        let holiday;
        if (existing) {
            holiday = await prisma.cM_BranchHoliday.update({
                where: { HolidayID: existing.HolidayID },
                data: {
                    Description: description || '',
                    IsActive: true,
                },
            });
        } else {
            holiday = await prisma.cM_BranchHoliday.create({
                data: {
                    BranchID: branchId,
                    HolidayDate: holidayDate,
                    Description: description || '',
                    IsActive: true,
                },
            });
        }

        return NextResponse.json({
            success: true,
            data: holiday,
        });
    } catch (error) {
        console.error('Error adding branch holiday:', error);
        return NextResponse.json(
            { success: false, error: 'Failed to add holiday' },
            { status: 500 }
        );
    }
}

export async function DELETE(request: NextRequest) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user) {
            return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
        }

        const { searchParams } = new URL(request.url);
        const holidayIdStr = searchParams.get('holidayId');

        if (!holidayIdStr) {
            return NextResponse.json({ success: false, error: 'Missing holidayId' }, { status: 400 });
        }

        const holidayId = parseInt(holidayIdStr);

        const holiday = await prisma.cM_BranchHoliday.findUnique({
            where: { HolidayID: holidayId },
        });

        if (!holiday) {
            return NextResponse.json({ success: false, error: 'Holiday not found' }, { status: 404 });
        }

        // Access check
        if (session.user.role === 'SERVICE_CENTER' && session.user.branchId && holiday.BranchID !== session.user.branchId) {
            return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 403 });
        }

        // Soft delete
        await prisma.cM_BranchHoliday.update({
            where: { HolidayID: holidayId },
            data: { IsActive: false },
        });

        return NextResponse.json({
            success: true,
            message: 'Holiday removed successfully',
        });
    } catch (error) {
        console.error('Error deleting branch holiday:', error);
        return NextResponse.json(
            { success: false, error: 'Failed to remove holiday' },
            { status: 500 }
        );
    }
}
