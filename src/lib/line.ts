// LINE Messaging API Client
// ห่อ endpoint ที่ระบบใช้จริง: reply / push / multicast + verify webhook signature
// หลักการ: การส่ง LINE ต้องไม่ทำให้ action หลัก (จอง/อนุมัติ/ยกเลิก) ล้มเหลว → ทุกฟังก์ชัน catch เองทั้งหมด

import crypto from 'crypto';

const LINE_API_BASE = 'https://api.line.me/v2/bot';

/** กันไม่ให้ค้างถ้า LINE ตอบช้า — ไม่มี timeout = request ค้างได้ไม่จำกัด */
const LINE_TIMEOUT_MS = 10_000;

export const LINE_CHANNEL_ACCESS_TOKEN = process.env.LINE_CHANNEL_ACCESS_TOKEN || '';
export const LINE_CHANNEL_SECRET = process.env.LINE_CHANNEL_SECRET || '';

/** LIFF app id — ต้องอยู่ใน provider เดียวกับ Messaging API channel ไม่งั้น userId จะคนละค่า */
export const LINE_LIFF_ID = process.env.NEXT_PUBLIC_LINE_LIFF_ID || '';
/** Channel ID ของ LINE Login channel ที่ LIFF app สังกัด ใช้เป็น client_id ตอน verify ID token */
export const LINE_LOGIN_CHANNEL_ID = process.env.LINE_LOGIN_CHANNEL_ID || '';

/**
 * LIFF พร้อมใช้งานหรือยัง
 * ถ้าพร้อม การผูกบัญชีจะ "บังคับ" ต้องมี ID token เพื่อพิสูจน์ว่าใครเป็นคนเปิดลิงก์จริง
 */
export function isLiffConfigured(): boolean {
    return Boolean(LINE_LIFF_ID && LINE_LOGIN_CHANNEL_ID);
}

/** URL ฐานของระบบ ใช้สร้างลิงก์หน้าผูกบัญชีที่ส่งเข้า LINE */
export function getAppBaseUrl(): string {
    return (process.env.LINE_LINK_BASE_URL || process.env.NEXTAUTH_URL || '').replace(/\/$/, '');
}

export function isLineConfigured(): boolean {
    return Boolean(LINE_CHANNEL_ACCESS_TOKEN && LINE_CHANNEL_SECRET);
}

/**
 * URL หน้าผูกบัญชีที่ส่งเข้า LINE
 *
 * ถ้าตั้ง LIFF ไว้ จะส่งเป็น liff.line.me เพื่อให้เปิดใน LIFF context
 * (LINE จะส่ง query string ต่อไปยัง endpoint ให้เอง) มิฉะนั้นส่ง URL ตรง
 */
export function getLinkUrl(token: string): string | null {
    if (LINE_LIFF_ID) {
        return `https://liff.line.me/${LINE_LIFF_ID}?token=${encodeURIComponent(token)}`;
    }
    const baseUrl = getAppBaseUrl();
    return baseUrl ? `${baseUrl}/line/link?token=${encodeURIComponent(token)}` : null;
}

export interface VerifiedIdToken {
    /** LINE userId ของคนที่เปิดหน้านี้จริง */
    userId: string;
    name?: string;
    picture?: string;
}

/**
 * ตรวจ ID token จาก LIFF กับ LINE โดยตรง
 *
 * LINE เป็นผู้ออกและเซ็น token นี้ ณ ตอนที่ผู้ใช้เปิดหน้า จึงปลอมไม่ได้
 * และค่า sub ที่ได้คือ userId ของ "คนที่เปิดหน้านี้" ไม่ใช่คนที่ได้รับลิงก์มาแต่แรก
 * — นี่คือจุดที่ทำให้การส่งต่อลิงก์ไปให้คนอื่นใช้ไม่ได้
 */
export async function verifyLineIdToken(idToken: string): Promise<VerifiedIdToken | null> {
    if (!idToken || !LINE_LOGIN_CHANNEL_ID) return null;

    try {
        const res = await fetch('https://api.line.me/oauth2/v2.1/verify', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({ id_token: idToken, client_id: LINE_LOGIN_CHANNEL_ID }),
            signal: AbortSignal.timeout(LINE_TIMEOUT_MS),
        });

        if (!res.ok) {
            console.error('[LINE] ID token verify failed:', res.status, (await res.text()).slice(0, 200));
            return null;
        }

        const payload = await res.json();
        if (!payload?.sub) return null;

        return { userId: payload.sub, name: payload.name, picture: payload.picture };
    } catch (err) {
        console.error('[LINE] ID token verify error:', err);
        return null;
    }
}

