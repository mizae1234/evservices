// Public: ค้นข้อมูลจากทะเบียนรถ (คิวเดิมของวันนี้ / การจอง / ข้อมูลรถในระบบ) สำหรับหน้า Check-in
// ข้อมูลส่วนบุคคลที่ตอบกลับถูก mask เสมอ; การเช็คอินจริงใช้ข้อมูลฝั่ง server ไม่เชื่อค่าจาก client

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { resolvePublicBranch } from '@/lib/queue-public';
import { findTodayBooking, getTicketView, getTodayQueueDate, normalizePlate } from '@/lib/queue-service';
import { ACTIVE_STATUSES } from '@/lib/queue-status';
import { signTicket } from '@/lib/queue-token';
import { lookupVehicle, maskName, maskPhone } from '@/lib/queue-vehicle';
import { getClientIp, rateLimit } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest, { params }: { params: Promise<{ branchCode: string }> }) {
    if (!rateLimit(`lookup:${getClientIp(request)}`, 30, 60_000)) {
        return NextResponse.json({ success: false, error: 'คำขอมากเกินไป กรุณาลองใหม่ภายหลัง' }, { status: 429 });
    }
    try {
        const { branchCode } = await params;
        const body = await request.json().catch(() => null);
        const branch = await resolvePublicBranch(branchCode, 'checkin', body?.token);
        if (!branch) return NextResponse.json({ success: false, error: 'QR Code ไม่ถูกต้องหรือหมดอายุ' }, { status: 404 });

        const plate = normalizePlate(String(body?.carRegister ?? ''));
        if (plate.length < 2 || plate.length > 20) {
            return NextResponse.json({ success: false, error: 'กรุณากรอกทะเบียนรถให้ถูกต้อง' }, { status: 400 });
        }
        const queueDate = getTodayQueueDate();

        const existing = await prisma.cM_Queue.findFirst({
            where: { BranchID: branch.BranchID, QueueDate: queueDate, CarRegister: plate, Status: { in: ACTIVE_STATUSES } },
            select: { QueueID: true },
        });
        if (existing) {
            return NextResponse.json({
                success: true,
                data: { kind: 'ticket', ticketKey: signTicket(existing.QueueID), ticket: await getTicketView(existing.QueueID, branch.BranchID) },
            });
        }

        const booking = await findTodayBooking(branch.BranchID, plate, queueDate);
        if (booking) {
            return NextResponse.json({
                success: true,
                data: {
                    kind: 'booking',
                    booking: {
                        bookingNo: booking.BookingNo,
                        bookingDate: queueDate.toISOString().slice(0, 10),
                        carRegister: booking.CarRegister,
                        startTime: booking.StartTime,
                        endTime: booking.EndTime,
                        serviceTypeId: booking.ServiceTypeID,
                        serviceTypeName: booking.ServiceType?.Name ?? null,
                        carModel: booking.CarModel,
                        customerName: maskName(booking.CustomerName),
                        customerPhone: maskPhone(booking.CustomerPhone),
                    },
                },
            });
        }

        const vehicle = await lookupVehicle(plate);
        if (vehicle) {
            return NextResponse.json({
                success: true,
                data: { kind: 'vehicle', vehicle: { carRegister: plate, carModel: vehicle.carModel, customerName: maskName(vehicle.customerName) } },
            });
        }
        return NextResponse.json({ success: true, data: { kind: 'new' } });
    } catch (error) {
        console.error('Queue lookup error:', error);
        return NextResponse.json({ success: false, error: 'ไม่สามารถค้นหาข้อมูลได้ กรุณาลองใหม่อีกครั้ง' }, { status: 500 });
    }
}
