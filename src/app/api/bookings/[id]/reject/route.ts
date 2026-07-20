// Booking Reject API Route
// POST: Reject a pending booking (Manager / Admin only)

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';

export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user) {
            return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
        }

        const { id } = await params;
        const bookingId = parseInt(id);

        const body = await request.json();
        const { reason } = body;

        // Fetch the booking
        const booking = await prisma.cM_Booking.findUnique({
            where: { BookingID: bookingId },
        });

        if (!booking) {
            return NextResponse.json({ success: false, error: 'Booking not found' }, { status: 404 });
        }

        // Check permission
        if (session.user.role === 'SERVICE_CENTER') {
            if (booking.BranchID !== session.user.branchId) {
                return NextResponse.json({ success: false, error: 'Permission denied' }, { status: 403 });
            }
        } else if (session.user.role !== 'ADMIN') {
            return NextResponse.json({ success: false, error: 'Permission denied' }, { status: 403 });
        }

        // Only PENDING (0) bookings can be rejected
        if (booking.Status !== 0) {
            return NextResponse.json(
                { success: false, error: 'Only pending bookings can be rejected' },
                { status: 400 }
            );
        }

        // Update status to REJECTED (2)
        const updatedBooking = await prisma.cM_Booking.update({
            where: { BookingID: bookingId },
            data: { Status: 2 },
        });

        // Log the rejection
        await prisma.cM_BookingLog.create({
            data: {
                BookingID: bookingId,
                LogType: 'REJECTED',
                Content: `Booking rejected by ${session.user.name}${reason ? '. Reason: ' + reason : ''}`,
                CreateBy: session.user.name || session.user.email || 'System',
            },
        });

        return NextResponse.json({
            success: true,
            data: updatedBooking,
            message: 'Booking rejected',
        });
    } catch (error) {
        console.error('Error rejecting booking:', error);
        return NextResponse.json(
            { success: false, error: 'Failed to reject booking' },
            { status: 500 }
        );
    }
}
