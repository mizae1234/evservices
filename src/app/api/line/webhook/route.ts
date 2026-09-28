// LINE Messaging API Webhook
// รับ event จาก LINE OA: follow / unfollow / message
// ต้องตั้ง Webhook URL ใน LINE Developers Console = {NEXTAUTH_URL}/api/line/webhook

export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import prisma from '@/lib/prisma';
import {
    getAppBaseUrl,
    getLinkUrl,
    isLineConfigured,
    lineReply,
    linkAccountMessage,
    textMessage,
    verifyLineSignature,
    type LineMessage,
} from '@/lib/line';
import { canManageUsers } from '@/lib/permissions';

const LINK_TOKEN_TTL_MINUTES = 15;

/** สร้าง token ใช้ครั้งเดียวสำหรับหน้าผูกบัญชี แล้วคืน URL เต็ม */
async function issueLinkUrl(lineUserId: string): Promise<string | null> {
    const token = crypto.randomBytes(24).toString('hex');
    const expireDate = new Date(Date.now() + LINK_TOKEN_TTL_MINUTES * 60 * 1000);

    // ล้าง token เดิมที่ยังไม่ถูกใช้ของ LINE user คนนี้ ให้เหลือใบล่าสุดใบเดียว
    // และเก็บกวาดใบที่หมดอายุของทุกคนไปพร้อมกัน (ตารางเล็ก ทำตอนนี้ถูกกว่าตั้ง job แยก)
    await prisma.cM_LineLinkToken.deleteMany({
        where: {
            OR: [
                { LineUserID: lineUserId, UsedDate: null },
                { ExpireDate: { lt: new Date() } },
            ],
        },
    });

    await prisma.cM_LineLinkToken.create({
        data: { Token: token, LineUserID: lineUserId, ExpireDate: expireDate },
    });

    const url = getLinkUrl(token);
    if (!url) {
        console.error('[LINE webhook] ตั้งค่า NEXT_PUBLIC_LINE_LIFF_ID หรือ NEXTAUTH_URL / LINE_LINK_BASE_URL ไม่ครบ');
    }
    return url;
}

async function findActiveLink(lineUserId: string) {
    return prisma.cM_UserLineLink.findUnique({
        where: { LineUserID: lineUserId },
        include: {
            User: {
                select: {
                    FullName: true,
                    Email: true,
                    IsActive: true,
                    Branch: { select: { BranchName: true } },
                    Role: { select: { RoleCode: true, RoleName: true } },
                },
            },
        },
    });
}

type ActiveLink = NonNullable<Awaited<ReturnType<typeof findActiveLink>>>;

/** เมนูคำสั่งพื้นฐาน — ทุกคนใช้ได้ */
const BASIC_MENU = [
    '💬 คำสั่งที่ใช้ได้',
    '🔗 ผูกบัญชี — เชื่อมต่อบัญชีเพื่อรับแจ้งเตือน',
    '📋 สถานะ — ดูว่าบัญชีนี้เชื่อมกับใครอยู่',
].join('\n');

/** คำสั่งสำหรับผู้ดูแลระบบเท่านั้น */
const ADMIN_MENU = [
    '',
    '⚙️ สำหรับผู้ดูแลระบบ',
    '🔄 เปลี่ยนบัญชี — เชื่อมกับผู้ใช้คนอื่น',
    '🔔 เปิดแจ้งเตือน / 🔕 ปิดแจ้งเตือน',
    '🚪 ยกเลิกการผูก — ตัดการเชื่อมต่อ',
].join('\n');

function menuText(link: ActiveLink | null): string {
    const isAdmin = canManageUsers(link?.User.Role.RoleCode);
    return BASIC_MENU + (isAdmin ? '\n' + ADMIN_MENU : '');
}

