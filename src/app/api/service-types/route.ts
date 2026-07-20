// Service Types API Route
// GET: Fetch all active service types (accessible by all authenticated users)

export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';

export async function GET() {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user) {
            return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
        }

        const serviceTypes = await prisma.cM_ServiceType.findMany({
            where: { IsActive: true },
            orderBy: { SortOrder: 'asc' },
            select: {
                ServiceTypeID: true,
                Code: true,
                Name: true,
                RequiresMileage: true,
                SortOrder: true,
            },
        });

        return NextResponse.json({
            success: true,
            data: serviceTypes,
        });
    } catch (error) {
        console.error('Error fetching service types:', error);
        return NextResponse.json(
            { success: false, error: 'Failed to fetch service types' },
            { status: 500 }
        );
    }
}
