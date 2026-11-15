// Admin: รายละเอียดคิว + ประวัติ, บันทึกรายละเอียดงานซ่อม

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getQueueUser } from '@/lib/queue-auth';
import { publishQueueChange } from '@/lib/queue-events';
import { normalizePlate } from '@/lib/queue-service';
import type { Prisma } from '@prisma/client';

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
        const v = normalizePlate(String(body.carRegister ?? ''));
        if (v.length < 2 || v.length > 20) return bad('กรุณากรอกทะเบียนรถให้ถูกต้อง');
        if (v !== queue.CarRegister) { data.CarRegister = v; changes.push(`ทะเบียน: ${queue.CarRegister} → ${v}`); }
    }
    if ('carModel' in body) {
        const v = str(body.carModel) ?? '';
        if (v.length > 100) return bad('รุ่นรถยาวเกินไป');
        if ((v || null) !== queue.CarModel) { data.CarModel = v || null; changes.push('รุ่นรถ'); }
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
        return NextResponse.json({ success: true, data: updated });
    } catch (e) {
        const msg = e instanceof Error ? e.message : '';
        if ((e as { code?: string }).code === 'P2002' || msg.includes('UX_CM_Queue')) {
            return NextResponse.json({ success: false, error: 'ทะเบียนนี้มีคิวที่ยังไม่ปิดอยู่แล้ว' }, { status: 409 });
        }
        throw e;
    }
}