/** ข้อความเมื่อผู้ใช้ทั่วไปเรียกคำสั่งที่สงวนไว้ให้ผู้ดูแลระบบ */
function restrictedMessage(): LineMessage {
    return textMessage(
        [
            '🔒 คำสั่งนี้ใช้ได้เฉพาะผู้ดูแลระบบครับ',
            '',
            'หากต้องการเปลี่ยนหรือยกเลิกการเชื่อมต่อบัญชี',
            'กรุณาติดต่อผู้ดูแลระบบให้ดำเนินการให้',
            '',
            '📋 พิมพ์ "สถานะ" เพื่อดูข้อมูลการเชื่อมต่อของคุณได้',
        ].join('\n')
    );
}

async function handleFollow(lineUserId: string, replyToken: string) {
    const link = await findActiveLink(lineUserId);

    // กลับมา follow ใหม่หลังเคย block → เปิดใช้งานลิงก์เดิมต่อได้เลย
    if (link) {
        await prisma.cM_UserLineLink.update({
            where: { LinkID: link.LinkID },
            data: { IsActive: true },
        });
        await lineReply(replyToken, [
            textMessage(
                [
                    `👋 ยินดีต้อนรับกลับมาครับ`,
                    '',
                    `✅ บัญชีนี้เชื่อมต่อไว้อยู่แล้ว`,
                    `👤 ${link.User.FullName}`,
                    `🏢 ${link.User.Branch?.BranchName || 'ไม่ระบุสาขา'}`,
                    '',
                    '🔔 คุณจะได้รับแจ้งเตือนคิวจองตามปกติ',
                    '',
                    menuText(link),
                ].join('\n')
            ),
        ]);
        return;
    }

    const linkUrl = await issueLinkUrl(lineUserId);
    if (!linkUrl) {
        await lineReply(replyToken, [
            textMessage('⚠️ ขออภัยครับ ระบบยังไม่พร้อมให้เชื่อมต่อบัญชีในขณะนี้\n\nกรุณาติดต่อผู้ดูแลระบบ'),
        ]);
        return;
    }

    await lineReply(replyToken, [
        textMessage(
            [
                '🎉 ยินดีต้อนรับสู่ EV7 Services',
                '',
                '📬 ที่นี่คือช่องทางแจ้งเตือนคิวจองของศูนย์บริการ',
                'ทุกความเคลื่อนไหวของคิว ระบบจะส่งมาบอกทันที',
                '',
                '📥 คิวจองใหม่',
                '✅ อนุมัติคิว',
                '📅 เลื่อนนัดหมาย',
                '❌ ยกเลิกคิว',
                '',
                '🚀 เริ่มต้นใช้งานใน 2 ขั้นตอน',
                '1️⃣ กดปุ่มด้านล่างเพื่อเชื่อมต่อบัญชี',
                '2️⃣ เข้าสู่ระบบด้วย Email และรหัสผ่านเดียวกับที่ใช้ในระบบ',
                '',
                BASIC_MENU,
            ].join('\n')
        ),
        linkAccountMessage(linkUrl),
    ]);
}

async function handleUnfollow(lineUserId: string) {
    // ผู้ใช้บล็อก OA → หยุดส่ง แต่เก็บ mapping ไว้ เผื่อกลับมา follow ใหม่
    await prisma.cM_UserLineLink.updateMany({
        where: { LineUserID: lineUserId },
        data: { IsActive: false },
    });
}

