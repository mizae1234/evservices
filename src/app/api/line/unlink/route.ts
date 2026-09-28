// LINE Unlink API — ยกเลิกการผูกบัญชี LINE ของผู้ใช้ที่ login อยู่

export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { isLineConfigured, linePush, textMessage } from '@/lib/line';
import { canManageUsers } from '@/lib/permissions';

export async function POST() {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.email) {
            return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
        }

        // ยกเลิกการเชื่อมต่อของตัวเองไม่ได้แล้ว — ให้ผู้ดูแลระบบจัดการที่หน้า "จัดการผู้ใช้"
        if (!canManageUsers(session.user.role)) {
            return NextResponse.json({
                success: false,
                error: 'การยกเลิกการเชื่อมต่อจัดการโดยผู้ดูแลระบบ กรุณาติดต่อผู้ดูแลระบบ',
            }, { status: 403 });
        }

        const user = await prisma.cM_User.findUnique({
            where: { Email: session.user.email },
            select: { UserID: true, LineLink: { select: { LinkID: true, LineUserID: true } } },
        });

        if (!user?.LineLink) {
            return NextResponse.json({ success: false, error: 'ยังไม่ได้ผูกบัญชี LINE' }, { status: 404 });
        }

        const lineUserId = user.LineLink.LineUserID;
        await prisma.cM_UserLineLink.delete({ where: { LinkID: user.LineLink.LinkID } });

        if (isLineConfigured()) {
            await linePush(lineUserId, [
                textMessage('ยกเลิกการผูกบัญชีเรียบร้อยแล้ว ✅\nคุณจะไม่ได้รับแจ้งเตือนคิวจองอีก\n\nพิมพ์ "ผูกบัญชี" เมื่อต้องการเชื่อมต่อใหม่'),
            ]);
        }

        return NextResponse.json({ success: true, message: 'ยกเลิกการผูกบัญชี LINE เรียบร้อยแล้ว' });
    } catch (error) {
        console.error('[LINE unlink] error:', error);
        return NextResponse.json({ success: false, error: 'Failed to unlink LINE account' }, { status: 500 });
    }
}
