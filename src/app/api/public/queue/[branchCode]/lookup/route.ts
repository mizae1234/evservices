// Public: ค้นข้อมูลจากทะเบียนรถ (คิวเดิมของวันนี้ / การจอง / ข้อมูลรถในระบบ) สำหรับหน้า Check-in
// ข้อมูลส่วนบุคคลที่ตอบกลับถูก mask เสมอ; การเช็คอินจริงใช้ข้อมูลฝั่ง server ไม่เชื่อค่าจาก client

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { resolvePublicBranch } from '@/lib/queue-public';
import { findTodayBooking, getTicketView, getTodayQueueDate, queuePlate } from '@/lib/queue-service';
import { ACTIVE_STATUSES } from '@/lib/queue-status';
import { getMileageOptions, matchCarModelIds } from '@/lib/queue-mileage';
import { signTicket } from '@/lib/queue-token';
import { lookupVehicle, maskName, maskPhone } from '@/lib/queue-vehicle';
import { getClientIp, rateLimit } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

/** ระยะเช็คเฉพาะรุ่นรถ (null = ไม่รู้รุ่น/จับคู่ไม่ได้ -> ให้ใช้ทุกระยะ) */
async function modelMileageOptions(carModel: string | null | undefined) {
    const ids = await matchCarModelIds(carModel);
    return ids.length ? getMileageOptions({ modelIds: ids }) : null;
}

/** ทะเบียนที่พิมพ์ไม่ตรงกับทะเบียนเต็มของรถที่ EV7 พบ = พิมพ์ไม่ครบ */
function isPartialPlate(typed: string, registerNo: string | null | undefined): boolean {
    return !!registerNo && queuePlate(registerNo) !== typed;
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ branchCode: string }> }) {
    if (!rateLimit(`lookup:${getClientIp(request)}`, 30, 60_000)) {
        return NextResponse.json({ success: false, error: 'คำขอมากเกินไป กรุณาลองใหม่ภายหลัง' }, { status: 429 });
    }
    try {
        const { branchCode } = await params;
        const body = await request.json().catch(() => null);
        const branch = await resolvePublicBranch(branchCode, 'checkin', body?.token);
        if (!branch) return NextResponse.json({ success: false, error: 'QR Code ไม่ถูกต้องหรือหมดอายุ' }, { status: 404 });

        const plate = queuePlate(String(body?.carRegister ?? ''));
        if (plate.length < 2 || plate.length > 20) {
            return NextResponse.json({ success: false, error: 'กรุณากรอกทะเบียนรถให้ถูกต้อง' }, { status: 400 });
        }
        const queueDate = getTodayQueueDate();

        // คิวเดิมของวันนี้ -> การจอง ด้วยทะเบียนที่ระบุ (เรียกซ้ำอีกรอบด้วยทะเบียนเต็มจาก EV7 กรณีลูกค้าพิมพ์แค่เลขท้าย)
        const findExisting = async (p: string) => {
            const existing = await prisma.cM_Queue.findFirst({
                where: { BranchID: branch.BranchID, QueueDate: queueDate, CarRegister: p, Status: { in: ACTIVE_STATUSES } },
                select: { QueueID: true },
            });
            if (!existing) return null;
            return NextResponse.json({
                success: true,
                data: { kind: 'ticket', ticketKey: signTicket(existing.QueueID), ticket: await getTicketView(existing.QueueID, branch.BranchID) },
            });
        };
        const ticketRes = await findExisting(plate);
        if (ticketRes) return ticketRes;

        const booking = await findTodayBooking(branch.BranchID, plate, queueDate);
        let vehicle: Awaited<ReturnType<typeof lookupVehicle>> = null;
        if (!booking) {
            vehicle = await lookupVehicle(plate);
            // EV7 ค้นแบบบางส่วนได้ (เช่น เลขท้าย) แต่ต้องให้ลูกค้าพิมพ์ทะเบียนครบ ไม่เปิดเผยข้อมูลจากการเดา
            if (vehicle && isPartialPlate(plate, vehicle.registerNo)) {
                return NextResponse.json({ success: false, error: 'กรุณากรอกทะเบียนรถให้ครบ (รวมตัวอักษรนำหน้า)' }, { status: 400 });
            }
        }
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
                        projectType: booking.ProjectType || null,
                        customerName: maskName(booking.CustomerName),
                        customerPhone: maskPhone(booking.CustomerPhone),
                    },
                },
            });
        }

        if (vehicle) {
            return NextResponse.json({
                success: true,
                data: { kind: 'vehicle', vehicle: { carRegister: plate, carModel: vehicle.carModel, customerName: maskName(vehicle.customerName), projectType: vehicle.projectType || null, mileageOptions: await modelMileageOptions(vehicle.carModel) } },
            });
        }
        // ไม่พบ (หรือเรียก EV7 ไม่สำเร็จ) -> ลูกค้ากรอกข้อมูลเองได้เสมอ ไม่แสดงข้อความแจ้งเตือน
        return NextResponse.json({ success: true, data: { kind: 'new' } });
    } catch (error) {
        console.error('Queue lookup error:', error);
        return NextResponse.json({ success: false, error: 'ไม่สามารถค้นหาข้อมูลได้ กรุณาลองใหม่อีกครั้ง' }, { status: 500 });
    }
}
