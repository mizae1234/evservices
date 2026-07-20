// Service Types Seed API Route
// POST: Initialize the 3 default service types (one-time setup)

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';

const DEFAULT_SERVICE_TYPES = [
    { Code: 'MILEAGE_CHECK', Name: 'เช็คระยะเท่านั้น', RequiresMileage: true, SortOrder: 1 },
    { Code: 'MILEAGE_PLUS_REPAIR', Name: 'เช็คระยะ + ซ่อม', RequiresMileage: true, SortOrder: 2 },
    { Code: 'GENERAL_REPAIR', Name: 'ซ่อมทั่วไป', RequiresMileage: false, SortOrder: 3 },
];

export async function POST() {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user || session.user.role !== 'ADMIN') {
            return NextResponse.json({ success: false, error: 'Admin only' }, { status: 403 });
        }

        const results = [];
        for (const st of DEFAULT_SERVICE_TYPES) {
            const existing = await prisma.cM_ServiceType.findFirst({
                where: { Code: st.Code },
            });

            if (existing) {
                results.push({ Code: st.Code, status: 'already exists', data: existing });
            } else {
                const created = await prisma.cM_ServiceType.create({ data: st });
                results.push({ Code: st.Code, status: 'created', data: created });
            }
        }

        return NextResponse.json({
            success: true,
            data: results,
            message: 'Service types initialized',
        });
    } catch (error) {
        console.error('Error seeding service types:', error);
        return NextResponse.json(
            { success: false, error: 'Failed to seed service types' },
            { status: 500 }
        );
    }
}
