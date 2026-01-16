// Roles API Route
// GET - List all roles

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';

// GET /api/roles - Get all roles
export async function GET() {
    try {
        const session = await getServerSession(authOptions);

        if (!session?.user) {
            return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
        }

        const roles = await prisma.cM_Role.findMany({
            where: { IsActive: true },
            orderBy: { RoleName: 'asc' },
        });

        return NextResponse.json({
            success: true,
            data: roles,
        });
    } catch (error) {
        console.error('Error fetching roles:', error);
        return NextResponse.json(
            { success: false, error: 'Failed to fetch roles' },
            { status: 500 }
        );
    }
}
