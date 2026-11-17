// Public: ลูกค้าเช็คอินรับคิว (ต้องมี QR token; สาขามาจาก URL ที่ตรวจแล้ว ไม่ใช่ body)

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { resolvePublicBranch } from '@/lib/queue-public';
import {
    NEW_CAR_SERVICE_TEXT, QueueInputError, checkInQueue, getTodayQueueDate, queuePlate,
} from '@/lib/queue-service';
import { ACTIVE_STATUSES } from '@/lib/queue-status';
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

        // ลูกค้ามารับรถใหม่: ยังไม่มีทะเบียน กรอกชื่อ เบอร์ และโครงการ แล้วเช็คอินได้เลย
        if (body.newCar === true) {
            const name = String(body.customerName ?? '').trim();
            const phoneNew = String(body.customerPhone ?? '').replace(/\D/g, '');
            const project = String(body.project ?? '').trim();
            if (!name) return NextResponse.json({ success: false, error: 'กรุณากรอกชื่อ-นามสกุล' }, { status: 400 });
            if (name.length > 100) return NextResponse.json({ success: false, error: 'ชื่อยาวเกินไป' }, { status: 400 });
            if (phoneNew.length !== 10) return NextResponse.json({ success: false, error: 'กรุณากรอกเบอร์โทร 10 หลัก' }, { status: 400 });
            if (!project || project.length > 100) {
                return NextResponse.json({ success: false, error: 'กรุณาเลือกโครงการ' }, { status: 400 });
            }
            // กันกดซ้ำ/เช็คอินซ้ำ: เบอร์เดียวกันที่มีคิวรับรถใหม่ค้างอยู่วันนี้ -> คืนคิวเดิม
            const dup = await prisma.cM_Queue.findFirst({
                where: {
                    BranchID: branch.BranchID,
                    QueueDate: getTodayQueueDate(),
                    CustomerPhone: phoneNew,
                    CarRegister: '',
                    ServiceOther: NEW_CAR_SERVICE_TEXT,
                    Status: { in: ACTIVE_STATUSES },
                },
            });
            const { queue, created } = dup
                ? { queue: dup, created: false }
                : await checkInQueue({
                    newCar: true,
                    claimsBooking: false,
                    branchId: branch.BranchID,
                    carRegister: '',
                    customerName: name,
                    customerPhone: phoneNew,
                    serviceTypeId: null,
                    serviceOther: NEW_CAR_SERVICE_TEXT,
                    projectType: project,
                });
            return NextResponse.json({
                success: true,
                data: {
                    ticketKey: signTicket(queue.QueueID),
                    queueLabel: queue.QueueLabel,
                    status: queue.Status,
                    statusLabel: QUEUE_STATUS_LABEL[queue.Status as QueueStatus] ?? queue.Status,
                    created,
                },
            });
        }

        const typedPlate = queuePlate(String(body.carRegister ?? ''));
        const customerName = String(body.customerName ?? '').trim();
        const phone = String(body.customerPhone ?? '').replace(/\D/g, '');
        if (typedPlate.length < 2 || typedPlate.length > 20) {
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

        const plate = typedPlate;
        const vehicle = await lookupVehicle(plate);
        // EV7 ค้นแบบบางส่วนได้ แต่ต้องพิมพ์ทะเบียนครบ ไม่บันทึกคิวด้วยเลขที่พิมพ์ไม่ครบ
        if (vehicle?.registerNo && queuePlate(vehicle.registerNo) !== plate) {
            return NextResponse.json({ success: false, error: 'กรุณากรอกทะเบียนรถให้ครบ (รวมตัวอักษรนำหน้า)' }, { status: 400 });
        }
        const { queue, created } = await checkInQueue({
            branchId: branch.BranchID,
            carRegister: plate,
            customerName: customerName || null,
            customerPhone: phone || null,
            serviceTypeId,
            currentMileage: body.currentMileage != null ? Number(body.currentMileage) : null,
            mileageId: body.mileageId != null ? Number(body.mileageId) : null,
            serviceOther: body.otherService === true ? serviceOther || null : null,
            claimsBooking: Boolean(body.claimsBooking),
            // ไม่พบข้อมูลรถ (หรือเรียก EV7 ไม่สำเร็จ): เว้นโครงการว่างไว้ ให้แอดมินแก้ภายหลัง (ไม่เดาเป็น Retail)
            // โครงการ = ค่า Project Type จาก EV7 API ตามที่ส่งมา; ไม่พบข้อมูลรถ/เรียก EV7 ไม่ได้ = ว่าง ให้แอดมินกำหนดภายหลัง
            projectType: vehicle?.projectType ?? null,
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
            return NextResponse.json({ success: false, error: error.message, code: error.code }, { status: 400 });
        }
        console.error('Queue check-in error:', error);
        return NextResponse.json({ success: false, error: 'ไม่สามารถเช็คอินได้ กรุณาลองใหม่อีกครั้ง' }, { status: 500 });
    }
}
