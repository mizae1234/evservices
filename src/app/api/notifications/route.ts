import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';

// GET - Fetch notifications for current user
export async function GET() {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.id) {
            return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
        }

        const userId = parseInt(session.user.id);

        const [notifications, unreadCount] = await Promise.all([
            prisma.cM_Notification.findMany({
                where: { UserID: userId },
                orderBy: { CreateDate: 'desc' },
                take: 30,
            }),
            prisma.cM_Notification.count({
                where: { UserID: userId, IsRead: false },
            }),
        ]);

        const bookingIds = notifications.map(n => n.BookingID).filter((id): id is number => id !== null);
        const bookings = bookingIds.length > 0 
            ? await prisma.cM_Booking.findMany({
                where: { BookingID: { in: bookingIds } },
                select: { BookingID: true, BookingDate: true, BranchID: true }
              })
            : [];
        
        const bookingMap = new Map(bookings.map(b => [b.BookingID, b]));
        const enrichedNotis = notifications.map(n => ({
            ...n,
            Booking: n.BookingID ? bookingMap.get(n.BookingID) || null : null,
        }));

        return NextResponse.json({ success: true, data: enrichedNotis, unreadCount });
    } catch (error) {
        console.error('Error fetching notifications:', error);
        return NextResponse.json({ success: false, error: 'Failed to fetch notifications' }, { status: 500 });
    }
}

// PUT - Mark notification(s) as read
export async function PUT(request: Request) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.id) {
            return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
        }

        const userId = parseInt(session.user.id);
        const body = await request.json();
        const { notificationId, markAll } = body;

        if (markAll) {
            await prisma.cM_Notification.updateMany({
                where: { UserID: userId, IsRead: false },
                data: { IsRead: true },
            });
        } else if (notificationId) {
            await prisma.cM_Notification.updateMany({
                where: { NotificationID: parseInt(notificationId), UserID: userId },
                data: { IsRead: true },
            });
        }

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Error updating notification:', error);
        return NextResponse.json({ success: false, error: 'Failed to update' }, { status: 500 });
    }
}