// ============================================================
// Webhook signature
// ============================================================

/**
 * ตรวจสอบ X-Line-Signature (HMAC-SHA256 ของ raw body ด้วย channel secret)
 * ต้องเรียกด้วย raw body string เท่านั้น — ห้าม JSON.stringify ใหม่
 */
export function verifyLineSignature(rawBody: string, signature: string | null): boolean {
    if (!signature || !LINE_CHANNEL_SECRET) return false;
    try {
        const expected = crypto
            .createHmac('SHA256', LINE_CHANNEL_SECRET)
            .update(rawBody)
            .digest('base64');

        const a = Buffer.from(expected);
        const b = Buffer.from(signature);
        if (a.length !== b.length) return false;
        return crypto.timingSafeEqual(a, b);
    } catch (err) {
        console.error('[LINE] signature verify error:', err);
        return false;
    }
}

// ============================================================
// Message types (subset ที่ใช้จริง)
// ============================================================

export type LineMessage = Record<string, unknown>;

export interface LineSendResult {
    ok: boolean;
    error?: string;
}

async function lineFetch(path: string, payload: unknown): Promise<LineSendResult> {
    if (!LINE_CHANNEL_ACCESS_TOKEN) {
        return { ok: false, error: 'LINE_CHANNEL_ACCESS_TOKEN is not configured' };
    }

    try {
        const res = await fetch(`${LINE_API_BASE}${path}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${LINE_CHANNEL_ACCESS_TOKEN}`,
            },
            body: JSON.stringify(payload),
            signal: AbortSignal.timeout(LINE_TIMEOUT_MS),
        });

        if (!res.ok) {
            const detail = await res.text().catch(() => '');
            const error = `LINE API ${res.status}: ${detail.slice(0, 300)}`;
            console.error('[LINE]', error);
            return { ok: false, error };
        }

        return { ok: true };
    } catch (err) {
        const error = err instanceof Error ? err.message : 'Unknown LINE API error';
        console.error('[LINE] request failed:', error);
        return { ok: false, error };
    }
}

/** ตอบกลับข้อความใน chat (ใช้ replyToken จาก webhook, อายุสั้นมาก) */
export function lineReply(replyToken: string, messages: LineMessage[]): Promise<LineSendResult> {
    return lineFetch('/message/reply', { replyToken, messages });
}

/** ส่งข้อความหาผู้ใช้คนเดียว */
export function linePush(to: string, messages: LineMessage[]): Promise<LineSendResult> {
    return lineFetch('/message/push', { to, messages });
}

/**
 * ส่งข้อความเดียวกันหาหลายคนพร้อมกัน (ประหยัดโควตากว่า push ทีละคน)
 * LINE จำกัด 500 ปลายทาง/ครั้ง → หั่นเป็นชุดอัตโนมัติ
 */
export async function lineMulticast(to: string[], messages: LineMessage[]): Promise<LineSendResult> {
    const targets = Array.from(new Set(to.filter(Boolean)));
    if (targets.length === 0) return { ok: true };

    const CHUNK = 500;
    const errors: string[] = [];

    for (let i = 0; i < targets.length; i += CHUNK) {
        const chunk = targets.slice(i, i + CHUNK);
        const res = chunk.length === 1
            ? await linePush(chunk[0], messages)
            : await lineFetch('/message/multicast', { to: chunk, messages });
        if (!res.ok && res.error) errors.push(res.error);
    }

    return errors.length > 0 ? { ok: false, error: errors.join(' | ') } : { ok: true };
}

/** ดึงโปรไฟล์ LINE (ชื่อ/รูป) ไว้แสดงในหน้าโปรไฟล์ระบบ */
export async function getLineProfile(lineUserId: string): Promise<{ displayName?: string; pictureUrl?: string } | null> {
    if (!LINE_CHANNEL_ACCESS_TOKEN) return null;
    try {
        const res = await fetch(`${LINE_API_BASE}/profile/${encodeURIComponent(lineUserId)}`, {
            headers: { Authorization: `Bearer ${LINE_CHANNEL_ACCESS_TOKEN}` },
            signal: AbortSignal.timeout(LINE_TIMEOUT_MS),
        });
        if (!res.ok) return null;
        const data = await res.json();
        return { displayName: data.displayName, pictureUrl: data.pictureUrl };
    } catch (err) {
        console.error('[LINE] getProfile failed:', err);
        return null;
    }
}

// ============================================================
// Message builders
// ============================================================

export function textMessage(text: string): LineMessage {
    // LINE จำกัดข้อความละ 5000 ตัวอักษร
    return { type: 'text', text: text.slice(0, 4999) };
}

