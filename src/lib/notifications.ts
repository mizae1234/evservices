import prisma from '@/lib/prisma';

export const NOTI_TYPES = {
    BOOKING_NEW: 'BOOKING_NEW',
    BOOKING_APPROVED: 'BOOKING_APPROVED',
    BOOKING_CANCELLED: 'BOOKING_CANCELLED',
    BOOKING_RESCHEDULED: 'BOOKING_RESCHEDULED',
} as const;

export const formatBookingDate = (d: Date) => {
    const date = new Date(d);
    return `${date.getUTCDate()}/${date.getUTCMonth() + 1}/${date.getUTCFullYear()}`;
};

export async function notifyCSUsers(bookingId: number, type: string, title: string, message: string, excludeUserId?: number) {
    try {
        const booking = await prisma.cM_Booking.findUnique({
            where: { BookingID: bookingId },
            select: { BookingType: true },
        });

        const bType = booking?.BookingType || 'EV7';

        // Notify general CS (AllowedBookingType is null) or specific CS for this booking type
        const csUsers = await prisma.cM_User.findMany({
            where: {
                IsActive: true,
                Role: {
                    OR: [
                        { RoleCode: 'CS' },
                        { AllowedBookingType: null },
                        { AllowedBookingType: bType },
                    ],
                },
                ...(excludeUserId ? { UserID: { not: excludeUserId } } : {})
            },
            select: { UserID: true },
        });

        if (csUsers.length > 0) {
            await prisma.cM_Notification.createMany({
                data: csUsers.map(u => ({
                    UserID: u.UserID,
                    Type: type,
                    Title: title,
                    Message: message,
                    BookingID: bookingId,
                })),
            });
        }
    } catch (error) {
        console.error('Error notifying CS users:', error);
    }
}

export async function notifyBranchAndAdminUsers(branchId: number, bookingId: number, type: string, title: string, message: string, excludeUserId?: number) {
    try {
        const targetUsers = await prisma.cM_User.findMany({
            where: {
                IsActive: true,
                OR: [
                    {
                        Role: { RoleCode: 'SERVICE_CENTER' },
                        BranchID: branchId
                    },
                    {
                        Role: { RoleCode: 'ADMIN' }
                    },
                ],
            },
            select: { UserID: true },
        });

        if (targetUsers.length > 0) {
            await prisma.cM_Notification.createMany({
                data: targetUsers.map(u => ({
                    UserID: u.UserID,
                    Type: type,
                    Title: title,
                    Message: message,
                    BookingID: bookingId,
                })),
            });
        }
    } catch (error) {
        console.error('Error notifying branch/admin users:', error);
    }
}