async function handleTextMessage(lineUserId: string, replyToken: string, text: string) {
    const cmd = text.trim().toLowerCase();
    const link = await findActiveLink(lineUserId);
    const isAdmin = canManageUsers(link?.User.Role.RoleCode);

    // ── คำสั่งพื้นฐาน: ผูกบัญชี ──
    if (cmd.includes('ผูกบัญชี') || cmd === 'link' || cmd === 'login' || cmd.includes('เข้าสู่ระบบ')) {
        if (link && link.IsActive) {
            await lineReply(replyToken, [
                textMessage(
                    [
                        `✅ บัญชีนี้เชื่อมต่ออยู่แล้วครับ`,
                        '',
                        `👤 ${link.User.FullName}`,
                        `🏢 ${link.User.Branch?.BranchName || 'ไม่ระบุสาขา'}`,
                        '',
                        '🔄 หากต้องการเปลี่ยนไปใช้บัญชีอื่น',
                        'กรุณาติดต่อผู้ดูแลระบบให้ดำเนินการให้',
                    ].join('\n')
                ),
            ]);
            return;
        }
        const linkUrl = await issueLinkUrl(lineUserId);
        if (!linkUrl) {
            await lineReply(replyToken, [
                textMessage('⚠️ ขออภัยครับ ระบบยังไม่พร้อมให้เชื่อมต่อบัญชีในขณะนี้\n\nกรุณาติดต่อผู้ดูแลระบบ'),
            ]);
            return;
        }
        await lineReply(replyToken, [
            textMessage('🔗 ได้เลยครับ กดปุ่มด้านล่างเพื่อเชื่อมต่อบัญชีของคุณ'),
            linkAccountMessage(linkUrl),
        ]);
        return;
    }

    // ── คำสั่งพื้นฐาน: สถานะ ──
    if (cmd.includes('สถานะ') || cmd === 'status' || cmd.includes('ฉันคือใคร')) {
        if (!link) {
            await lineReply(replyToken, [
                textMessage(
                    [
                        '🔓 บัญชีนี้ยังไม่ได้เชื่อมต่อกับระบบครับ',
                        '',
                        '🔗 พิมพ์ "ผูกบัญชี" เพื่อเริ่มต้นใช้งาน',
                    ].join('\n')
                ),
            ]);
            return;
        }
        await lineReply(replyToken, [
            textMessage(
                [
                    '📋 ข้อมูลการเชื่อมต่อของคุณ',
                    '',
                    `👤 ชื่อ: ${link.User.FullName}`,
                    `✉️ อีเมล: ${link.User.Email}`,
                    `🏷️ บทบาท: ${link.User.Role.RoleName}`,
                    `🏢 สาขา: ${link.User.Branch?.BranchName || 'ไม่ระบุ (ดูแลทุกสาขา)'}`,
                    link.NotifyEnabled && link.IsActive
                        ? '🔔 การแจ้งเตือน: กำลังรับอยู่'
                        : '🔕 การแจ้งเตือน: ปิดอยู่',
                ].join('\n')
            ),
        ]);
        return;
    }

    // ── คำสั่งสงวนสำหรับผู้ดูแลระบบ ──
    const isRestricted =
        cmd.includes('เปลี่ยนบัญชี') || cmd === 'relink' || cmd === 'switch' ||
        cmd.includes('ยกเลิกการผูก') || cmd === 'unlink' ||
        cmd.includes('ปิดแจ้งเตือน') || cmd.includes('ปิดการแจ้งเตือน') || cmd === 'mute' ||
        cmd.includes('เปิดแจ้งเตือน') || cmd.includes('เปิดการแจ้งเตือน') || cmd === 'unmute';

    if (isRestricted && !isAdmin) {
        await lineReply(replyToken, [restrictedMessage()]);
        return;
    }

    if (cmd.includes('เปลี่ยนบัญชี') || cmd === 'relink' || cmd === 'switch') {
        const linkUrl = await issueLinkUrl(lineUserId);
        if (!linkUrl) {
            await lineReply(replyToken, [textMessage('⚠️ ขออภัยครับ ระบบยังไม่พร้อมให้เชื่อมต่อบัญชีในขณะนี้')]);
            return;
        }
        await lineReply(replyToken, [
            textMessage('🔄 เข้าสู่ระบบด้วยบัญชีใหม่ที่ต้องการเชื่อมต่อได้เลยครับ\n\n⚠️ การเชื่อมต่อเดิมจะถูกแทนที่'),
            linkAccountMessage(linkUrl),
        ]);
        return;
    }

    if (cmd.includes('ยกเลิกการผูก') || cmd === 'unlink') {
        if (!link) {
            await lineReply(replyToken, [textMessage('🔓 บัญชีนี้ยังไม่ได้เชื่อมต่อกับระบบครับ')]);
            return;
        }
        await prisma.cM_UserLineLink.delete({ where: { LinkID: link.LinkID } });
        await lineReply(replyToken, [
            textMessage(
                [
                    '🚪 ยกเลิกการเชื่อมต่อเรียบร้อยแล้วครับ',
                    '',
                    '🔕 คุณจะไม่ได้รับแจ้งเตือนคิวจองอีก',
                    '🔗 พิมพ์ "ผูกบัญชี" เมื่อต้องการเชื่อมต่อใหม่',
                ].join('\n')
            ),
        ]);
        return;
    }

    if (cmd.includes('ปิดแจ้งเตือน') || cmd.includes('ปิดการแจ้งเตือน') || cmd === 'mute') {
        if (!link) {
            await lineReply(replyToken, [textMessage('🔓 บัญชีนี้ยังไม่ได้เชื่อมต่อกับระบบครับ\n\n🔗 พิมพ์ "ผูกบัญชี" เพื่อเริ่มต้น')]);
            return;
        }
        await prisma.cM_UserLineLink.update({ where: { LinkID: link.LinkID }, data: { NotifyEnabled: false } });
        await lineReply(replyToken, [
            textMessage('🔕 พักการแจ้งเตือนให้แล้วครับ\n\n🔔 พิมพ์ "เปิดแจ้งเตือน" เมื่อต้องการรับอีกครั้ง'),
        ]);
        return;
    }

    if (cmd.includes('เปิดแจ้งเตือน') || cmd.includes('เปิดการแจ้งเตือน') || cmd === 'unmute') {
        if (!link) {
            await lineReply(replyToken, [textMessage('🔓 บัญชีนี้ยังไม่ได้เชื่อมต่อกับระบบครับ\n\n🔗 พิมพ์ "ผูกบัญชี" เพื่อเริ่มต้น')]);
            return;
        }
        await prisma.cM_UserLineLink.update({ where: { LinkID: link.LinkID }, data: { NotifyEnabled: true } });
        await lineReply(replyToken, [textMessage('🔔 เปิดการแจ้งเตือนให้แล้วครับ\n\nคุณจะได้รับแจ้งเตือนคิวจองตามปกติ')]);
        return;
    }

    // ── ไม่ตรงคำสั่งไหนเลย ──
    await lineReply(replyToken, [
        textMessage(
            [
                link ? `👋 สวัสดีครับ ${link.User.FullName}` : '👋 สวัสดีครับ',
                '',
                menuText(link),
            ].join('\n')
        ),
    ]);
}