/**
 * การ์ดพร้อมปุ่มเปิดหน้าผูกบัญชี (ส่งตอนผู้ใช้เพิ่มเพื่อน หรือพิมพ์ "ผูกบัญชี")
 *
 * ใช้ Flex ไม่ใช่ buttons template เพราะ template จำกัด text ไว้ 60 ตัวอักษร
 * เมื่อมี title ด้วย ซึ่งสั้นเกินกว่าจะอธิบายเป็นภาษาไทยได้ และ LINE จะ
 * ปฏิเสธทั้ง request (ผู้ใช้จะไม่เห็นข้อความใด ๆ เลย)
 */
export function linkAccountMessage(linkUrl: string): LineMessage {
    return {
        type: 'flex',
        altText: 'กรุณาผูกบัญชีเพื่อรับการแจ้งเตือนคิวจอง',
        contents: {
            type: 'bubble',
            size: 'mega',
            header: {
                type: 'box',
                layout: 'vertical',
                paddingAll: '16px',
                backgroundColor: '#06C755',
                contents: [
                    { type: 'text', text: '🔗 ผูกบัญชี EV Services', color: '#FFFFFF', weight: 'bold', size: 'md', wrap: true },
                ],
            },
            body: {
                type: 'box',
                layout: 'vertical',
                paddingAll: '16px',
                spacing: 'md',
                contents: [
                    {
                        type: 'text',
                        text: 'กดปุ่มด้านล่าง แล้วเข้าสู่ระบบด้วย Email และรหัสผ่านเดียวกับที่ใช้ในระบบ',
                        size: 'sm',
                        color: '#374151',
                        wrap: true,
                    },
                    {
                        type: 'text',
                        text: 'เมื่อผูกแล้ว คุณจะได้รับแจ้งเตือนคิวจองของสาขาที่คุณดูแลทันที',
                        size: 'xs',
                        color: '#6B7280',
                        wrap: true,
                    },
                    {
                        type: 'text',
                        text: 'ลิงก์มีอายุ 15 นาที และใช้ได้ครั้งเดียว',
                        size: 'xs',
                        color: '#9CA3AF',
                        wrap: true,
                    },
                ],
            },
            footer: {
                type: 'box',
                layout: 'vertical',
                paddingAll: '12px',
                contents: [
                    {
                        type: 'button',
                        style: 'primary',
                        height: 'sm',
                        color: '#06C755',
                        action: { type: 'uri', label: 'ผูกบัญชี', uri: linkUrl },
                    },
                ],
            },
        },
    };
}

export interface BookingFlexRow {
    label: string;
    value: string;
    /**
     * ระดับการเน้นของค่า เพื่อให้กวาดตาอ่านได้เร็ว
     *   strong = ข้อมูลระบุตัวคิว (ลูกค้า / ทะเบียน)
     *   accent = ใช้สีประจำ event (เน้นสิ่งที่เปลี่ยน)
     *   link   = ค่าที่กดได้ (เบอร์โทร)
     *   warn   = เหตุผล / สิ่งที่ต้องระวัง
     *   muted  = ข้อมูลประกอบ (คนทำรายการ / นัดเดิม)
     */
    highlight?: 'strong' | 'accent' | 'link' | 'warn' | 'muted';
    /** ทำให้ค่ากดได้ เช่น tel: สำหรับโทรออก */
    action?: { type: 'uri'; label?: string; uri: string };
}

const ROW_STYLE: Record<string, { color: string; weight?: 'bold' }> = {
    strong: { color: '#111827', weight: 'bold' },
    // สีฟ้าอ่านเป็น "กดได้" โดยไม่ต้องอธิบาย และไม่ชนกับสีประจำ event
    link: { color: '#2563EB', weight: 'bold' },
    warn: { color: '#B45309', weight: 'bold' },
    muted: { color: '#9CA3AF' },
};

/**
 * การ์ดแจ้งเตือนคิว — ใช้รูปแบบเดียวกันทุก event เปลี่ยนแค่สี/หัวข้อ/รายละเอียด
 *
 * วันที่-เวลาแยกออกมาอยู่ในกล่องสีอ่อน เพราะเป็นข้อมูลที่ผู้ใช้มองหาก่อนเสมอ
 */
