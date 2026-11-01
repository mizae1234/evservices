// Public: ลูกค้าดูสถานะคิวของตัวเองซ้ำได้ (ticket key ที่ลงลายเซ็น) — ไม่มีข้อมูลส่วนบุคคล

import { NextRequest, NextResponse } from 'next/server';
import { resolvePublicBranch } from '@/lib/queue-public';
import { getTicketView } from '@/lib/queue-service';
import { QUEUE_STATUS_LABEL } from '@/lib/queue-status';
import { parseTicket } from '@/lib/queue-token';
import { getClientIp, rateLimit } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest, { params }: { params: Promise<{ branchCode: string }> }) {
    const sp = request.nextUrl.searchParams;
    // ลูกค้าหลายคนในร้านใช้ Wi-Fi เดียวกัน (IP เดียวกัน) และหน้าจอ poll ทุก 8 วินาที:
    // จำกัดต่อ ticket เป็นหลัก และใช้เพดานต่อ IP ที่สูงพอสำหรับทั้งร้าน
    const key = sp.get('k') ?? '';
    if (!rateLimit(`ticket-ip:${getClientIp(request)}`, 1200, 60_000) || !rateLimit(`ticket:${key}`, 30, 60_000)) {
        return NextResponse.json({ success: false, error: 'คำขอมากเกินไป กรุณาลองใหม่ภายหลัง' }, { status: 429 });
    }
    const { branchCode } = await params;
    const branch = await resolvePublicBranch(branchCode, 'checkin', sp.get('t'));
    const queueId = parseTicket(sp.get('k'));
    if (!branch || !queueId) return NextResponse.json({ success: false, error: 'ไม่พบข้อมูลคิว' }, { status: 404 });
    const view = await getTicketView(queueId, branch.BranchID);
    if (!view) return NextResponse.json({ success: false, error: 'ไม่พบข้อมูลคิว' }, { status: 404 });
    return NextResponse.json({
        success: true,
        data: { ...view, statusLabel: QUEUE_STATUS_LABEL[view.status], branchName: branch.BranchName },
    });
}
