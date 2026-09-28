// LINE Account Linking API
// GET  /api/line/link?token=xxx  → ตรวจว่า token ยังใช้ได้ไหม (ให้หน้าเว็บแสดงผลก่อนกรอกรหัส)
// POST /api/line/link            → ยืนยันตัวตนด้วย Email + Password เดียวกับระบบ แล้วผูกเข้ากับ LINE userId
//
// endpoint นี้เป็น public (ผู้ใช้เปิดจาก in-app browser ของ LINE ซึ่งยังไม่มี session)
// ความปลอดภัยจึงอาศัย: token ใช้ครั้งเดียว + หมดอายุ 15 นาที + จำกัดจำนวนครั้งที่กรอกผิด

export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import prisma from '@/lib/prisma';
import { getLineProfile, isLiffConfigured, isLineConfigured, linePush, textMessage, verifyLineIdToken } from '@/lib/line';

const MAX_ATTEMPTS_PER_TOKEN = 5;

/**
 * นับครั้งที่กรอกรหัสผ่านผิดไว้บนแถวของ token เอง
 *
 * เก็บใน DB ไม่ใช่ในหน่วยความจำ เพราะตัวนับในหน่วยความจำจะหายทุกครั้งที่ deploy
 * ทำให้คนที่ถือ token อยู่ได้โควตาเดาใหม่ และใช้ไม่ได้ถ้ารันหลาย instance
 */
async function registerFailedAttempt(tokenId: number): Promise<number> {
    const updated = await prisma.cM_LineLinkToken.update({
        where: { TokenID: tokenId },
        data: { FailedAttempts: { increment: 1 } },
        select: { FailedAttempts: true },
    });
    return updated.FailedAttempts;
}

async function loadValidToken(token: string) {
    if (!token) return null;
    const record = await prisma.cM_LineLinkToken.findUnique({ where: { Token: token } });
    if (!record) return null;
    if (record.UsedDate) return null;
    if (record.ExpireDate.getTime() < Date.now()) return null;
    return record;
}

