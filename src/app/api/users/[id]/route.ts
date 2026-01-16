// User by ID API Route
// GET - Get single user
// PUT - Update user (Admin only)
// DELETE - Delete/deactivate user (Admin only)

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';

interface RouteParams {
    params: Promise<{ id: string }>;
}

// GET /api/users/[id] - Get user by ID
export async function GET(request: NextRequest, { params }: RouteParams) {
    try {
        const session = await getServerSession(authOptions);
        const { id } = await params;

        if (!session?.user) {
            return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
        }

        const userId = parseInt(id);
        const user = await prisma.cM_User.findUnique({
            where: { UserID: userId },
            include: {
                Role: true,
                Branch: true,
            },
        });

        if (!user) {
            return NextResponse.json({ success: false, error: 'User not found' }, { status: 404 });
        }

        return NextResponse.json({
            success: true,
            data: {
                UserID: user.UserID,
                Email: user.Email,
                FullName: user.FullName,
                Phone: user.Phone,
                RoleID: user.RoleID,
                BranchID: user.BranchID,
                IsActive: user.IsActive,
                Role: {
                    RoleCode: user.Role.RoleCode,
                    RoleName: user.Role.RoleName,
                },
                Branch: user.Branch ? {
                    BranchID: user.Branch.BranchID,
                    BranchName: user.Branch.BranchName,
                } : null,
            },
        });
    } catch (error) {
        console.error('Error fetching user:', error);
        return NextResponse.json(
            { success: false, error: 'Failed to fetch user' },
            { status: 500 }
        );
    }
}

// PUT /api/users/[id] - Update user
export async function PUT(request: NextRequest, { params }: RouteParams) {
    try {
        const session = await getServerSession(authOptions);
        const { id } = await params;

        if (!session?.user) {
            return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
        }

        // Admin only
        if (session.user.role !== 'ADMIN') {
            return NextResponse.json({ success: false, error: 'Access denied' }, { status: 403 });
        }

        const userId = parseInt(id);
        const body = await request.json();
        const { FullName, Phone, RoleID, BranchID, IsActive } = body;

        // Check if user exists
        const existingUser = await prisma.cM_User.findUnique({
            where: { UserID: userId },
        });

        if (!existingUser) {
            return NextResponse.json({ success: false, error: 'User not found' }, { status: 404 });
        }

        const user = await prisma.cM_User.update({
            where: { UserID: userId },
            data: {
                FullName: FullName || existingUser.FullName,
                Phone: Phone !== undefined ? Phone : existingUser.Phone,
                RoleID: RoleID ? parseInt(RoleID) : existingUser.RoleID,
                BranchID: BranchID !== undefined ? (BranchID ? parseInt(BranchID) : null) : existingUser.BranchID,
                IsActive: IsActive !== undefined ? IsActive : existingUser.IsActive,
            },
            include: {
                Role: true,
                Branch: true,
            },
        });

        return NextResponse.json({
            success: true,
            data: {
                UserID: user.UserID,
                Email: user.Email,
                FullName: user.FullName,
                IsActive: user.IsActive,
            },
            message: 'อัปเดตข้อมูลผู้ใช้สำเร็จ',
        });
    } catch (error) {
        console.error('Error updating user:', error);
        return NextResponse.json(
            { success: false, error: 'Failed to update user' },
            { status: 500 }
        );
    }
}

// DELETE /api/users/[id] - Deactivate user
export async function DELETE(request: NextRequest, { params }: RouteParams) {
    try {
        const session = await getServerSession(authOptions);
        const { id } = await params;

        if (!session?.user) {
            return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
        }

        // Admin only
        if (session.user.role !== 'ADMIN') {
            return NextResponse.json({ success: false, error: 'Access denied' }, { status: 403 });
        }

        const userId = parseInt(id);

        // Prevent self-deletion
        if (userId.toString() === session.user.id) {
            return NextResponse.json(
                { success: false, error: 'ไม่สามารถลบบัญชีตัวเองได้' },
                { status: 400 }
            );
        }

        // Soft delete - set IsActive to false
        await prisma.cM_User.update({
            where: { UserID: userId },
            data: { IsActive: false },
        });

        return NextResponse.json({
            success: true,
            message: 'ลบผู้ใช้สำเร็จ',
        });
    } catch (error) {
        console.error('Error deleting user:', error);
        return NextResponse.json(
            { success: false, error: 'Failed to delete user' },
            { status: 500 }
        );
    }
}
