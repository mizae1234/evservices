// Bay Availability API Route
// GET: Calculate bay availability for a branch on a specific date
// Returns each bay with its booked time blocks and available gaps

export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';

// Helper: Convert "HH:MM" string to minutes since midnight
function timeToMinutes(time: string): number {
    const [hours, minutes] = time.split(':').map(Number);
    return hours * 60 + minutes;
}

// Helper: Convert minutes since midnight to "HH:MM" string
function minutesToTime(minutes: number): string {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
}

// Default branch operating hours (can be overridden by branch config)
const DEFAULT_OPEN_TIME = '08:30';
const DEFAULT_CLOSE_TIME = '17:30';

const THAI_DAYS = ['วันอาทิตย์', 'วันจันทร์', 'วันอังคาร', 'วันพุธ', 'วันพฤหัสบดี', 'วันศุกร์', 'วันเสาร์'];

export async function GET(request: NextRequest) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user) {
            return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
        }

        const { searchParams } = new URL(request.url);
        let branchIdStr = searchParams.get('branchId');
        const dateStr = searchParams.get('date'); // YYYY-MM-DD

        // If service center user, force their branch
        if (session.user.role === 'SERVICE_CENTER') {
            if (!session.user.branchId) {
                return NextResponse.json({ success: false, error: 'User is not assigned to a branch' }, { status: 400 });
            }
            branchIdStr = session.user.branchId.toString();
        }

        if (!branchIdStr || !dateStr) {
            return NextResponse.json({ success: false, error: 'Missing branchId or date' }, { status: 400 });
        }

        const branchId = parseInt(branchIdStr);

        // Parse date
        const [year, month, day] = dateStr.split('-').map(Number);
        const dateObj = new Date(Date.UTC(year, month - 1, day));
        const startOfDay = new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0));
        const endOfDay = new Date(Date.UTC(year, month - 1, day, 23, 59, 59, 999));

        // 1. Check if branch is closed (weekly off-day)
        const dayOfWeek = dateObj.getUTCDay();
        const workingDayConfig = await prisma.cM_BranchWorkingDay.findUnique({
            where: {
                BranchID_DayOfWeek: {
                    BranchID: branchId,
                    DayOfWeek: dayOfWeek,
                },
            },
        });

        const isDefaultClosed = dayOfWeek === 0; // Sunday
        const isClosedDay = workingDayConfig ? !workingDayConfig.IsOpen : isDefaultClosed;

        if (isClosedDay) {
            return NextResponse.json({
                success: true,
                isClosed: true,
                reason: `วันหยุดทำการประจำสัปดาห์ (${THAI_DAYS[dayOfWeek]})`,
                data: [],
            });
        }

        // 2. Check special holiday
        const specialHoliday = await prisma.cM_BranchHoliday.findFirst({
            where: {
                BranchID: branchId,
                HolidayDate: { gte: startOfDay, lte: endOfDay },
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

        // 3. Fetch active bays for this branch
        let bays = await prisma.cM_ServiceBay.findMany({
            where: { BranchID: branchId, IsActive: true },
            orderBy: { SortOrder: 'asc' },
        });

        // Filter out offline bays for CS role (Call Center / Online Booking)
        if (session.user.role === 'CS') {
            bays = bays.filter(b => b.IsOnline);
        }

        if (bays.length === 0) {
            return NextResponse.json({
                success: true,
                isClosed: false,
                data: [],
                message: 'ยังไม่มี Service Bay สำหรับสาขานี้',
            });
        }

        // 4. Fetch all bookings for this branch on this date (excluding rejected/cancelled)
        const bookings = await prisma.cM_Booking.findMany({
            where: {
                BranchID: branchId,
                BookingDate: { gte: startOfDay, lte: endOfDay },
                BayID: { not: null },
                Status: { in: [0, 1, 3] }, // PENDING, APPROVED, CONVERTED
            },
            include: {
                ServiceType: {
                    select: { Code: true, Name: true },
                },
            },
            orderBy: { StartTime: 'asc' },
        });

        // 5. Get branch operating hours from branch settings
        const branchInfo = await prisma.cM_MsServiceBranch.findUnique({
            where: { BranchID: branchId },
            select: { OpenTime: true, CloseTime: true },
        });

        let openTime = branchInfo?.OpenTime || DEFAULT_OPEN_TIME;
        let closeTime = branchInfo?.CloseTime || DEFAULT_CLOSE_TIME;

        const openMinutes = timeToMinutes(openTime);
        const closeMinutes = timeToMinutes(closeTime);

        // 6. Build bay availability data
        const bayAvailability = bays.map((bay) => {
            const bayBookings = bookings
                .filter((b) => b.BayID === bay.BayID)
                .map((b) => ({
                    BookingID: b.BookingID,
                    BookingNo: b.BookingNo,
                    StartTime: b.StartTime,
                    EndTime: b.EndTime,
                    StartMinutes: timeToMinutes(b.StartTime),
                    EndMinutes: timeToMinutes(b.EndTime),
                    CustomerName: b.CustomerName,
                    CarRegister: b.CarRegister,
                    CarModel: b.CarModel,
                    ServiceType: b.ServiceType,
                    Status: b.Status,
                    DurationMinutes: b.DurationMinutes,
                    BayID: b.BayID,
                    BookingDate: b.BookingDate,
                }))
                .sort((a, b) => a.StartMinutes - b.StartMinutes);

            // Inject lunch break block (12:00 - 13:00)
            bayBookings.push({
                BookingID: -999 - bay.BayID, // unique dummy ID
                BookingNo: `LUNCH-${bay.BayID}`,
                StartTime: '12:00',
                EndTime: '13:00',
                StartMinutes: 720, // 12 * 60
                EndMinutes: 780,   // 13 * 60
                CustomerName: '[ปิดช่องซ่อมชั่วคราว]',
                CarRegister: 'BREAK',
                CarModel: 'เวลาพักกลางวัน (12:00 - 13:00 น.)',
                ServiceType: null,
                Status: 4,
                DurationMinutes: 60,
                BayID: bay.BayID,
                BookingDate: new Date(),
            });

            // Sort again after injection
            bayBookings.sort((a, b) => a.StartMinutes - b.StartMinutes);

            // Calculate available gaps
            const availableSlots: { StartTime: string; EndTime: string; DurationMinutes: number }[] = [];
            let cursor = openMinutes;

            for (const booking of bayBookings) {
                if (booking.StartMinutes > cursor) {
                    availableSlots.push({
                        StartTime: minutesToTime(cursor),
                        EndTime: minutesToTime(booking.StartMinutes),
                        DurationMinutes: booking.StartMinutes - cursor,
                    });
                }
                cursor = Math.max(cursor, booking.EndMinutes);
            }

            // Gap after last booking until closing
            if (cursor < closeMinutes) {
                availableSlots.push({
                    StartTime: minutesToTime(cursor),
                    EndTime: minutesToTime(closeMinutes),
                    DurationMinutes: closeMinutes - cursor,
                });
            }

            return {
                BayID: bay.BayID,
                BayName: bay.BayName,
                SortOrder: bay.SortOrder,
                Bookings: bayBookings,
                AvailableSlots: availableSlots,
                TotalBookedMinutes: bayBookings.reduce((sum, b) => sum + (b.EndMinutes - b.StartMinutes), 0),
                TotalAvailableMinutes: availableSlots.reduce((sum, s) => sum + s.DurationMinutes, 0),
            };
        });

        return NextResponse.json({
            success: true,
            isClosed: false,
            operatingHours: { openTime, closeTime },
            data: bayAvailability,
        });
    } catch (error) {
        console.error('Error fetching bay availability:', error);
        return NextResponse.json(
            { success: false, error: 'Failed to fetch bay availability' },
            { status: 500 }
        );
    }
}
