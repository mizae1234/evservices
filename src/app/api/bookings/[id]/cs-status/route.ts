import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';

export async function POST(
    request: NextRequest,
    context: { params: Promise<{ id: string }> }
) {
    try {
        const session = await getServerSession(authOptions);
        if (!session) {
            return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
        }

        const { id } = await context.params;
        const bookingId = parseInt(id);
        const data = await request.json();
        const { csStatus, note } = data;

        if (!csStatus) {
            return NextResponse.json({ success: false, error: 'Missing csStatus' }, { status: 400 });
        }

        // Check if booking exists
        const booking = await prisma.cM_Booking.findUnique({
            where: { BookingID: bookingId }
        });

        if (!booking) {
            return NextResponse.json({ success: false, error: 'Booking not found' }, { status: 404 });
        }

        // Update CSStatus
        await prisma.cM_Booking.update({
            where: { BookingID: bookingId },
            data: { CSStatus: csStatus }
        });

        // Add note to BookingLog if provided
        if (note && note.trim() !== '') {
            await prisma.cM_BookingLog.create({
                data: {
                    BookingID: bookingId,
                    LogType: 'CS_NOTE',
                    Content: note,
                    CreateBy: session.user.name || session.user.email || 'Unknown',
                }
            });
        }

        return NextResponse.json({ success: true, message: 'CS Status updated successfully' });
    } catch (error) {
        console.error('Error updating CS status:', error);
        return NextResponse.json({ success: false, error: 'Internal Server Error' }, { status: 500 });
    }
}
