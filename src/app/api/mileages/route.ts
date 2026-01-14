// API Route for Mileage Options
// GET /api/mileages - Get all mileage options

import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export async function GET() {
    try {
        const mileages = await prisma.cM_MsMileage.findMany({
            where: { IsActive: true },
            orderBy: { SortOrder: 'asc' },
            select: {
                MileageID: true,
                Value: true,
                Label: true,
            },
        });

        // รวม "อื่นๆ" เป็น option สุดท้ายเสมอ
        const options = mileages.map((m) => ({
            value: m.Value.toString(),
            label: m.Label,
        }));

        // เพิ่ม "อื่นๆ" สำหรับกรณีที่ต้องการกรอกเอง
        options.push({ value: 'other', label: 'อื่นๆ' });

        return NextResponse.json({
            success: true,
            data: options,
            // ส่ง raw values ไปด้วยสำหรับ validation
            values: mileages.map((m) => m.Value),
        });
    } catch (error) {
        console.error('Error fetching mileages:', error);
        return NextResponse.json(
            { success: false, error: 'Failed to fetch mileage options' },
            { status: 500 }
        );
    }
}
