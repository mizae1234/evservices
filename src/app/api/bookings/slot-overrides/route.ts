// Slot Override API Route
// CRUD for per-day per-slot queue overrides (close slots or adjust quota for specific days)

export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';

// GET: Fetch overrides for a branch + date
export async function GET(request: NextRequest) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user) {
            return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
        }

        const { searchParams } = new URL(request.url);
        let branchIdStr = searchParams.get('branchId');
        const dateStr = searchParams.get('date'); // YYYY-MM-DD (optional, if not provided returns upcoming overrides)

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

        if (dateStr) {
            // Fetch overrides for a specific date
            const [year, month, day] = dateStr.split('-').map(Number);
            const startOfDay = new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0));
            const endOfDay = new Date(Date.UTC(year, month - 1, day, 23, 59, 59, 999));

            const overrides = await prisma.cM_BranchSlotOverride.findMany({
                where: {
                    BranchID: branchId,
                    OverrideDate: {
                        gte: startOfDay,
                        lte: endOfDay,
                    },
                },
                orderBy: { StartTime: 'asc' },
            });

            return NextResponse.json({ success: true, data: overrides });
        } else {
            // Fetch all upcoming overrides (today + future) and recent (past 7 days)
            const now = new Date();
            const sevenDaysAgo = new Date(now);
            sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
            sevenDaysAgo.setHours(0, 0, 0, 0);

            const overrides = await prisma.cM_BranchSlotOverride.findMany({
                where: {
                    BranchID: branchId,
                    OverrideDate: {
                        gte: sevenDaysAgo,
                    },
                },
                orderBy: [{ OverrideDate: 'asc' }, { StartTime: 'asc' }],
            });

            return NextResponse.json({ success: true, data: overrides });
        }
    } catch (error) {
        console.error('Error fetching slot overrides:', error);
        return NextResponse.json({ success: false, error: 'Internal Server Error' }, { status: 500 });
    }
}

// POST: Create or update a slot override (upsert)
export async function POST(request: NextRequest) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user) {
            return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
        }

        // Only ADMIN and SERVICE_CENTER can create overrides
        if (!['ADMIN', 'SERVICE_CENTER'].includes(session.user.role)) {
            return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
        }

        const body = await request.json();
        const { branchId: bodyBranchId, date, startTime, endTime, isOpen, maxQueueOverride, reason } = body;

        let branchId = bodyBranchId ? parseInt(bodyBranchId) : null;

        // If service center user, force their branch
        if (session.user.role === 'SERVICE_CENTER') {
            if (!session.user.branchId) {
                return NextResponse.json({ success: false, error: 'User is not assigned to a branch' }, { status: 400 });
            }
            branchId = session.user.branchId;
        }

        if (!branchId || !date || !startTime || !endTime) {
            return NextResponse.json({ success: false, error: 'Missing required fields: branchId, date, startTime, endTime' }, { status: 400 });
        }

        // Parse the date
        const [year, month, day] = date.split('-').map(Number);
        const overrideDate = new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0));

        const override = await prisma.cM_BranchSlotOverride.upsert({
            where: {
                BranchID_OverrideDate_StartTime_EndTime: {
                    BranchID: branchId,
                    OverrideDate: overrideDate,
                    StartTime: startTime,
                    EndTime: endTime,
                },
            },
            update: {
                IsOpen: isOpen !== undefined ? isOpen : true,
                MaxQueueOverride: maxQueueOverride !== undefined ? maxQueueOverride : null,
                Reason: reason || null,
                CreateBy: parseInt(session.user.id),
            },
            create: {
                BranchID: branchId,
                OverrideDate: overrideDate,
                StartTime: startTime,
                EndTime: endTime,
                IsOpen: isOpen !== undefined ? isOpen : true,
                MaxQueueOverride: maxQueueOverride !== undefined ? maxQueueOverride : null,
                Reason: reason || null,
                CreateBy: parseInt(session.user.id),
            },
        });

        return NextResponse.json({ success: true, data: override });
    } catch (error) {
        console.error('Error saving slot override:', error);
        return NextResponse.json({ success: false, error: 'Internal Server Error' }, { status: 500 });
    }
}

// DELETE: Remove a slot override (revert to default)
export async function DELETE(request: NextRequest) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user) {
            return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
        }

        if (!['ADMIN', 'SERVICE_CENTER'].includes(session.user.role)) {
            return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
        }

        const { searchParams } = new URL(request.url);
        const overrideIdStr = searchParams.get('overrideId');

        if (!overrideIdStr) {
            return NextResponse.json({ success: false, error: 'Missing overrideId' }, { status: 400 });
        }

        const overrideId = parseInt(overrideIdStr);

        // Verify the override exists and belongs to user's branch if SERVICE_CENTER
        const existing = await prisma.cM_BranchSlotOverride.findUnique({
            where: { OverrideID: overrideId },
        });

        if (!existing) {
            return NextResponse.json({ success: false, error: 'Override not found' }, { status: 404 });
        }

        if (session.user.role === 'SERVICE_CENTER' && existing.BranchID !== session.user.branchId) {
            return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
        }

        await prisma.cM_BranchSlotOverride.delete({
            where: { OverrideID: overrideId },
        });

        return NextResponse.json({ success: true, message: 'Override deleted successfully' });
    } catch (error) {
        console.error('Error deleting slot override:', error);
        return NextResponse.json({ success: false, error: 'Internal Server Error' }, { status: 500 });
    }
}
