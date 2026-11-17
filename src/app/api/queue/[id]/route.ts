// Admin: รายละเอียดคิว + ประวัติ, บันทึกรายละเอียดงานซ่อม

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getQueueUser } from '@/lib/queue-auth';
import { publishQueueChange } from '@/lib/queue-events';
import { ADMIN_BOOKING_STATUSES, bookingRepairDetail, findTodayBooking, queuePlate } from '@/lib/queue-service';
import { lookupVehicleDetailed } from '@/lib/queue-vehicle';
import type { Prisma } from '@prisma/client';
import { ACTIVE_STATUSES } from '@/lib/queue-status';

export const dynamic = 'force-dynamic';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const auth = await getQueueUser();
    if ('error' in auth) return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
    const { id } = await params;
    const queue = await prisma.cM_Queue.findUnique({
        where: { QueueID: Number(id) },
        include: { Logs: { orderBy: { CreateDate: 'desc' } }, ServiceType: { select: { Name: true } }, Booking: true },
    });
    if (!queue || !auth.guard(queue.BranchID)) return NextResponse.json({ success: false, error: 'ไม่พบคิว' }, { status: 404 });
    return NextResponse.json({ success: true, data: queue });
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const auth = await getQueueUser();
    if ('error' in auth) return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const queue = await prisma.cM_Queue.findUnique({
        where: { QueueID: Number(id) },
        include: { ServiceType: { select: { Name: true } } },
    });
    if (!queue || !auth.guard(queue.BranchID)) return NextResponse.json({ success: false, error: 'ไม่พบคิว' }, { status: 404 });

    const bad = (error: string) => NextResponse.json({ success: false, error }, { status: 400 });
    const data: Prisma.CM_QueueUncheckedUpdateInput = {};
    const changes: string[] = [];
    const clip = (t: string) => (t.length > 80 ? `${t.slice(0, 80)}…` : t);
    const fromService = queue.ServiceType?.Name ?? (queue.ServiceOther ? `อื่นๆ ("${clip(queue.ServiceOther)}")` : 'อื่นๆ');
    const str = (v: unknown) => (typeof v === 'string' ? v.trim() : null);

    // รายละเอียดงานซ่อม (เดิม) — แก้ได้ทุกสถานะ
    if ('repairDetail' in body) {
        if (typeof body.repairDetail !== 'string' || body.repairDetail.length > 4000) return bad('รายละเอียดงานซ่อมไม่ถูกต้อง');
        const v = body.repairDetail.trim();
        if (v !== (queue.RepairDetail ?? '')) { data.RepairDetail = v; changes.push('รายละเอียดงานซ่อม'); }
        data.NeedsReview = false;
    }
    if ('customerName' in body) {
        const v = str(body.customerName);
        if (!v) return bad('กรุณากรอกชื่อลูกค้า');
        if (v.length > 100) return bad('ชื่อยาวเกินไป');
        if (v !== queue.CustomerName) { data.CustomerName = v; changes.push(`ชื่อ: ${queue.CustomerName} → ${v}`); }
    }
    if ('customerPhone' in body) {
        const v = String(body.customerPhone ?? '').replace(/\D/g, '');
        if (v && v.length !== 10) return bad('กรุณากรอกเบอร์โทร 10 หลัก');
        if ((v || null) !== queue.CustomerPhone) { data.CustomerPhone = v || null; changes.push('เบอร์โทร'); }
    }
    if ('carRegister' in body) {
        const v = queuePlate(String(body.carRegister ?? ''));
        // คิวรับรถใหม่ยังไม่มีทะเบียน: ปล่อยว่างต่อได้ (บันทึกอย่างอื่นโดยไม่ต้องกรอกทะเบียน)
        if (!(v === '' && queue.CarRegister === '') && (v.length < 2 || v.length > 20)) return bad('กรุณากรอกทะเบียนรถให้ถูกต้อง');
        if (v !== queue.CarRegister) { data.CarRegister = v; changes.push(`ทะเบียน: ${queue.CarRegister || 'ยังไม่มี'} → ${v}`); }
    }
    if ('carModel' in body) {
        const v = str(body.carModel) ?? '';
        if (v.length > 100) return bad('รุ่นรถยาวเกินไป');
        if ((v || null) !== queue.CarModel) { data.CarModel = v || null; changes.push('รุ่นรถ'); }
    }
    for (const [key, field, label] of [['lastMileage', 'LastMileage', 'เลขไมล์ล่าสุด'], ['mileage', 'Mileage', 'ระยะเช็ค']] as const) {
        if (!(key in body)) continue;
        const raw = body[key];
        const v = raw === '' || raw == null ? null : Math.trunc(Number(raw));
        if (v !== null && (!Number.isFinite(v) || v < 0 || v > 999_999)) return bad(`${label}ไม่ถูกต้อง`);
        if (v !== queue[field]) {
            data[field] = v;
            changes.push(`${label}: ${queue[field] != null ? queue[field]!.toLocaleString('en-US') : '-'} → ${v != null ? v.toLocaleString('en-US') : '-'} กม.`);
        }
    }
    // โครงการ (พิมพ์อิสระ)
    if ('projectType' in body) {
        const v = String(body.projectType ?? '').trim();
        if (v.length > 100) return bad('โครงการยาวเกินไป');
        if ((v || null) !== queue.ProjectType) { data.ProjectType = v || null; changes.push(`โครงการ: ${queue.ProjectType || '-'} → ${v || '-'}`); }
    }
    if ('serviceTypeId' in body || 'otherService' in body) {
        if (body.otherService === true) {
            const text = (str(body.serviceOther) ?? '').slice(0, 200);
            if (!text) return bad('กรุณาระบุบริการที่ต้องการ');
            if (queue.ServiceTypeID != null || text !== (queue.ServiceOther ?? '')) {
                data.ServiceTypeID = null;
                data.ServiceOther = text;
                changes.push(`บริการ: ${fromService} → อื่นๆ ("${clip(text)}")`);
            }
        } else {
            const stId = Number(body.serviceTypeId);
            if (!Number.isInteger(stId)) return bad('ประเภทบริการไม่ถูกต้อง');
            const st = await prisma.cM_ServiceType.findFirst({ where: { ServiceTypeID: stId, IsActive: true }, select: { Name: true } });
            if (!st) return bad('ประเภทบริการไม่ถูกต้อง');
            if (stId !== queue.ServiceTypeID) {
                // เก็บ ServiceOther เดิมไว้ (ข้อความที่ลูกค้าพิมพ์ตอนเช็คอิน) ไม่ล้างทิ้ง
                data.ServiceTypeID = stId;
                changes.push(`บริการ: ${fromService} → ${st.Name}`);
            }
        }
    }

    // กันทะเบียนซ้ำกับคิวที่ยังเปิดอยู่ (ตรวจในแอป ไม่พึ่งดัชนีใน DB อย่างเดียว)
    if (typeof data.CarRegister === 'string' && data.CarRegister) {
        const dup = await prisma.cM_Queue.findFirst({
            where: {
                BranchID: queue.BranchID,
                QueueDate: queue.QueueDate,
                CarRegister: data.CarRegister,
                Status: { in: ACTIVE_STATUSES },
                QueueID: { not: queue.QueueID },
            },
            select: { QueueID: true },
        });
        if (dup && ACTIVE_STATUSES.includes(queue.Status as never)) {
            return NextResponse.json({ success: false, error: 'ทะเบียนนี้มีคิวที่ยังไม่ปิดอยู่แล้ว' }, { status: 409 });
        }
    }

    // แก้ทะเบียนเป็นค่าใหม่: ปลดใบจองเดิมถ้าทะเบียนไม่ตรงกับใบจองนั้น แล้วค้นใบจอง/ข้อมูลรถ EV7 ของทะเบียนใหม่
    // เพื่อผูก/เติมข้อมูลที่ยังว่าง (ไม่ทับข้อมูลที่มีอยู่ ไม่แตะชื่อและเบอร์ที่ลูกค้ากรอก)
    const notices: string[] = [];
    if (typeof data.CarRegister === 'string' && data.CarRegister) {
        const plate = data.CarRegister;
        const eff = <K extends 'CarModel' | 'VinNo' | 'InventoryItemID' | 'RepairDetail' | 'Mileage' | 'LastMileage' | 'ProjectType'>(k: K) =>
            (k in data ? (data as Record<string, unknown>)[k] : queue[k]) as (typeof queue)[K];
        // แอดมินเปลี่ยนโครงการในครั้งนี้จริงหรือไม่ (ฟอร์มส่งค่าเดิมมาทุกครั้ง จึงดูจากค่าที่เปลี่ยน ไม่ใช่แค่มี key) — ต้องจับก่อนล้างข้อมูลด้านล่าง
        const projectEdited = 'ProjectType' in data;
        const mileageEdited = 'Mileage' in data || 'LastMileage' in data;
        const filled: string[] = [];
        let canLink = queue.BookingID == null;
        let linked = false;

        // 1) ปลดใบจองเดิม ถ้าทะเบียนใหม่ไม่ตรงกับใบจองที่ผูกอยู่
        if (queue.BookingID != null) {
            const old = await prisma.cM_Booking.findUnique({ where: { BookingID: queue.BookingID }, include: { ServiceType: { select: { Name: true } } } });
            if (old && queuePlate(old.CarRegister) !== plate) {
                data.BookingID = null;
                canLink = true;
                const cleared: string[] = [];
                // ล้างเฉพาะช่องที่ค่ายังเท่ากับที่คัดลอกมาจากใบจองเดิม (ถ้าแอดมินแก้ค่าเองแล้วจะไม่ลบ)
                if (old.CarModel && eff('CarModel') === old.CarModel) { data.CarModel = null; cleared.push('รุ่นรถ'); }
                if (old.VinNo && eff('VinNo') === old.VinNo) { data.VinNo = null; cleared.push('VIN'); }
                if (old.InventoryItemID && eff('InventoryItemID') === old.InventoryItemID) data.InventoryItemID = null;
                if (!projectEdited && old.ProjectType && eff('ProjectType') === old.ProjectType) { data.ProjectType = null; cleared.push('โครงการ'); }
                const oldDetail = bookingRepairDetail(old);
                if (oldDetail && eff('RepairDetail') === oldDetail) { data.RepairDetail = null; cleared.push('รายละเอียดงาน'); }
                if (old.Mileage > 0 && eff('Mileage') === old.Mileage && eff('LastMileage') === old.LastMileage) {
                    data.Mileage = null;
                    data.LastMileage = null;
                    cleared.push('เลขไมล์/ระยะเช็ค');
                }
                changes.push(`ปลดใบจอง ${old.BookingNo} (ทะเบียนไม่ตรงกัน)${cleared.length ? ` ล้าง: ${cleared.join(', ')}` : ''}`);
                notices.push(`ปลดใบจอง ${old.BookingNo} ออกจากคิวนี้แล้ว (ทะเบียนใหม่ไม่ตรงกับใบจอง) ใบจองนี้กลับมาใช้เช็คอินได้${cleared.length ? ` และล้างข้อมูลที่มาจากใบจอง: ${cleared.join(', ')}` : ''}`);
            }
        }

        // 2) ค้นใบจองของทะเบียนใหม่
        const booking = canLink ? await findTodayBooking(queue.BranchID, plate, queue.QueueDate, ADMIN_BOOKING_STATUSES) : null;
        if (booking) {
            linked = true;
            data.BookingID = booking.BookingID;
            data.NeedsReview = false;
            if (!eff('CarModel') && booking.CarModel) { data.CarModel = booking.CarModel; filled.push('รุ่นรถ'); }
            if (!eff('VinNo') && booking.VinNo) { data.VinNo = booking.VinNo; filled.push('VIN'); }
            if (!eff('InventoryItemID') && booking.InventoryItemID) data.InventoryItemID = booking.InventoryItemID;
            if (!projectEdited && !eff('ProjectType') && booking.ProjectType) { data.ProjectType = booking.ProjectType; filled.push('โครงการ'); }
            if (!eff('RepairDetail')) {
                const detail = bookingRepairDetail(booking);
                if (detail) { data.RepairDetail = detail; filled.push('รายละเอียดงาน'); }
            }
            if (eff('Mileage') == null && booking.Mileage > 0 && !mileageEdited) {
                data.Mileage = booking.Mileage;
                if (eff('LastMileage') == null) data.LastMileage = booking.LastMileage;
                filled.push('เลขไมล์/ระยะเช็ค');
            }
            changes.push(`ผูกใบจอง ${booking.BookingNo}${filled.length ? ` (เติม: ${filled.join(', ')})` : ''}`);
            notices.push(`พบใบจอง ${booking.BookingNo} ของทะเบียนนี้ และผูกกับคิวแล้ว${filled.length ? ` (เติมข้อมูล: ${filled.join(', ')})` : ''}`);
        }

        // 3) ไม่มีใบจอง: ค้นข้อมูลรถจาก EV7 แล้วเติมช่องที่ยังว่าง (ถ้าคิวยังผูกใบจองอื่นอยู่ ข้ามขั้นนี้)
        if (!linked && canLink) {
            const { vehicle, failed } = await lookupVehicleDetailed(plate);
            if (vehicle) {
                if (!eff('CarModel') && vehicle.carModel) { data.CarModel = vehicle.carModel; filled.push('รุ่นรถ'); }
                if (!eff('VinNo') && vehicle.vinNo) { data.VinNo = vehicle.vinNo; filled.push('VIN'); }
                if (!eff('InventoryItemID') && vehicle.inventoryItemId) data.InventoryItemID = vehicle.inventoryItemId;
                // โครงการยังว่าง -> ใช้ค่าจาก EV7 (ไม่ทับถ้าแอดมินกำหนดเองในครั้งนี้)
                if (!projectEdited && !eff('ProjectType') && vehicle.projectType) { data.ProjectType = vehicle.projectType; filled.push('โครงการ'); }
                changes.push(`เติมข้อมูลรถจาก EV7${filled.length ? ` (${filled.join(', ')})` : ''}`);
                notices.push(`พบข้อมูลรถใน EV7${filled.length ? ` และเติมข้อมูลที่ยังว่าง: ${filled.join(', ')}` : ' (ข้อมูลในคิวครบอยู่แล้ว)'}`);
            } else if (failed) {
                notices.push('ค้นข้อมูลรถจาก EV7 ไม่สำเร็จ (ระบบขัดข้องชั่วคราว) กรุณาตรวจสอบข้อมูลเอง');
            } else {
                notices.push('ไม่พบใบจองหรือข้อมูลรถ EV7 ของทะเบียนนี้');
            }
        }
    }

    if (Object.keys(data).length === 0) return NextResponse.json({ success: true, data: queue });

    try {
        const updated = await prisma.$transaction(async (tx) => {
            const r = await tx.cM_Queue.updateMany({
                where: { QueueID: queue.QueueID, Version: queue.Version },
                data: { ...data, Version: { increment: 1 } },
            });
            if (r.count === 0) return null;
            if (changes.length > 0) {
                await tx.cM_QueueLog.create({
                    data: {
                        QueueID: queue.QueueID,
                        FromStatus: queue.Status,
                        ToStatus: queue.Status,
                        ActionBy: auth.user.id,
                        ActionByName: auth.user.name,
                        Note: `แก้ไขข้อมูล — ${changes.join(', ')}`.slice(0, 500),
                    },
                });
            }
            return tx.cM_Queue.findUnique({ where: { QueueID: queue.QueueID } });
        });
        if (!updated) return NextResponse.json({ success: false, error: 'ข้อมูลคิวถูกแก้ไขโดยผู้อื่นแล้ว กรุณารีเฟรชและลองใหม่' }, { status: 409 });
        publishQueueChange(queue.BranchID);
        return NextResponse.json({ success: true, data: updated, notices });
    } catch (e) {
        const msg = e instanceof Error ? e.message : '';
        if (msg.includes('ActiveBooking')) {
            return NextResponse.json({ success: false, error: 'ใบจองนี้ผูกกับคิวอื่นที่ยังไม่ปิดอยู่แล้ว' }, { status: 409 });
        }
        if ((e as { code?: string }).code === 'P2002' || msg.includes('UX_CM_Queue')) {
            return NextResponse.json({ success: false, error: 'ทะเบียนนี้มีคิวที่ยังไม่ปิดอยู่แล้ว' }, { status: 409 });
        }
        throw e;
    }
}
