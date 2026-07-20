export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';

export async function GET(request: NextRequest) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user) {
            return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
        }

        const { searchParams } = new URL(request.url);
        const branchIdStr = searchParams.get('branchId');
        const yearStr = searchParams.get('year');
        const monthStr = searchParams.get('month'); // 1-12
        const search = searchParams.get('search');

        const branchId = (branchIdStr && !isNaN(parseInt(branchIdStr))) ? parseInt(branchIdStr) : null;
        const now = new Date();
        const year = yearStr ? parseInt(yearStr) : now.getFullYear();
        const month = monthStr ? parseInt(monthStr) : now.getMonth() + 1; // 1-12

        // Date range of the target month in UTC
        const startDate = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0, 0));
        const endDate = new Date(Date.UTC(year, month, 0, 23, 59, 59, 999));

        // 1. Fetch branch slot configurations (to sum MaxQueue and get slots)
        let slotsConfig: { StartTime: string; EndTime: string; MaxQueue: number }[] = [];
        if (branchId !== null) {
            slotsConfig = await prisma.cM_BranchSlotConfig.findMany({
                where: {
                    BranchID: branchId,
                    IsActive: true,
                },
                select: {
                    StartTime: true,
                    EndTime: true,
                    MaxQueue: true,
                },
            });
        }

        const dailyMaxQueue = slotsConfig.reduce((sum, slot) => sum + slot.MaxQueue, 0);

        // 2. Fetch branch working days configuration
        let workingDays: { DayOfWeek: number; IsOpen: boolean }[] = [];
        if (branchId !== null) {
            workingDays = await prisma.cM_BranchWorkingDay.findMany({
                where: { BranchID: branchId },
                select: {
                    DayOfWeek: true,
                    IsOpen: true,
                },
            });
        }

        // Map weekly open days. Default to Mon-Sat open, Sun closed if no records.
        const openDaysMap = new Map<number, boolean>();
        if (workingDays.length > 0) {
            workingDays.forEach(wd => {
                openDaysMap.set(wd.DayOfWeek, wd.IsOpen);
            });
        } else {
            // Default: Mon-Sat (1-6) open, Sun (0) closed
            for (let i = 0; i <= 6; i++) {
                openDaysMap.set(i, i !== 0);
            }
        }

        // 3. Fetch holidays active for this branch in the date range
        const startOfDayRange = startDate;
        const endOfDayRange = endDate;

        let holidays: { HolidayDate: Date; Description: string | null }[] = [];
        if (branchId !== null) {
            holidays = await prisma.cM_BranchHoliday.findMany({
                where: {
                    BranchID: branchId,
                    IsActive: true,
                    HolidayDate: {
                        gte: startOfDayRange,
                        lte: endOfDayRange,
                    },
                },
                select: {
                    HolidayDate: true,
                    Description: true,
                },
            });
        }

        const holidayDatesMap = new Map<string, string>(); // dateString -> description
        holidays.forEach(h => {
            const dateStr = h.HolidayDate.toISOString().split('T')[0];
            holidayDatesMap.set(dateStr, h.Description || 'วันหยุดสาขา');
        });

        // 3.5. Fetch slot overrides for this month
        let slotOverrides: { OverrideDate: Date; StartTime: string; EndTime: string; IsOpen: boolean; MaxQueueOverride: number | null }[] = [];
        if (branchId !== null) {
            slotOverrides = await prisma.cM_BranchSlotOverride.findMany({
                where: {
                    BranchID: branchId,
                    OverrideDate: {
                        gte: startOfDayRange,
                        lte: endOfDayRange,
                    },
                },
                select: {
                    OverrideDate: true,
                    StartTime: true,
                    EndTime: true,
                    IsOpen: true,
                    MaxQueueOverride: true,
                },
            });
        }

        // Group overrides by date string
        const overridesByDate = new Map<string, typeof slotOverrides>();
        slotOverrides.forEach(o => {
            const dateStr = o.OverrideDate.toISOString().split('T')[0];
            if (!overridesByDate.has(dateStr)) {
                overridesByDate.set(dateStr, []);
            }
            overridesByDate.get(dateStr)!.push(o);
        });

        // 4. Fetch all bookings for the branch in this month
        const bookingsWhere: {
            Status: { in: number[] };
            BookingDate: { gte: Date; lte: Date };
            BranchID?: number;
            OR?: any[];
        } = {
            Status: { in: [0, 1, 3] }, // Pending, Approved, Claimed
            BookingDate: {
                gte: startOfDayRange,
                lte: endOfDayRange,
            },
        };
        if (branchId !== null) {
            bookingsWhere.BranchID = branchId;
        }
        if (search) {
            bookingsWhere.OR = [
                { BookingNo: { contains: search } },
                { CustomerName: { contains: search } },
                { CarRegister: { contains: search } },
            ];
        }

        const bookings = await prisma.cM_Booking.findMany({
            where: bookingsWhere,
            select: {
                BookingDate: true,
            },
        });

        // Aggregate bookings count per date string
        const bookingsCountMap = new Map<string, number>();
        bookings.forEach(b => {
            const dateStr = b.BookingDate.toISOString().split('T')[0];
            bookingsCountMap.set(dateStr, (bookingsCountMap.get(dateStr) || 0) + 1);
        });

        // 5. Generate calendar date objects for the month
        const calendarData: Record<string, {
            isClosed: boolean;
            reason: string;
            maxQueue: number;
            bookedCount: number;
            hasOverride: boolean;
        }> = {};

        const daysInMonth = endDate.getUTCDate();
        for (let day = 1; day <= daysInMonth; day++) {
            const currentDate = new Date(Date.UTC(year, month - 1, day));
            
            // Format to YYYY-MM-DD
            const yearPart = currentDate.getUTCFullYear();
            const monthPart = String(currentDate.getUTCMonth() + 1).padStart(2, '0');
            const dayPart = String(currentDate.getUTCDate()).padStart(2, '0');
            const dateStr = `${yearPart}-${monthPart}-${dayPart}`;

            const dayOfWeek = currentDate.getUTCDay(); // 0 = Sunday, ..., 6 = Saturday

            let isClosed = false;
            let reason = '';

            // Check weekly off day
            if (openDaysMap.has(dayOfWeek) && !openDaysMap.get(dayOfWeek)) {
                isClosed = true;
                reason = 'วันหยุดประจำสัปดาห์';
            }

            // Check special holiday
            if (holidayDatesMap.has(dateStr)) {
                isClosed = true;
                reason = holidayDatesMap.get(dateStr)!;
            }

            const bookedCount = bookingsCountMap.get(dateStr) || 0;

            // Calculate per-day maxQueue with overrides applied
            const dayOverrides = overridesByDate.get(dateStr) || [];
            const hasOverride = dayOverrides.length > 0;

            let effectiveDailyMaxQueue = dailyMaxQueue;
            if (hasOverride) {
                // Recalculate: for each slot, apply override if exists
                effectiveDailyMaxQueue = slotsConfig.reduce((sum, slot) => {
                    const override = dayOverrides.find(
                        o => o.StartTime === slot.StartTime && o.EndTime === slot.EndTime
                    );
                    if (override) {
                        if (!override.IsOpen) return sum; // Slot closed, contribute 0
                        if (override.MaxQueueOverride !== null) return sum + override.MaxQueueOverride;
                    }
                    return sum + slot.MaxQueue;
                }, 0);
            }

            calendarData[dateStr] = {
                isClosed,
                reason,
                maxQueue: effectiveDailyMaxQueue,
                bookedCount,
                hasOverride,
            };
        }

        return NextResponse.json({
            success: true,
            data: calendarData,
        });

    } catch (error) {
        console.error('Error fetching calendar stats:', error);
        return NextResponse.json({ success: false, error: 'Internal Server Error' }, { status: 500 });
    }
}
