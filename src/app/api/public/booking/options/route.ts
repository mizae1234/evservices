// Public: ข้อมูลตัวเลือกสำหรับหน้าจองคิวของลูกค้า (เฉพาะสาขาที่เปิดให้จองออนไลน์)

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getClientIp, rateLimit } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
    if (!rateLimit(`pbook-options:${getClientIp(request)}`, 60, 60_000)) {
        return NextResponse.json({ success: false, error: 'คำขอมากเกินไป กรุณาลองใหม่ภายหลัง' }, { status: 429 });
    }
    try {
        const [branches, serviceTypes, rates] = await Promise.all([
            prisma.cM_MsServiceBranch.findMany({
                where: { IsActive: true, AllowOnlineBooking: true },
                orderBy: { BranchName: 'asc' },
                select: { BranchID: true, BranchName: true, Address: true, Phone: true, OpenTime: true, CloseTime: true },
            }),
            prisma.cM_ServiceType.findMany({
                where: { IsActive: true },
                orderBy: { SortOrder: 'asc' },
                select: { ServiceTypeID: true, Code: true, Name: true, RequiresMileage: true },
            }),
            prisma.cM_FlatRate.findMany({
                where: { IsActive: true, MileageID: { not: null }, CarModelID: null },
                select: { ServiceTypeID: true, DurationMinutes: true, Mileage: { select: { MileageID: true, Value: true, Label: true } } },
            }),
        ]);

        // ระยะเช็คต่อประเภทบริการ (รุ่นกลาง) — ใช้แสดงตัวเลือก; ระยะเวลาจริงคิดฝั่ง server ตามรุ่นรถอีกครั้ง
        const mileageOptions: Record<number, { mileageId: number; value: number; label: string; duration: number }[]> = {};
        for (const r of rates) {
            if (!r.Mileage) continue;
            (mileageOptions[r.ServiceTypeID] ??= []).push({ mileageId: r.Mileage.MileageID, value: r.Mileage.Value, label: r.Mileage.Label, duration: r.DurationMinutes });
        }
        for (const k of Object.keys(mileageOptions)) mileageOptions[Number(k)].sort((a, b) => a.value - b.value);

        return NextResponse.json({ success: true, data: { branches, serviceTypes, mileageOptions } });
    } catch (error) {
        console.error('Public booking options error:', error);
        return NextResponse.json({ success: false, error: 'ไม่สามารถโหลดข้อมูลได้' }, { status: 500 });
    }
}
