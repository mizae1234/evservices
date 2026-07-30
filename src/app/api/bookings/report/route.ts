import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';

export async function GET(request: NextRequest) {
    try {
        const session = await getServerSession(authOptions);
        if (!session) {
            return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
        }

        const { searchParams } = new URL(request.url);
        const branchId = searchParams.get('branchId');
        const dateFrom = searchParams.get('dateFrom');
        const dateTo = searchParams.get('dateTo');
        const search = searchParams.get('search');
        const status = searchParams.get('status');

        // Role-based restrictions
        let targetBranchId: number | undefined = undefined;
        if (session.user.role === 'SERVICE_CENTER') {
            // Service Center can only see their own branch
            targetBranchId = Number(session.user.branchId) || 0;
        } else if (branchId && branchId !== 'all') {
            targetBranchId = parseInt(branchId);
        }

        // Build where clause
        const whereClause: any = {
            IsActive: true,
        };

        if (targetBranchId) {
            whereClause.BranchID = targetBranchId;
        }

        if (dateFrom && dateTo) {
            const endDate = new Date(dateTo);
            endDate.setUTCHours(23, 59, 59, 999);
            
            whereClause.BookingDate = {
                gte: new Date(dateFrom),
                lte: endDate,
            };
        } else if (dateFrom) {
            whereClause.BookingDate = {
                gte: new Date(dateFrom),
            };
        } else if (dateTo) {
            const endDate = new Date(dateTo);
            endDate.setUTCHours(23, 59, 59, 999);
            
            whereClause.BookingDate = {
                lte: endDate,
            };
        }

        if (status && status !== 'all') {
            whereClause.Status = parseInt(status);
        }

        if (search) {
            whereClause.OR = [
                { BookingNo: { contains: search } },
                { CustomerName: { contains: search } },
                { CarRegister: { contains: search } },
                { CustomerPhone: { contains: search } },
            ];
        }

        const bookings = await prisma.cM_Booking.findMany({
            where: whereClause,
            include: {
                Branch: {
                    select: { BranchName: true },
                },
                ServiceType: {
                    select: { Name: true },
                },
            },
            orderBy: [
                { BookingDate: 'desc' },
                { StartTime: 'asc' },
            ],
        });

        return NextResponse.json({
            success: true,
            data: bookings,
        });
    } catch (error) {
        console.error('Error fetching bookings report:', error);
        return NextResponse.json(
            { success: false, error: 'Failed to fetch bookings report' },
            { status: 500 }
        );
    }
}
