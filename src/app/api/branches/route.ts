// Branches API Route
// Returns list of service branches

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';

import { isCSRole } from '@/lib/permissions';

// GET /api/branches - Get all active branches
// CS roles automatically see only branches with online booking enabled
export async function GET() {
    try {
        const session = await getServerSession(authOptions);

        if (!session?.user) {
            return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
        }

        const where: Record<string, unknown> = { IsActive: true };

        // CS roles see only branches that allow online booking
        if (isCSRole(session.user.role)) {
            where.AllowOnlineBooking = true;
        }

        const branches = await prisma.cM_MsServiceBranch.findMany({
            where,
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
