// Bookings Settings API Route
// Handles GET (fetch slots and weekly working days) and POST (save configurations)

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';



const DEFAULT_WORKING_DAYS = [
    { DayOfWeek: 0, IsOpen: false }, // Sun
    { DayOfWeek: 1, IsOpen: true },  // Mon
    { DayOfWeek: 2, IsOpen: true },  // Tue
    { DayOfWeek: 3, IsOpen: true },  // Wed
    { DayOfWeek: 4, IsOpen: true },  // Thu
    { DayOfWeek: 5, IsOpen: true },  // Fri
    { DayOfWeek: 6, IsOpen: true },  // Sat
];

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



        // 1. Fetch working days from database
        const dbWorkingDays = await prisma.cM_BranchWorkingDay.findMany({
            where: { BranchID: branchId },
        });

        const workingDays = DEFAULT_WORKING_DAYS.map((def) => {
            const dbMatch = dbWorkingDays.find((wd) => wd.DayOfWeek === def.DayOfWeek);
            return {
                DayOfWeek: def.DayOfWeek,
                IsOpen: dbMatch ? dbMatch.IsOpen : def.IsOpen,
            };
        });

        // 2. Fetch branch operating hours
        const branchInfo = await prisma.cM_MsServiceBranch.findUnique({
            where: { BranchID: branchId },
            select: { OpenTime: true, CloseTime: true },
        });

        return NextResponse.json({
            success: true,
            data: {
                workingDays,
                operatingHours: { 
                    openTime: branchInfo?.OpenTime || '08:30', 
                    closeTime: branchInfo?.CloseTime || '17:30' 
                },
            },
        });
    } catch (error) {
        console.error('Error fetching settings configs:', error);
        return NextResponse.json(
            { success: false, error: 'Failed to fetch configurations' },
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
        const { branchId: bodyBranchId, workingDays, operatingHours } = body;

        let branchId = bodyBranchId ? parseInt(bodyBranchId) : null;

        // If service center user, force their branch
        if (session.user.role === 'SERVICE_CENTER') {
            if (!session.user.branchId) {
                return NextResponse.json({ success: false, error: 'User is not assigned to a branch' }, { status: 400 });
            }
            branchId = session.user.branchId;
        }

        if (!branchId) {
            return NextResponse.json({ success: false, error: 'Missing branchId' }, { status: 400 });
        }



        // 1. Save working days (if provided)
        if (Array.isArray(workingDays)) {
            for (const wd of workingDays) {
                const dayOfWeek = parseInt(wd.DayOfWeek);
                const isOpen = !!wd.IsOpen;

                if (isNaN(dayOfWeek) || dayOfWeek < 0 || dayOfWeek > 6) continue;

                await prisma.cM_BranchWorkingDay.upsert({
                    where: {
                        BranchID_DayOfWeek: {
                            BranchID: branchId,
                            DayOfWeek: dayOfWeek,
                        },
                    },
                    update: {
                        IsOpen: isOpen,
                    },
                    create: {
                        BranchID: branchId,
                        DayOfWeek: dayOfWeek,
                        IsOpen: isOpen,
                    },
                });
            }
        }

        // 2. Save operating hours
        if (operatingHours && operatingHours.openTime && operatingHours.closeTime) {
            await prisma.cM_MsServiceBranch.update({
                where: { BranchID: branchId },
                data: {
                    OpenTime: operatingHours.openTime,
                    CloseTime: operatingHours.closeTime,
                },
            });
        }

        return NextResponse.json({
            success: true,
            message: 'Configurations saved successfully',
        });
    } catch (error) {
        console.error('Error saving configs:', error);
        return NextResponse.json(
            { success: false, error: 'Failed to save configurations' },
            { status: 500 }
        );
    }
}