export function bookingFlexMessage(params: {
    /** ไอคอนของ event — วางในวงกลมขาวเพื่อให้อ่านออกบนพื้นสีทุกสี */
    headerIcon?: string;
    headerText: string;
    headerColor: string;
    /** สีอ่อนของ event เดียวกัน ใช้เป็นพื้นกล่องวันที่-เวลา */
    softColor?: string;
    bookingNo: string;
    /** ข้อความวันที่ (แสดงในกล่องเน้น) */
    dateText?: string;
    /** ข้อความช่วงเวลา (แสดงในกล่องเน้น) */
    timeText?: string;
    rows: BookingFlexRow[];
    footerNote?: string;
    detailUrl?: string;
    altText: string;
}): LineMessage {
    const { headerIcon, headerText, headerColor, softColor, bookingNo, dateText, timeText, rows, footerNote, detailUrl, altText } = params;

    const bodyContents: Record<string, unknown>[] = [
        {
            type: 'text',
            text: bookingNo,
            weight: 'bold',
            size: 'md',
            color: '#111827',
            wrap: true,
        },
    ];

    // กล่องเน้น วันที่ + เวลา
    if (dateText || timeText) {
        bodyContents.push({
            type: 'box',
            layout: 'vertical',
            margin: 'md',
            paddingAll: '10px',
            cornerRadius: '6px',
            backgroundColor: softColor || '#F3F4F6',
            spacing: 'xs',
            contents: [
                ...(dateText
                    ? [{ type: 'text', text: `📅  ${dateText}`, size: 'xs', color: headerColor, weight: 'bold', wrap: true }]
                    : []),
                ...(timeText
                    ? [{ type: 'text', text: `🕐  ${timeText}`, size: 'xs', color: headerColor, weight: 'bold', wrap: true }]
                    : []),
            ],
        });
    }

    bodyContents.push({ type: 'separator', margin: 'md', color: '#E5E7EB' });

    bodyContents.push({
        type: 'box',
        layout: 'vertical',
        margin: 'md',
        spacing: 'sm',
        contents: rows.map((r) => {
            const style = r.highlight === 'accent'
                ? { color: headerColor, weight: 'bold' as const }
                : ROW_STYLE[r.highlight || ''] || { color: '#374151' };
            return {
                type: 'box',
                layout: 'baseline',
                spacing: 'sm',
                contents: [
                    { type: 'text', text: r.label, color: '#9CA3AF', size: 'xs', flex: 4 },
                    {
                        type: 'text',
                        text: r.value || '-',
                        color: style.color,
                        ...(style.weight ? { weight: style.weight } : {}),
                        size: 'xs',
                        flex: 8,
                        wrap: true,
                        ...(r.action ? { action: r.action } : {}),
                    },
                ],
            };
        }),
    });

    if (footerNote) {
        bodyContents.push({ type: 'separator', margin: 'md', color: '#E5E7EB' });
        bodyContents.push({
            type: 'text',
            text: footerNote,
            size: 'xxs',
            color: '#9CA3AF',
            margin: 'md',
            wrap: true,
        });
    }

    const bubble: Record<string, unknown> = {
        type: 'bubble',
        size: 'mega',
        // ไอคอนอยู่ในวงกลมขาวเสมอ ไม่ใช่วางบนพื้นสีตรง ๆ
        // เพราะ emoji ส่วนใหญ่มีสีในตัว (✅ เขียว, ❌ แดง) ถ้าวางบนพื้นสีเดียวกันจะกลืนหายไป
        header: {
            type: 'box',
            layout: 'horizontal',
            paddingAll: '12px',
            spacing: 'md',
            alignItems: 'center',
            backgroundColor: headerColor,
            contents: [
                ...(headerIcon
                    ? [{
                        type: 'box',
                        layout: 'vertical',
                        width: '34px',
                        height: '34px',
                        cornerRadius: '17px',
                        backgroundColor: '#FFFFFF',
                        justifyContent: 'center',
                        alignItems: 'center',
                        flex: 0,
                        contents: [
                            { type: 'text', text: headerIcon, size: 'sm', align: 'center', gravity: 'center' },
                        ],
                    }]
                    : []),
                {
                    type: 'text',
                    text: headerText,
                    color: '#FFFFFF',
                    weight: 'bold',
                    size: 'sm',
                    wrap: true,
                    gravity: 'center',
                },
            ],
        },
        body: {
            type: 'box',
            layout: 'vertical',
            paddingAll: '14px',
            backgroundColor: '#FFFFFF',
            contents: bodyContents,
        },
    };

    if (detailUrl) {
        bubble.footer = {
            type: 'box',
            layout: 'vertical',
            paddingAll: '10px',
            backgroundColor: '#FFFFFF',
            contents: [
                {
                    type: 'button',
                    style: 'primary',
                    height: 'sm',
                    color: headerColor,
                    action: { type: 'uri', label: 'ดูรายละเอียดคิว', uri: detailUrl },
                    adjustMode: 'shrink-to-fit',
                },
            ],
        };
    }

    return { type: 'flex', altText: altText.slice(0, 399), contents: bubble };
}
