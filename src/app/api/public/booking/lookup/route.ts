// Public: ตรวจทะเบียนรถ — ข้อมูลรถ (mask ชื่อ) และคิวค้างอยู่หรือไม่
// ต้องกรอกเบอร์ตรงกับที่จองไว้ จึงได้ key สำหรับดู/ยกเลิกการจองเดิม

import { NextRequest, NextResponse } from 'next/server';
import { getClientIp, rateLimit } from '@/lib/rate-limit';
import { maskName } from '@/lib/queue-vehicle';
import { signBookingKey } from '@/lib/queue-token';
import { SelfBookingError, findActiveBooking, parsePlate, resolveVehicle, toBookingView } from '@/lib/self-booking';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
    if (!rateLimit(`pbook-lookup:${getClientIp(request)}`, 30, 60_000)) {
        return NextResponse.json({ success: false, error: 'คำขอมากเกินไป กรุณาลองใหม่ภายหลัง' }, { status: 429 });
    }
    try {
        const body = await request.json().catch(() => null);
        const phone = String(body?.phone ?? '').replace(/\D/g, '');
        // เบอร์โทรเป็นตัวเลือก: ค้นด้วยทะเบียนอย่างเดียวได้ แต่จะดู/ยกเลิกการจองเดิมได้ต้องกรอกเบอร์ที่ใช้จอง
        if (phone && phone.length !== 10) {
            return NextResponse.json({ success: false, error: 'กรุณากรอกเบอร์โทร 10 หลัก' }, { status: 400 });
        }

        // ลำดับเดียวกับหน้าเช็คอิน หยุดที่ข้อแรกที่เจอ: 1) การจองที่ยังใช้งานอยู่ของทะเบียนนี้ (เทียบทั้งค่า) 2) EV7 3) ไม่พบ/EV7 ล้มเหลว → กรอกเอง
        const plate = parsePlate(String(body?.carRegister ?? ''));
        const active = await findActiveBooking(plate);
        const vehicle = active ? null : (await resolveVehicle(plate)).vehicle;
        const vehicleView = vehicle
            ? { found: true, registerNo: vehicle.registerNo ?? plate, carModel: vehicle.carModel, customerNameMasked: maskName(vehicle.customerName), hasName: !!vehicle.customerName?.trim() }
            : { found: false, carModel: null, customerNameMasked: '', hasName: false };

        if (!active) return NextResponse.json({ success: true, data: { carRegister: plate, vehicle: vehicleView, hasActiveBooking: false } });

        const verified = phone.length === 10 && (active.CustomerPhone ?? '').replace(/\D/g, '') === phone;
        return NextResponse.json({
            success: true,
            data: {
                carRegister: plate,
                vehicle: vehicleView,
                hasActiveBooking: true,
                // ไม่เปิดเผยรายละเอียด/key ถ้าเบอร์ไม่ตรงกับที่จองไว้
                verified,
                ...(verified ? { bookingKey: signBookingKey(active.BookingID), booking: toBookingView(active) } : {}),
            },
        });
    } catch (error) {
        if (error instanceof SelfBookingError) return NextResponse.json({ success: false, error: error.message, code: error.code }, { status: error.status });
        console.error('Public booking lookup error:', error);
        return NextResponse.json({ success: false, error: 'ไม่สามารถตรวจสอบทะเบียนได้' }, { status: 500 });
    }
}
