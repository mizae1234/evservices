// Car Models API Route
// Returns list of car models

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';

// GET /api/car-models - Get all active car models
export async function GET() {
    try {
        const session = await getServerSession(authOptions);

        if (!session?.user) {
            return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
        }

        const carModels = await prisma.cM_MsCarModel.findMany({
            where: { IsActive: true },
            orderBy: [{ Brand: 'asc' }, { ModelName: 'asc' }],
        });

        return NextResponse.json({
            success: true,
            data: carModels,
        });
    } catch (error) {
        console.error('Error fetching car models:', error);
        return NextResponse.json(
            { success: false, error: 'Failed to fetch car models' },
            { status: 500 }
        );
    }
}
