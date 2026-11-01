// Stateless QR token ต่อสาขา: HMAC(BranchCode) ไม่ต้องเก็บใน DB
// ใช้ใน URL /checkin/[branchCode]?t=... และ /monitor/[branchCode]?t=...

import { createHmac, timingSafeEqual } from 'crypto';

function getSecret(): string {
    const secret = process.env.QUEUE_QR_SECRET || process.env.NEXTAUTH_SECRET;
    if (!secret) throw new Error('QUEUE_QR_SECRET or NEXTAUTH_SECRET is required');
    return secret;
}

export function signBranchToken(branchCode: string, purpose: 'checkin' | 'monitor'): string {
    return createHmac('sha256', getSecret()).update(`${purpose}:${branchCode}`).digest('base64url').slice(0, 22);
}

export function verifyBranchToken(branchCode: string, purpose: 'checkin' | 'monitor', token: string | null | undefined): boolean {
    if (!token) return false;
    const expected = Buffer.from(signBranchToken(branchCode, purpose));
    const actual = Buffer.from(token);
    return expected.length === actual.length && timingSafeEqual(expected, actual);
}

// Ticket key: ให้ลูกค้าเปิดดูสถานะคิวของตัวเองซ้ำได้ (QueueID + ลายเซ็น) โดยไม่ต้องล็อกอิน
export function signTicket(queueId: number): string {
    const sig = createHmac('sha256', getSecret()).update(`ticket:${queueId}`).digest('base64url').slice(0, 22);
    return `${queueId}.${sig}`;
}

export function parseTicket(key: string | null | undefined): number | null {
    if (!key) return null;
    const [idPart, sig] = key.split('.');
    const id = Number(idPart);
    if (!Number.isInteger(id) || id <= 0 || !sig) return null;
    const expected = Buffer.from(signTicket(id).split('.')[1]);
    const actual = Buffer.from(sig);
    return expected.length === actual.length && timingSafeEqual(expected, actual) ? id : null;
}
