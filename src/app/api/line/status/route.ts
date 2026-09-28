// LINE Link Status API (ของผู้ใช้ที่ login อยู่)
// GET   → สถานะการผูกบัญชี LINE ของตัวเอง
// PATCH → เปิด/ปิดการแจ้งเตือน LINE ของตัวเอง

export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { isLineConfigured } from '@/lib/line';
import { canManageUsers } from '@/lib/permissions';

export async function GET() {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.email) {
            return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
        }

        const user = await prisma.cM_User.findUnique({
            where: { Email: session.user.email },
            select: {
                UserID: true,
                LineLink: {
                    select: {
                        DisplayName: true,
                        PictureUrl: true,
                        IsActive: true,
                        NotifyEnabled: true,
                        LinkedDate: true,
                    },
                },
            },
        });

        return NextResponse.json({
            success: true,
            data: {
                configured: isLineConfigured(),
                linked: Boolean(user?.LineLink),
                link: user?.LineLink || null,
                oaBasicId: process.env.LINE_OA_BASIC_ID || null,
                addFriendUrl: process.env.LINE_ADD_FRIEND_URL || null,
            },
        });
    } catch (error) {
        console.error('[LINE status] error:', error);
        return NextResponse.json({ success: false, error: 'Failed to fetch LINE status' }, { status: 500 });
    }
}

export async function PATCH(request: NextRequest) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.email) {
            return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
        }

        // ผู้ใช้ทั่วไปปิด/เปิดการแจ้งเตือนเองไม่ได้ — เป็นสิทธิ์ของผู้ดูแลระบบ
        if (!canManageUsers(session.user.role)) {
            return NextResponse.json({
                success: false,
                error: 'การตั้งค่าแจ้งเตือนจัดการโดยผู้ดูแลระบบ กรุณาติดต่อผู้ดูแลระบบ',
            }, { status: 403 });
        }

        const { notifyEnabled } = await request.json();
        if (typeof notifyEnabled !== 'boolean') {
            return NextResponse.json({ success: false, error: 'notifyEnabled must be boolean' }, { status: 400 });
        }

        const user = await prisma.cM_User.findUnique({
            where: { Email: session.user.email },
            select: { UserID: true, LineLink: { select: { LinkID: true } } },
        });

        if (!user?.LineLink) {
            return NextResponse.json({ success: false, error: 'ยังไม่ได้ผูกบัญชี LINE' }, { status: 404 });
        }

        await prisma.cM_UserLineLink.update({
            where: { LinkID: user.LineLink.LinkID },
            data: { NotifyEnabled: notifyEnabled },
        });

        return NextResponse.json({
            success: true,
            message: notifyEnabled ? 'เปิดการแจ้งเตือน LINE แล้ว' : 'ปิดการแจ้งเตือน LINE แล้ว',
        });
    } catch (error) {
        console.error('[LINE status] PATCH error:', error);
        return NextResponse.json({ success: false, error: 'Failed to update LINE notification setting' }, { status: 500 });
    }
}
