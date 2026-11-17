// Public: สาขาที่เลือกยังมีที่นัดหมายว่างไหม (ใช้เตือนลูกค้าก่อนเลือกเวลา)

import { NextRequest, NextResponse } from 'next/server';
import { getClientIp, rateLimit } from '@/lib/rate-limit';
import { MAX_BOOKING_HORIZON_DAYS, computeMileageWindow } from '@/lib/mileage-rule';
import { SelfBookingError, getBranchAvailability, resolveService } from '@/lib/self-booking';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
    if (!rateLimit(`pbook-avail:${getClientIp(request)}`, 60, 60_000)) {
        return NextResponse.json({ success: false, error: 'คำขอมากเกินไป กรุณาลองใหม่ภายหลัง' }, { status: 429 });
    }
    try {
        const branchId = Number(request.nextUrl.searchParams.get('branchId'));
        if (!Number.isInteger(branchId)) return NextResponse.json({ success: false, error: 'ข้อมูลไม่ถูกต้อง' }, { status: 400 });
        // เลือกบริการแล้ว: ใช้เวลางานจริง และจำกัดวันตามเลขไมล์ (กฎเดียวกับหน้าเลือกเวลา)
        const sp = request.nextUrl.searchParams;
        const serviceTypeId = Number(sp.get('serviceTypeId'));
        if (!sp.get('serviceTypeId') || !Number.isInteger(serviceTypeId)) {
            return NextResponse.json({ success: true, data: { ...(await getBranchAvailability(branchId)), forService: false } });
        }
        const mileageId = sp.get('mileageId') ? Number(sp.get('mileageId')) : null;
        const service = await resolveService(serviceTypeId, mileageId, sp.get('carModel'));
        let horizonDays = MAX_BOOKING_HORIZON_DAYS;
        if (service.targetMileage != null) {
            const current = Math.trunc(Number(sp.get('currentMileage')));
            if (!Number.isFinite(current) || current < 0 || current > 999_999) throw new SelfBookingError('กรุณากรอกเลขไมล์ปัจจุบันให้ถูกต้อง');
            const window = computeMileageWindow(current, service.targetMileage);
            if (window.exceeded) throw new SelfBookingError('เลขไมล์ปัจจุบันถึงหรือเกินระยะเช็คที่เลือกแล้ว');
            horizonDays = window.maxDays;
        }
        const data = await getBranchAvailability(branchId, { duration: service.duration, horizonDays });
        return NextResponse.json({ success: true, data: { ...data, forService: true, limitedByMileage: horizonDays < MAX_BOOKING_HORIZON_DAYS } });
    } catch (error) {
        if (error instanceof SelfBookingError) return NextResponse.json({ success: false, error: error.message }, { status: error.status });
        console.error('Public booking availability error:', error);
        return NextResponse.json({ success: false, error: 'ไม่สามารถตรวจสอบที่ว่างได้' }, { status: 500 });
    }
}