export async function GET(request: NextRequest) {
    try {
        const token = request.nextUrl.searchParams.get('token') || '';
        const record = await loadValidToken(token);

        if (!record) {
            return NextResponse.json({
                success: false,
                error: 'ลิงก์ผูกบัญชีหมดอายุหรือถูกใช้ไปแล้ว กรุณาพิมพ์ "ผูกบัญชี" ใน LINE เพื่อขอลิงก์ใหม่',
            }, { status: 400 });
        }

        // ถ้า LINE user คนนี้ผูกไว้อยู่แล้ว บอกให้รู้ว่าการยืนยันครั้งนี้จะไปแทนที่ของเดิม
        const existing = await prisma.cM_UserLineLink.findUnique({
            where: { LineUserID: record.LineUserID },
            include: { User: { select: { FullName: true, Email: true } } },
        });

        return NextResponse.json({
            success: true,
            data: {
                expiresAt: record.ExpireDate,
                alreadyLinkedTo: existing ? { FullName: existing.User.FullName, Email: existing.User.Email } : null,
                /** หน้าเว็บใช้ค่านี้ตัดสินใจว่าต้องขอ ID token จาก LIFF ก่อนส่งฟอร์มหรือไม่ */
                requiresIdToken: isLiffConfigured(),
            },
        });
    } catch (error) {
        console.error('[LINE link] GET error:', error);
        return NextResponse.json({ success: false, error: 'เกิดข้อผิดพลาดในการตรวจสอบลิงก์' }, { status: 500 });
    }
}

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const token: string = (body.token || '').toString();
        const email: string = (body.email || '').toString().trim();
        const password: string = (body.password || '').toString();
        const idToken: string = (body.idToken || '').toString();

        if (!token || !email || !password) {
            return NextResponse.json({ success: false, error: 'กรุณากรอก Email และรหัสผ่านให้ครบถ้วน' }, { status: 400 });
        }

        const tokenRecord = await loadValidToken(token);
        if (!tokenRecord) {
            return NextResponse.json({
                success: false,
                error: 'ลิงก์ผูกบัญชีหมดอายุหรือถูกใช้ไปแล้ว กรุณาพิมพ์ "ผูกบัญชี" ใน LINE เพื่อขอลิงก์ใหม่',
            }, { status: 400 });
        }

        if (tokenRecord.FailedAttempts >= MAX_ATTEMPTS_PER_TOKEN) {
            return NextResponse.json({
                success: false,
                error: 'กรอกรหัสผ่านผิดเกินจำนวนที่กำหนด กรุณาพิมพ์ "ผูกบัญชี" ใน LINE เพื่อขอลิงก์ใหม่',
            }, { status: 429 });
        }

        // ตรวจสอบตัวตนด้วย credential ชุดเดียวกับการ login เข้าระบบ
        const user = await prisma.cM_User.findUnique({
            where: { Email: email },
            include: {
                Role: { select: { RoleCode: true, RoleName: true } },
                Branch: { select: { BranchName: true } },
            },
        });

        if (!user || !(await bcrypt.compare(password, user.PasswordHash))) {
            const attempts = await registerFailedAttempt(tokenRecord.TokenID);
            const remaining = Math.max(0, MAX_ATTEMPTS_PER_TOKEN - attempts);
            return NextResponse.json({
                success: false,
                error: `Email หรือรหัสผ่านไม่ถูกต้อง${remaining > 0 ? ` (เหลืออีก ${remaining} ครั้ง)` : ''}`,
            }, { status: 401 });
        }

        if (!user.IsActive) {
            return NextResponse.json({ success: false, error: 'บัญชีนี้ถูกระงับการใช้งาน' }, { status: 403 });
        }

        // ── พิสูจน์ว่า "คนที่เปิดหน้านี้" คือเจ้าของลิงก์จริง ──
        // ลิงก์ที่ถูกส่งต่อให้คนอื่นจะมี userId จาก ID token ไม่ตรงกับที่ผูกไว้กับ token → ปฏิเสธ
        if (isLiffConfigured()) {
            if (!idToken) {
                return NextResponse.json({
                    success: false,
                    error: 'ไม่พบข้อมูลยืนยันตัวตนจาก LINE กรุณาเปิดลิงก์นี้จากแอป LINE อีกครั้ง',
                }, { status: 400 });
            }

            const verified = await verifyLineIdToken(idToken);
            if (!verified) {
                return NextResponse.json({
                    success: false,
                    error: 'ยืนยันตัวตนกับ LINE ไม่สำเร็จ กรุณาลองใหม่อีกครั้ง',
                }, { status: 401 });
            }

            if (verified.userId !== tokenRecord.LineUserID) {
                console.warn('[LINE link] ID token ไม่ตรงกับเจ้าของลิงก์ — น่าจะเป็นลิงก์ที่ถูกส่งต่อ');
                return NextResponse.json({
                    success: false,
                    error: 'ลิงก์นี้ออกให้บัญชี LINE อื่น กรุณาพิมพ์ "ผูกบัญชี" ในแชทเพื่อขอลิงก์ของคุณเอง',
                }, { status: 403 });
            }
        }

        const lineUserId = tokenRecord.LineUserID;
        const profile = await getLineProfile(lineUserId);

        // 1 LINE account : 1 user — ถ้า LINE นี้เคยผูกกับคนอื่น ให้ย้ายมาเป็นคนใหม่
        await prisma.cM_UserLineLink.deleteMany({
            where: { LineUserID: lineUserId, UserID: { not: user.UserID } },
        });

        // 1 user : 1 LINE account — ถ้า user คนนี้เคยผูก LINE เครื่องอื่นไว้ ให้แทนที่
        await prisma.cM_UserLineLink.deleteMany({
            where: { UserID: user.UserID, LineUserID: { not: lineUserId } },
        });

        await prisma.cM_UserLineLink.upsert({
            where: { UserID: user.UserID },
            create: {
                UserID: user.UserID,
                LineUserID: lineUserId,
                DisplayName: profile?.displayName || null,
                PictureUrl: profile?.pictureUrl || null,
                IsActive: true,
                NotifyEnabled: true,
            },
            update: {
                LineUserID: lineUserId,
                DisplayName: profile?.displayName || null,
                PictureUrl: profile?.pictureUrl || null,
                IsActive: true,
                NotifyEnabled: true,
            },
        });

        // token ใช้ได้ครั้งเดียว
        await prisma.cM_LineLinkToken.update({
            where: { TokenID: tokenRecord.TokenID },
            data: { UsedDate: new Date() },
        });

        // ยืนยันกลับไปใน LINE ให้ผู้ใช้เห็นทันทีว่าผูกกับใคร/สาขาไหน
        if (isLineConfigured()) {
            const scopeText = user.Role.RoleCode === 'ADMIN'
                ? 'คุณจะได้รับแจ้งเตือนคิวจองของทุกสาขา'
                : user.BranchID
                    ? `คุณจะได้รับแจ้งเตือนคิวจองของ${(user.Branch?.BranchName || '').startsWith('สาขา') ? '' : 'สาขา'}${user.Branch?.BranchName || 'สาขาที่สังกัด'}`
                    : 'คุณจะได้รับแจ้งเตือนคิวจองตามบทบาทที่ได้รับ';

            await linePush(lineUserId, [
                textMessage(
                    [
                        '🎉 เชื่อมต่อสำเร็จแล้วครับ',
                        '',
                        `👤 ${user.FullName}`,
                        `🏷️ บทบาท: ${user.Role.RoleName}`,
                        `🏢 สาขา: ${user.Branch?.BranchName || 'ไม่ระบุ'}`,
                        '',
                        `🔔 ${scopeText}`,
                        '',
                        '📥 คิวจองใหม่',
                        '✅ อนุมัติคิว',
                        '📅 เลื่อนนัดหมาย',
                        '❌ ยกเลิกคิว',
                        '',
                        '📋 พิมพ์ "สถานะ" เมื่อต้องการดูข้อมูลการเชื่อมต่อ',
                    ].join('\n')
                ),
            ]);
        }

        return NextResponse.json({
            success: true,
            message: 'ผูกบัญชีสำเร็จ',
            data: {
                FullName: user.FullName,
                Email: user.Email,
                RoleName: user.Role.RoleName,
                BranchName: user.Branch?.BranchName || null,
                LineDisplayName: profile?.displayName || null,
            },
        });
    } catch (error) {
        console.error('[LINE link] POST error:', error);
        return NextResponse.json({ success: false, error: 'เกิดข้อผิดพลาดในการผูกบัญชี' }, { status: 500 });
    }
}
