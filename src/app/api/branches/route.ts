// Branches API Route
// Returns list of service branches

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';

// GET /api/branches - Get all active branches
export async function GET() {
    try {
        const session = await getServerSession(authOptions);

        if (!session?.user) {
            return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
        }

        const branches = await prisma.cM_MsServiceBranch.findMany({
            where: { IsActive: true },
            orderBy: { BranchName: 'asc' },
        });

        return NextResponse.json({
            success: true,
            data: branches,
        });
    } catch (error) {
        console.error('Error fetching branches:', error);
        return NextResponse.json(
            { success: false, error: 'Failed to fetch branches' },
            { status: 500 }
        );
    }
}
