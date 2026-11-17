// Admin: ดูตัวอย่างผลการค้นหาจากทะเบียนที่กำลังพิมพ์ในฟอร์มแก้ไขคิว (ยังไม่บันทึก)
// ใช้กติกาเดียวกับตอนบันทึก (PATCH): ค้นใบจองของวันที่ของคิวก่อน ถ้าไม่เจอค้นข้อมูลรถจาก EV7
// ทะเบียนเดิม (ไม่เปลี่ยน) และคิวยังไม่ผูกใบจอง: ค้นเฉพาะใบจอง เพราะตอนบันทึกระบบจะลองผูกให้

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getQueueUser } from '@/lib/queue-auth';
import { ADMIN_BOOKING_STATUSES, findBookingNearMisses, findTodayBooking, queuePlate } from '@/lib/queue-service';
import { ACTIVE_STATUSES } from '@/lib/queue-status';
import { lookupVehicleDetailed } from '@/lib/queue-vehicle';
import { rateLimit } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const auth = await getQueueUser();
    if ('error' in auth) return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
    if (!rateLimit(`qprev:${auth.user.id}`, 120, 60_000)) {
        return NextResponse.json({ success: false, error: 'คำขอมากเกินไป' }, { status: 429 });
    }
    const { id } = await params;
    const queue = await prisma.cM_Queue.findUnique({ where: { QueueID: Number(id) } });
    if (!queue || !auth.guard(queue.BranchID)) return NextResponse.json({ success: false, error: 'ไม่พบคิว' }, { status: 404 });

    const plate = queuePlate(request.nextUrl.searchParams.get('plate') ?? '');
    if (plate.length < 2 || plate.length > 20) return NextResponse.json({ success: true, data: { kind: 'none' } });
    const samePlate = plate === queue.CarRegister;
    // ทะเบียนเดิมและคิวผูกใบจองอยู่แล้ว: ไม่มีอะไรต้องทำ
    if (samePlate && queue.BookingID != null) return NextResponse.json({ success: true, data: { kind: 'none' } });
    const searchedDate = queue.QueueDate.toISOString().slice(0, 10);

    // ทะเบียนนี้มีคิวอื่นที่ยังไม่ปิดอยู่แล้วหรือไม่ (บันทึกจะถูกปฏิเสธ)
    const dup = !samePlate && ACTIVE_STATUSES.includes(queue.Status as never)
        ? await prisma.cM_Queue.findFirst({
            where: { BranchID: queue.BranchID, QueueDate: queue.QueueDate, CarRegister: plate, Status: { in: ACTIVE_STATUSES }, QueueID: { not: queue.QueueID } },
            select: { QueueLabel: true },
        })
        : null;

    // คิวผูกใบจองอยู่แล้ว และทะเบียนใหม่ไม่ตรงกับใบจองนั้น -> เมื่อบันทึกจะปลดใบจองเดิมออก แล้วค้นของทะเบียนใหม่
    let unlinkBookingNo: string | null = null;
    if (queue.BookingID != null) {
        const old = await prisma.cM_Booking.findUnique({ where: { BookingID: queue.BookingID }, select: { BookingNo: true, CarRegister: true } });
        if (old && queuePlate(old.CarRegister) !== plate) unlinkBookingNo = old.BookingNo;
    }
    const canLink = queue.BookingID == null || unlinkBookingNo != null;
    const common = { unlinkBookingNo, duplicateLabel: dup?.QueueLabel ?? null, searchedDate, samePlate };

    const booking = canLink ? await findTodayBooking(queue.BranchID, plate, queue.QueueDate, ADMIN_BOOKING_STATUSES) : null;
    if (booking) {
        return NextResponse.json({
            success: true,
            data: {
                kind: 'booking',
                ...common,
                booking: {
                    bookingNo: booking.BookingNo,
                    startTime: booking.StartTime,
                    endTime: booking.EndTime,
                    serviceTypeName: booking.ServiceType?.Name ?? null,
                    carModel: booking.CarModel,
                    customerName: booking.CustomerName,
                    customerPhone: booking.CustomerPhone,
                    projectType: booking.ProjectType || null,
                    mileage: booking.Mileage > 0 ? booking.Mileage : null,
                },
            },
        });
    }
    if (!canLink) return NextResponse.json({ success: true, data: { kind: 'none' } });

    // ไม่เจอใบจองที่ตรงเงื่อนไข: บอกว่ามีใบจองของทะเบียนนี้ที่ถูกข้ามเพราะอะไร (คนละวัน/สาขา/สถานะ/ผูกกับคิวอื่น)
    const nearMisses = await findBookingNearMisses(queue, plate, ADMIN_BOOKING_STATUSES);

    // ทะเบียนเดิม: ตอนบันทึกจะค้นเฉพาะใบจอง ไม่ค้น EV7 จึงไม่ค้นให้ในตัวอย่างด้วย
    if (samePlate) return NextResponse.json({ success: true, data: { kind: 'notfound', ...common, nearMisses } });

    const { vehicle, failed } = await lookupVehicleDetailed(plate);
    if (vehicle) {
        return NextResponse.json({
            success: true,
            data: {
                kind: 'vehicle',
                ...common,
                nearMisses,
                vehicle: { carModel: vehicle.carModel, customerName: vehicle.customerName, projectType: vehicle.projectType || null },
            },
        });
    }
    return NextResponse.json({ success: true, data: { kind: failed ? 'error' : 'notfound', ...common, nearMisses } });
}
