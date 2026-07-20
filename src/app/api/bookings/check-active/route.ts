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
        const registerNo = searchParams.get('registerNo');

        if (!registerNo) {
            return NextResponse.json({ success: false, hasActiveBooking: false });
        }

        // Clean the register no (remove spaces) to match DB format
        const cleanRegister = registerNo.replace(/\s/g, '');

        // Find any booking from today onwards
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const bookings = await prisma.cM_Booking.findMany({
            where: {
                CarRegister: cleanRegister,
                Status: {
                    in: [0, 1]
                },
                BookingDate: {
                    gte: today
                }
            },
            include: {
                Branch: {
                    select: { BranchName: true }
                }
            },
            orderBy: {
                BookingDate: 'asc'
            }
        });

        // Current Thai local time (UTC+7)
        const nowThai = new Date(new Date().getTime() + (7 * 60 * 60 * 1000));
        const todayThaiStr = nowThai.toISOString().split('T')[0];

        const activeBooking = bookings.find(b => {
            const bDateStr = new Date(b.BookingDate).toISOString().split('T')[0];
            if (bDateStr > todayThaiStr) {
                return true; // Future date
            }
            if (bDateStr === todayThaiStr) {
                // Same day: check if booking's StartTime is in the future
                const [bHour, bMin] = b.StartTime.split(':').map(Number);
                const currentHour = nowThai.getUTCHours();
                const currentMin = nowThai.getUTCMinutes();
                if (bHour > currentHour || (bHour === currentHour && bMin > currentMin)) {
                    return true; // Later today
                }
            }
            return false;
        });

        if (activeBooking) {
            return NextResponse.json({
                success: true,
                hasActiveBooking: true,
                booking: {
                    BookingNo: activeBooking.BookingNo,
                    BookingDate: activeBooking.BookingDate,
                    StartTime: activeBooking.StartTime,
                    EndTime: activeBooking.EndTime,
                    Status: activeBooking.Status,
                    BranchName: activeBooking.Branch.BranchName,
                    CustomerName: activeBooking.CustomerName
                }
            });
        }

        return NextResponse.json({ success: true, hasActiveBooking: false });

    } catch (error) {
        console.error('Error checking active booking:', error);
        return NextResponse.json({ success: false, error: 'Internal Server Error' }, { status: 500 });
    }
}
