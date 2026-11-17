// Public: ลูกค้ายืนยันจองคิวเอง — ตรวจกฎทั้งหมดซ้ำฝั่ง server (ไม่เชื่อค่าที่ client ส่งมา)

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { notifyBookingEvent } from '@/lib/booking-notify';
import { getClientIp, rateLimit } from '@/lib/rate-limit';
import { getBangkokDateString } from '@/lib/utils';
import { addDaysToDateString, computeMileageWindow, MAX_BOOKING_HORIZON_DAYS } from '@/lib/mileage-rule';
import { computeEnd, isSlotFree, minutesToTime, timeToMinutes } from '@/lib/slot-suggest';
import { signBookingKey } from '@/lib/queue-token';
import {
    SelfBookingError, buildDaySchedules, createBookingWithRetry, dateFromString, findActiveBooking, getOnlineBranch,
    getSelfBookingUserId, isValidDateString, resolveService, resolveVehicle, rollbackIfConflict, toBookingView,
} from '@/lib/self-booking';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
    if (!rateLimit(`pbook-create:${getClientIp(request)}`, 10, 60_000)) {
        return NextResponse.json({ success: false, error: 'คำขอมากเกินไป กรุณาลองใหม่ภายหลัง' }, { status: 429 });
    }
    try {
        const body = await request.json().catch(() => null);
        if (!body || typeof body !== 'object') throw new SelfBookingError('ข้อมูลไม่ถูกต้อง');

        const phone = String(body.phone ?? '').replace(/\D/g, '');
        const branchId = Number(body.branchId);
        const serviceTypeId = Number(body.serviceTypeId);
        const mileageId = body.mileageId != null ? Number(body.mileageId) : null;
        const currentMileage = Math.trunc(Number(body.currentMileage));
        const bayId = Number(body.bayId);
        const date = body.date;
        const startTime = String(body.startTime ?? '');

        if (phone.length !== 10) throw new SelfBookingError('กรุณากรอกเบอร์โทร 10 หลัก');
        if (![branchId, serviceTypeId, bayId].every(Number.isInteger) || !isValidDateString(date) || !/^\d{2}:\d{2}$/.test(startTime)) {
            throw new SelfBookingError('ข้อมูลไม่ถูกต้อง');
        }

        // ข้อมูลรถ/ลูกค้า: EV7 API ก่อน, ไม่พบให้กรอกเอง
        const { plate, vehicle } = await resolveVehicle(String(body.carRegister ?? ''));
        const customerName = (vehicle?.customerName || String(body.customerName ?? '')).trim().slice(0, 100);
        const carModel = (vehicle?.carModel || String(body.carModel ?? '')).trim().slice(0, 100);
        if (!customerName) throw new SelfBookingError('กรุณากรอกชื่อ-นามสกุล');
        if (!carModel) throw new SelfBookingError('กรุณากรอกรุ่นรถ');

        await getOnlineBranch(branchId);
        const service = await resolveService(serviceTypeId, mileageId, carModel);

        // กฎเลขไมล์: วันจองต้องไม่เกินวันสูงสุดที่รถยังไม่เกินระยะ
        const today = getBangkokDateString();
        let horizon = MAX_BOOKING_HORIZON_DAYS;
        if (service.targetMileage != null) {
            if (!Number.isFinite(currentMileage) || currentMileage < 0 || currentMileage > 999_999) throw new SelfBookingError('กรุณากรอกเลขไมล์ปัจจุบันให้ถูกต้อง');
            const window = computeMileageWindow(currentMileage, service.targetMileage);
            if (window.exceeded) throw new SelfBookingError('เลขไมล์ปัจจุบันถึงหรือเกินระยะเช็คที่เลือกแล้ว');
            horizon = window.maxDays;
        }
        if (date < today || date > addDaysToDateString(today, horizon)) {
            throw new SelfBookingError('วันที่เลือกเกินกำหนดที่แนะนำสำหรับเลขไมล์ของคุณ กรุณาเลือกเวลาใหม่');
        }

        // ต้องยกเลิกการจองเดิมก่อนจองใหม่
        if (await findActiveBooking(plate)) {
            throw new SelfBookingError('รถทะเบียนนี้มีการจองที่ยังไม่เสร็จสิ้น กรุณายกเลิกการจองเดิมก่อนจองใหม่', 409, 'ACTIVE_BOOKING');
        }

        // ช่องเวลายังว่างจริงไหม (วันหยุด/วันปิด/ชน/พักเที่ยง/เวลาทำการ ตรวจในตารางเดียวกับที่ใช้แนะนำ)
        const [day] = await buildDaySchedules(branchId, date, date);
        const start = timeToMinutes(startTime);
        if (date === today && start < (day?.earliestStart ?? 0)) {
            throw new SelfBookingError('เวลาที่เลือกผ่านไปแล้ว กรุณาเลือกเวลาใหม่', 409, 'SLOT_TAKEN');
        }
        if (!day || !isSlotFree(day, bayId, start, service.duration)) {
            throw new SelfBookingError('ช่วงเวลานี้ไม่ว่างแล้ว กรุณาเลือกเวลาใหม่', 409, 'SLOT_TAKEN');
        }
        const endTime = minutesToTime(computeEnd(start, service.duration));

        const status = service.serviceType.Code === 'MILEAGE_CHECK' ? 1 : 0;
        const createBy = await getSelfBookingUserId();
        const booking = await createBookingWithRetry({
            BookingDate: dateFromString(date),
            StartTime: startTime,
            EndTime: endTime,
            CustomerName: customerName,
            CustomerPhone: phone,
            CarModel: carModel,
            CarRegister: plate,
            VinNo: vehicle?.vinNo ?? null,
            ProjectType: vehicle?.projectType ?? null,
            InventoryItemID: vehicle?.inventoryItemId ?? null,
            LastMileage: Number.isFinite(currentMileage) ? Math.max(0, currentMileage) : 0,
            Mileage: service.targetMileage ?? 0,
            ClaimDetail: '',
            BranchID: branchId,
            CreateBy: createBy,
            BookingType: vehicle ? 'EV7' : 'RETAIL', // EV7 ล่ม (กรอกเอง) → RETAIL
            Status: status,
            BayID: bayId,
            ServiceTypeID: serviceTypeId,
            DurationMinutes: service.duration,
        }, date);

        await rollbackIfConflict(booking); // กันจองซ้ำเมื่อมีคำขอพร้อมกัน

        await prisma.cM_BookingLog.create({
            data: {
                BookingID: booking.BookingID,
                LogType: status === 1 ? 'AUTO_APPROVED' : 'CREATED',
                Content: `ลูกค้าจองคิวเองผ่านหน้าเว็บ (${booking.ServiceType?.Name || 'N/A'}) ${booking.Bay?.BayName || ''}` + (status === 1 ? ' — อนุมัติอัตโนมัติ' : ' — รออนุมัติ'),
                CreateBy: 'ลูกค้าจองเอง',
            },
        });

        await notifyBookingEvent({
            event: status === 1 ? 'AUTO_APPROVED' : 'CREATED',
            booking,
            actorName: 'ลูกค้าจองเอง',
            branchName: booking.Branch?.BranchName ?? null,
            bayName: booking.Bay?.BayName || null,
            serviceTypeName: booking.ServiceType?.Name || null,
            footerNote: status === 1 ? 'อนุมัติอัตโนมัติ (ลูกค้าจองเอง)' : 'สถานะ: รออนุมัติ (ลูกค้าจองเอง)',
        });

        return NextResponse.json({
            success: true,
            data: { bookingKey: signBookingKey(booking.BookingID), booking: toBookingView(booking) },
            message: status === 1 ? 'ยืนยันการจองเรียบร้อยแล้ว' : 'ส่งคำขอจองแล้ว รอสาขาอนุมัติ',
        });
    } catch (error) {
        if (error instanceof SelfBookingError) {
            return NextResponse.json({ success: false, error: error.message, code: error.code }, { status: error.status });
        }
        console.error('Public booking create error:', error);
        return NextResponse.json({ success: false, error: 'ไม่สามารถจองได้ กรุณาลองใหม่อีกครั้ง' }, { status: 500 });
    }
}
