// Public: แนะนำช่วงเวลาจอง 5 ช่อง (ลงล็อกที่สุด + อยู่ในวันสูงสุดตามกฎเลขไมล์)

import { NextRequest, NextResponse } from 'next/server';
import { getClientIp, rateLimit } from '@/lib/rate-limit';
import { getBangkokDateString } from '@/lib/utils';
import { addDaysToDateString, computeMileageWindow, MAX_BOOKING_HORIZON_DAYS } from '@/lib/mileage-rule';
import { minutesToTime, suggestSlots } from '@/lib/slot-suggest';
import { SelfBookingError, buildDaySchedules, resolveService } from '@/lib/self-booking';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
    if (!rateLimit(`pbook-suggest:${getClientIp(request)}`, 30, 60_000)) {
        return NextResponse.json({ success: false, error: 'คำขอมากเกินไป กรุณาลองใหม่ภายหลัง' }, { status: 429 });
    }
    try {
        const body = await request.json().catch(() => null);
        const branchId = Number(body?.branchId);
        const serviceTypeId = Number(body?.serviceTypeId);
        const mileageId = body?.mileageId != null ? Number(body.mileageId) : null;
        const currentMileage = Math.trunc(Number(body?.currentMileage));
        if (!Number.isInteger(branchId) || !Number.isInteger(serviceTypeId)) {
            return NextResponse.json({ success: false, error: 'ข้อมูลไม่ถูกต้อง' }, { status: 400 });
        }

        const service = await resolveService(serviceTypeId, mileageId, typeof body?.carModel === 'string' ? body.carModel : null);

        let horizon = MAX_BOOKING_HORIZON_DAYS;
        let window = null;
        if (service.targetMileage != null) {
            if (!Number.isFinite(currentMileage) || currentMileage < 0 || currentMileage > 999_999) {
                return NextResponse.json({ success: false, error: 'กรุณากรอกเลขไมล์ปัจจุบันให้ถูกต้อง' }, { status: 400 });
            }
            window = computeMileageWindow(currentMileage, service.targetMileage);
            if (window.exceeded) {
                return NextResponse.json({ success: false, error: 'เลขไมล์ปัจจุบันถึงหรือเกินระยะเช็คที่เลือกแล้ว กรุณาเลือกระยะเช็คถัดไป' }, { status: 400 });
            }
            horizon = window.maxDays;
        }

        const today = getBangkokDateString();
        const days = await buildDaySchedules(branchId, today, addDaysToDateString(today, horizon));
        const slots = suggestSlots({ days, duration: service.duration, count: 5 });

        return NextResponse.json({
            success: true,
            data: {
                durationMinutes: service.duration,
                autoApprove: service.serviceType.Code === 'MILEAGE_CHECK',
                mileage: window && { maxDays: window.maxDays, remainingKm: window.remainingKm, urgent: window.urgent, lastBookableDate: addDaysToDateString(today, horizon) },
                slots: slots.map((s) => ({ date: s.date, bayId: s.bayId, startTime: minutesToTime(s.start), endTime: minutesToTime(s.end) })),
            },
        });
    } catch (error) {
        if (error instanceof SelfBookingError) return NextResponse.json({ success: false, error: error.message }, { status: error.status });
        console.error('Public booking suggest error:', error);
        return NextResponse.json({ success: false, error: 'ไม่สามารถค้นหาเวลาว่างได้' }, { status: 500 });
    }
}