export async function POST(request: NextRequest) {
    // LINE ต้องได้รับ 200 เสมอ ไม่งั้นจะ retry / ปิด webhook ให้อัตโนมัติ
    try {
        if (!isLineConfigured()) {
            console.error('[LINE webhook] channel secret/token is not configured');
            return NextResponse.json({ success: true });
        }

        const rawBody = await request.text();
        const signature = request.headers.get('x-line-signature');

        if (!verifyLineSignature(rawBody, signature)) {
            console.error('[LINE webhook] invalid signature');
            return NextResponse.json({ success: false, error: 'Invalid signature' }, { status: 401 });
        }

        const body = JSON.parse(rawBody || '{}');
        const events: any[] = Array.isArray(body.events) ? body.events : [];

        for (const event of events) {
            const lineUserId: string | undefined = event?.source?.userId;
            if (!lineUserId) continue;

            try {
                if (event.type === 'follow') {
                    await handleFollow(lineUserId, event.replyToken);
                } else if (event.type === 'unfollow') {
                    await handleUnfollow(lineUserId);
                } else if (event.type === 'message' && event.message?.type === 'text') {
                    await handleTextMessage(lineUserId, event.replyToken, event.message.text || '');
                }
            } catch (eventErr) {
                console.error(`[LINE webhook] error handling ${event.type}:`, eventErr);
            }
        }

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('[LINE webhook] fatal error:', error);
        return NextResponse.json({ success: true });
    }
}

// LINE Console กดปุ่ม "Verify" ด้วย POST อยู่แล้ว แต่เปิด GET ไว้ให้เช็ค health ได้
export async function GET() {
    return NextResponse.json({
        success: true,
        configured: isLineConfigured(),
        baseUrl: getAppBaseUrl() || null,
    });
}
