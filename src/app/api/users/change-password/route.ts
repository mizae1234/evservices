// Change Password API Route
// POST - User changes their own password

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import bcrypt from 'bcryptjs';

// POST /api/users/change-password - Change own password
export async function POST(request: NextRequest) {
    try {
        const session = await getServerSession(authOptions);

        if (!session?.user) {
            return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
        }

        const body = await request.json();
        const { currentPassword, newPassword, confirmPassword } = body;

        // Validation
        if (!currentPassword || !newPassword || !confirmPassword) {
            return NextResponse.json(
                { success: false, error: 'กรุณากรอกข้อมูลให้ครบ' },
                { status: 400 }
            );
        }

        if (newPassword !== confirmPassword) {
            return NextResponse.json(
                { success: false, error: 'รหัสผ่านใหม่ไม่ตรงกัน' },
                { status: 400 }
            );
        }

        if (newPassword.length < 4) {
            return NextResponse.json(
                { success: false, error: 'รหัสผ่านต้องมีอย่างน้อย 4 ตัวอักษร' },
                { status: 400 }
            );
        }

        // Get current user
        const user = await prisma.cM_User.findUnique({
            where: { Email: session.user.email! },
        });

        if (!user) {
            return NextResponse.json({ success: false, error: 'User not found' }, { status: 404 });
        }

        // Verify current password
        const isPasswordValid = await bcrypt.compare(currentPassword, user.PasswordHash);
        if (!isPasswordValid) {
            return NextResponse.json(
                { success: false, error: 'รหัสผ่านปัจจุบันไม่ถูกต้อง' },
                { status: 400 }
            );
        }

        // Hash new password
        const hashedPassword = await bcrypt.hash(newPassword, 10);

        // Update password
        await prisma.cM_User.update({
            where: { UserID: user.UserID },
            data: { PasswordHash: hashedPassword },
        });

        return NextResponse.json({
            success: true,
            message: 'เปลี่ยนรหัสผ่านสำเร็จ',
        });
    } catch (error) {
        console.error('Error changing password:', error);
        return NextResponse.json(
            { success: false, error: 'Failed to change password' },
            { status: 500 }
        );
    }
}
