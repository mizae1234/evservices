import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';

export async function GET() {
    try {
        const session = await getServerSession(authOptions);

        if (!session?.user || session.user.role !== 'ADMIN') {
            return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
        }

        const branches = await prisma.cM_MsServiceBranch.findMany({
            orderBy: { BranchCode: 'asc' },
            include: {
                _count: {
                    select: { ServiceBays: true }
                }
            }
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

export async function POST(request: Request) {
    try {
        const session = await getServerSession(authOptions);

        if (!session?.user || session.user.role !== 'ADMIN') {
            return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
        }

        const body = await request.json();
        const { BranchCode, BranchName, Address, Phone, IsActive, AllowOnlineBooking } = body;

        if (!BranchCode || !BranchName) {
            return NextResponse.json({ success: false, error: 'BranchCode and BranchName are required' }, { status: 400 });
        }

        const existing = await prisma.cM_MsServiceBranch.findUnique({
            where: { BranchCode }
        });

        if (existing) {
            return NextResponse.json({ success: false, error: 'BranchCode already exists' }, { status: 400 });
        }

        const newBranch = await prisma.cM_MsServiceBranch.create({
            data: {
                BranchCode,
                BranchName,
                Address: Address || null,
                Phone: Phone || null,
                IsActive: IsActive !== undefined ? IsActive : true,
                AllowOnlineBooking: AllowOnlineBooking !== undefined ? AllowOnlineBooking : false,
            }
        });

        return NextResponse.json({
            success: true,
            data: newBranch,
        });
    } catch (error) {
        console.error('Error creating branch:', error);
        return NextResponse.json(
            { success: false, error: 'Failed to create branch' },
            { status: 500 }
        );
    }
}
