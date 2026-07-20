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
        if (!session?.user) {
            return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
        }

        const { id } = await context.params;
        const bookingId = parseInt(id);

        if (isNaN(bookingId)) {
            return NextResponse.json({ success: false, error: 'Invalid booking ID' }, { status: 400 });
        }

        const body = await request.json();
        const { content } = body;

        if (!content || content.trim() === '') {
            return NextResponse.json({ success: false, error: 'Note content cannot be empty' }, { status: 400 });
        }

        const booking = await prisma.cM_Booking.findUnique({
            where: { BookingID: bookingId }
        });

        if (!booking) {
            return NextResponse.json({ success: false, error: 'Booking not found' }, { status: 404 });
        }

        // Branch authorization check
        if (session.user.role === 'SERVICE_CENTER' && session.user.branchId && booking.BranchID !== session.user.branchId) {
            return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 403 });
        }

        // Create log record
        const log = await prisma.cM_BookingLog.create({
            data: {
                BookingID: bookingId,
                LogType: 'NOTE',
                Content: content,
                CreateBy: session.user.email || 'SYSTEM'
            }
        });

        return NextResponse.json({
            success: true,
            data: log
        });

    } catch (error) {
        console.error('Error creating booking log:', error);
        return NextResponse.json(
            { success: false, error: 'Failed to create log' },
            { status: 500 }
        );
    }
}
