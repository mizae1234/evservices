// Admin: ยกเลิกการผูกบัญชี LINE ของผู้ใช้คนอื่น
// ผู้ใช้ทั่วไปยกเลิกเองไม่ได้แล้ว — ต้องให้ผู้ดูแลระบบเป็นคนจัดการ

export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { canManageUsers } from '@/lib/permissions';
import { isLineConfigured, linePush, textMessage } from '@/lib/line';

export async function POST(
    request: NextRequest,
    context: { params: Promise<{ id: string }> }
) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user) {
            return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
        }

        if (!canManageUsers(session.user.role)) {
            return NextResponse.json({ success: false, error: 'เฉพาะผู้ดูแลระบบเท่านั้น' }, { status: 403 });
        }

        const { id } = await context.params;
        const userId = parseInt(id);
        if (isNaN(userId)) {
            return NextResponse.json({ success: false, error: 'Invalid user id' }, { status: 400 });
        }

        const user = await prisma.cM_User.findUnique({
            where: { UserID: userId },
            select: {
                FullName: true,
                LineLink: { select: { LinkID: true, LineUserID: true } },
            },
        });

        if (!user) {
            return NextResponse.json({ success: false, error: 'ไม่พบผู้ใช้' }, { status: 404 });
        }
        if (!user.LineLink) {
            return NextResponse.json({ success: false, error: 'ผู้ใช้นี้ยังไม่ได้ผูกบัญชี LINE' }, { status: 404 });
        }

        const lineUserId = user.LineLink.LineUserID;
        await prisma.cM_UserLineLink.delete({ where: { LinkID: user.LineLink.LinkID } });

        // แจ้งเจ้าตัวใน LINE ให้รู้ว่าถูกยกเลิก จะได้ไม่งงว่าทำไมไม่ได้รับแจ้งเตือนแล้ว
        if (isLineConfigured()) {
            await linePush(lineUserId, [
                textMessage(
                    [
                        '🚪 การเชื่อมต่อบัญชีถูกยกเลิกแล้ว',
                        '',
                        'ผู้ดูแลระบบได้ยกเลิกการเชื่อมต่อบัญชี LINE นี้',
                        `ออกจากผู้ใช้ 👤 ${user.FullName}`,
                        '',
                        '🔕 คุณจะไม่ได้รับการแจ้งเตือนคิวจองอีก',
                        '',
                        '🔗 หากต้องการเชื่อมต่อใหม่ พิมพ์ "ผูกบัญชี" ได้เลย',
                    ].join('\n')
                ),
            ]);
        }

        return NextResponse.json({
            success: true,
            message: `ยกเลิกการผูกบัญชี LINE ของ ${user.FullName} เรียบร้อยแล้ว`,
        });
    } catch (error) {
        console.error('[admin line-unlink] error:', error);
        return NextResponse.json({ success: false, error: 'ยกเลิกการผูกบัญชีไม่สำเร็จ' }, { status: 500 });
    }
}
