// Bookings Slots API Route
// Calculates slot occupancy and availability for a branch and date, taking holidays & off-days into account

export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';

const DEFAULT_SLOTS = [
    { StartTime: '08:30', EndTime: '10:30', MaxQueue: 2 },
    { StartTime: '10:30', EndTime: '12:30', MaxQueue: 2 },
    { StartTime: '13:30', EndTime: '15:30', MaxQueue: 2 },
    { StartTime: '15:30', EndTime: '17:30', MaxQueue: 2 },
];

const THAI_DAYS = ['วันอาทิตย์', 'วันจันทร์', 'วันอังคาร', 'วันพุธ', 'วันพฤหัสบดี', 'วันศุกร์', 'วันเสาร์'];

export async function GET(request: NextRequest) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user) {
            return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
        }

        const { searchParams } = new URL(request.url);
        const branchIdStr = searchParams.get('branchId');
        const dateStr = searchParams.get('date'); // YYYY-MM-DD

        if (!branchIdStr || !dateStr) {
            return NextResponse.json({ success: false, error: 'Missing branchId or date' }, { status: 400 });
        }

        const branchId = parseInt(branchIdStr);

        // Parse date range in UTC timezone-agnostic manner
        const [year, month, day] = dateStr.split('-').map(Number);
        const dateObj = new Date(Date.UTC(year, month - 1, day));
        const startOfDay = new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0));
        const endOfDay = new Date(Date.UTC(year, month - 1, day, 23, 59, 59, 999));

        // 1. Check Weekly Off-Day
        const dayOfWeek = dateObj.getUTCDay(); // 0=Sun, 1=Mon, ..., 6=Sat in UTC
        const workingDayConfig = await prisma.cM_BranchWorkingDay.findUnique({
            where: {
                BranchID_DayOfWeek: {
                    BranchID: branchId,
                    DayOfWeek: dayOfWeek,
                },
            },
        });

        // Default: closed on Sunday, open on other days
        const isDefaultClosed = dayOfWeek === 0;
        const isClosedDay = workingDayConfig ? !workingDayConfig.IsOpen : isDefaultClosed;

        if (isClosedDay) {
            return NextResponse.json({
                success: true,
                isClosed: true,
                reason: `วันหยุดทำการประจำสัปดาห์ (${THAI_DAYS[dayOfWeek]})`,
                data: [],
            });
        }

        // 2. Check Special Holiday / Closure
        const specialHoliday = await prisma.cM_BranchHoliday.findFirst({
            where: {
                BranchID: branchId,
                HolidayDate: {
                    gte: startOfDay,
                    lte: endOfDay,
                },
                IsActive: true,
            },
        });

        if (specialHoliday) {
            return NextResponse.json({
                success: true,
                isClosed: true,
                reason: specialHoliday.Description || 'วันหยุดพิเศษ / ปิดทำการชั่วคราว',
                data: [],
            });
        }

        // 3. Fetch slot configurations from database
        const dbConfigs = await prisma.cM_BranchSlotConfig.findMany({
            where: { BranchID: branchId, IsActive: true },
            orderBy: { StartTime: 'asc' },
        });

        // 4. Fetch slot overrides for this specific date
        const slotOverrides = await prisma.cM_BranchSlotOverride.findMany({
            where: {
                BranchID: branchId,
                OverrideDate: {
                    gte: startOfDay,
                    lte: endOfDay,
                },
            },
        });

        // Build override lookup map: "StartTime-EndTime" -> override record
        const overrideMap = new Map<string, typeof slotOverrides[0]>();
        slotOverrides.forEach(o => {
            overrideMap.set(`${o.StartTime}-${o.EndTime}`, o);
        });

        // Fetch bookings for this branch and date
        const bookings = await prisma.cM_Booking.findMany({
            where: {
                BranchID: branchId,
                BookingDate: {
                    gte: startOfDay,
                    lte: endOfDay,
                },
                Status: {
                    in: [0, 1, 3], // Pending, Approved, Converted
                },
            },
        });

        console.log('SLOTS_API_DEBUG:', {
            dateStr,
            branchId,
            startOfDay: startOfDay.toISOString(),
            endOfDay: endOfDay.toISOString(),
            bookingsCount: bookings.length,
            overridesCount: slotOverrides.length,
            bookings: bookings.map(b => ({ id: b.BookingID, date: b.BookingDate, status: b.Status, start: b.StartTime }))
        });

        // Use custom slots if configured, otherwise fallback to defaults
        const activeConfigs = dbConfigs.length > 0
            ? dbConfigs.map(c => ({ StartTime: c.StartTime, EndTime: c.EndTime, MaxQueue: c.MaxQueue }))
            : DEFAULT_SLOTS;

        // Calculate availability for each slot, applying overrides
        const slots = activeConfigs.map((slot) => {
            const override = overrideMap.get(`${slot.StartTime}-${slot.EndTime}`);

            // If override exists and slot is closed
            const isSlotClosed = override ? !override.IsOpen : false;

            // Determine effective max queue
            const originalMaxQueue = slot.MaxQueue;
            const effectiveMaxQueue = isSlotClosed
                ? 0
                : (override?.MaxQueueOverride !== null && override?.MaxQueueOverride !== undefined)
                    ? override.MaxQueueOverride
                    : slot.MaxQueue;

            // Count bookings in this specific slot
            const bookedCount = bookings.filter(
                (b) => b.StartTime === slot.StartTime && b.EndTime === slot.EndTime
            ).length;

            return {
                StartTime: slot.StartTime,
                EndTime: slot.EndTime,
                MaxQueue: effectiveMaxQueue,
                OriginalMaxQueue: originalMaxQueue,
                BookedCount: bookedCount,
                IsAvailable: !isSlotClosed && bookedCount < effectiveMaxQueue,
                IsOverridden: !!override,
                IsSlotClosed: isSlotClosed,
                OverrideReason: override?.Reason || null,
            };
        });

        return NextResponse.json({
            success: true,
            isClosed: false,
            data: slots,
        });
    } catch (error) {
        console.error('Error fetching slot availability:', error);
        return NextResponse.json(
            { success: false, error: 'Failed to fetch slot availability' },
            { status: 500 }
        );
    }
}
