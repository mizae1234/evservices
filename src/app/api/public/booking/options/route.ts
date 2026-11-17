// Public: ข้อมูลตัวเลือกสำหรับหน้าจองคิวของลูกค้า (เฉพาะสาขาที่เปิดให้จองออนไลน์)

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getClientIp, rateLimit } from '@/lib/rate-limit';
import { matchCarModelIds } from '@/lib/queue-mileage';

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
            // ระยะเช็คทุกเรท (ทุกรุ่น) แล้วคัดตามรุ่นรถของลูกค้าด้านล่าง
            prisma.cM_FlatRate.findMany({
                where: { IsActive: true, MileageID: { not: null } },
                select: { ServiceTypeID: true, DurationMinutes: true, CarModelID: true, Mileage: { select: { MileageID: true, Value: true, Label: true } } },
            }),
        ]);

        // ระยะเช็คต่อประเภทบริการ แบบเดียวกับหน้าเช็คอิน: มีเรทของรุ่นรถนั้น → ใช้ของรุ่นนั้น, ไม่มี → ใช้เรทรุ่นกลาง (ไม่ระบุรุ่น),
        // ไม่รู้รุ่น/ไม่มีทั้งสองแบบ → แสดงทุกระยะ (ระยะเวลาจริงคิดฝั่ง server ตามรุ่นรถอีกครั้ง)
        const carModel = request.nextUrl.searchParams.get('carModel');
        const modelIds = new Set(await matchCarModelIds(carModel));
        const mileageOptions: Record<number, { mileageId: number; value: number; label: string; duration: number }[]> = {};
        const byService = new Map<number, typeof rates>();
        for (const r of rates) if (r.Mileage) byService.set(r.ServiceTypeID, [...(byService.get(r.ServiceTypeID) ?? []), r]);
        for (const [serviceTypeId, list] of byService) {
            const own = modelIds.size ? list.filter((r) => r.CarModelID != null && modelIds.has(r.CarModelID)) : [];
            const generic = list.filter((r) => r.CarModelID == null);
            const chosen = own.length ? own : generic.length ? generic : list;
            const seen = new Set<number>();
            mileageOptions[serviceTypeId] = chosen
                .filter((r) => !seen.has(r.Mileage!.MileageID) && !!seen.add(r.Mileage!.MileageID))
                .map((r) => ({ mileageId: r.Mileage!.MileageID, value: r.Mileage!.Value, label: r.Mileage!.Label, duration: r.DurationMinutes }))
                .sort((x, y) => x.value - y.value);
        }

        return NextResponse.json({ success: true, data: { branches, serviceTypes, mileageOptions } });
    } catch (error) {
        console.error('Public booking options error:', error);
        return NextResponse.json({ success: false, error: 'ไม่สามารถโหลดข้อมูลได้' }, { status: 500 });
    }
}
