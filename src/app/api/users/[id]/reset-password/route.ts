// Reset Password API Route
// POST - Reset user password to default (Admin only)

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import bcrypt from 'bcryptjs';

interface RouteParams {
    params: Promise<{ id: string }>;
}

// Helper: Get default password from email (prefix before @)
function getDefaultPassword(email: string): string {
    return email.split('@')[0];
}

// POST /api/users/[id]/reset-password - Reset password to default
export async function POST(request: NextRequest, { params }: RouteParams) {
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

        // Get user
        const user = await prisma.cM_User.findUnique({
            where: { UserID: userId },
        });

        if (!user) {
            return NextResponse.json({ success: false, error: 'User not found' }, { status: 404 });
        }

        // Generate default password from email prefix
        const defaultPassword = getDefaultPassword(user.Email);
        const hashedPassword = await bcrypt.hash(defaultPassword, 10);

        // Update password
        await prisma.cM_User.update({
            where: { UserID: userId },
            data: { PasswordHash: hashedPassword },
        });

        return NextResponse.json({
            success: true,
            message: `รีเซ็ตรหัสผ่านสำเร็จ รหัสผ่านใหม่: ${defaultPassword}`,
            defaultPassword,
        });
    } catch (error) {
        console.error('Error resetting password:', error);
        return NextResponse.json(
            { success: false, error: 'Failed to reset password' },
            { status: 500 }
        );
    }
}
