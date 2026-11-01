// Public: ลูกค้าเช็คอินรับคิว (ต้องมี QR token; สาขามาจาก URL ที่ตรวจแล้ว ไม่ใช่ body)

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { resolvePublicBranch } from '@/lib/queue-public';
import { QueueInputError, checkInQueue, normalizePlate } from '@/lib/queue-service';
import { signTicket } from '@/lib/queue-token';
import { lookupVehicle } from '@/lib/queue-vehicle';
import { QUEUE_STATUS_LABEL, QueueStatus } from '@/lib/queue-status';
import { getClientIp, rateLimit } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest, { params }: { params: Promise<{ branchCode: string }> }) {
    const ip = getClientIp(request);
    if (!rateLimit(`checkin:${ip}`, 30, 60_000)) {
        return NextResponse.json({ success: false, error: 'คำขอมากเกินไป กรุณาลองใหม่ภายหลัง' }, { status: 429 });
    }
    try {
        const { branchCode } = await params;
        const body = await request.json().catch(() => null);
        if (!body || typeof body !== 'object') {
            return NextResponse.json({ success: false, error: 'ข้อมูลไม่ถูกต้อง' }, { status: 400 });
        }
        const branch = await resolvePublicBranch(branchCode, 'checkin', body.token);
        if (!branch) {
            return NextResponse.json({ success: false, error: 'QR Code ไม่ถูกต้องหรือหมดอายุ' }, { status: 404 });
        }

        const plate = normalizePlate(String(body.carRegister ?? ''));
        const customerName = String(body.customerName ?? '').trim();
        const phone = String(body.customerPhone ?? '').replace(/\D/g, '');
        if (plate.length < 2 || plate.length > 20) {
            return NextResponse.json({ success: false, error: 'กรุณากรอกทะเบียนรถให้ถูกต้อง' }, { status: 400 });
        }
        if (customerName.length > 100) {
            return NextResponse.json({ success: false, error: 'ชื่อยาวเกินไป' }, { status: 400 });
        }
        if (phone && phone.length !== 10) {
            return NextResponse.json({ success: false, error: 'กรุณากรอกเบอร์โทร 10 หลัก' }, { status: 400 });
        }

        let serviceTypeId: number | null = null;
        if (body.serviceTypeId != null) {
            const st = await prisma.cM_ServiceType.findFirst({
                where: { ServiceTypeID: Number(body.serviceTypeId), IsActive: true },
                select: { ServiceTypeID: true },
            });
            if (!st) return NextResponse.json({ success: false, error: 'ประเภทบริการไม่ถูกต้อง' }, { status: 400 });
            serviceTypeId = st.ServiceTypeID;
        }

        const serviceOther = String(body.serviceOther ?? '').trim().slice(0, 200);
        if (serviceTypeId == null && body.serviceTypeId == null && body.otherService === true && !serviceOther) {
            return NextResponse.json({ success: false, error: 'กรุณาระบุบริการที่ต้องการ' }, { status: 400 });
        }

        const vehicle = await lookupVehicle(plate);
        const { queue, created } = await checkInQueue({
            branchId: branch.BranchID,
            carRegister: plate,
            customerName: customerName || null,
            customerPhone: phone || null,
            serviceTypeId,
            serviceOther: body.otherService === true ? serviceOther || null : null,
            claimsBooking: Boolean(body.claimsBooking),
            bookingType: vehicle ? undefined : 'RETAIL',
            vehicle,
        });

        return NextResponse.json({
            success: true,
            data: {
                ticketKey: signTicket(queue.QueueID),
                queueLabel: queue.QueueLabel,
                status: queue.Status,
                statusLabel: QUEUE_STATUS_LABEL[queue.Status as QueueStatus],
                alreadyCheckedIn: !created,
                needsReview: queue.NeedsReview,
            },
        });
    } catch (error) {
        if (error instanceof QueueInputError) {
            return NextResponse.json({ success: false, error: error.message }, { status: 400 });
        }
        console.error('Queue check-in error:', error);
        return NextResponse.json({ success: false, error: 'ไม่สามารถเช็คอินได้ กรุณาลองใหม่อีกครั้ง' }, { status: 500 });
    }
}
