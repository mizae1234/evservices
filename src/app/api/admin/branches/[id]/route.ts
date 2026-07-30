import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';

export async function PUT(
    request: Request,
    context: { params: Promise<{ id: string }> }
) {
    try {
        const session = await getServerSession(authOptions);

        if (!session?.user || session.user.role !== 'ADMIN') {
            return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
        }

        const { id } = await context.params;
        const branchId = parseInt(id);
        if (isNaN(branchId)) {
            return NextResponse.json({ success: false, error: 'Invalid Branch ID' }, { status: 400 });
        }

        const body = await request.json();
        const { BranchCode, BranchName, Address, Phone, IsActive, AllowOnlineBooking } = body;

        if (!BranchCode || !BranchName) {
            return NextResponse.json({ success: false, error: 'BranchCode and BranchName are required' }, { status: 400 });
        }

        const existing = await prisma.cM_MsServiceBranch.findUnique({
            where: { BranchCode }
        });

        if (existing && existing.BranchID !== branchId) {
            return NextResponse.json({ success: false, error: 'BranchCode already used by another branch' }, { status: 400 });
        }

        const updatedBranch = await prisma.cM_MsServiceBranch.update({
            where: { BranchID: branchId },
            data: {
                BranchCode,
                BranchName,
                Address: Address !== undefined ? Address : null,
                Phone: Phone !== undefined ? Phone : null,
                IsActive: IsActive !== undefined ? IsActive : true,
                AllowOnlineBooking: AllowOnlineBooking !== undefined ? AllowOnlineBooking : false,
            }
        });

        return NextResponse.json({
            success: true,
            data: updatedBranch,
        });
    } catch (error) {
        console.error('Error updating branch:', error);
        return NextResponse.json(
            { success: false, error: 'Failed to update branch' },
            { status: 500 }
        );
    }
}
