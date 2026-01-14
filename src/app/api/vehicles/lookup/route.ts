// Mock API for Vehicle Lookup
// GET /api/vehicles/lookup?q=ทะเบียน
// จะแก้เป็น endpoint จริงในภายหลัง

import { NextRequest, NextResponse } from 'next/server';

interface VehicleData {
    InventoryItemID: number;
    VinNo: string;
    RegisterNo: string;
    ProjectType: string;
    Model: string;
    CustomerName: string;
}

// Mock data สำหรับทดสอบ
const mockVehicles: VehicleData[] = [
    {
        InventoryItemID: 1001,
        VinNo: 'LSJA24B32PB001234',
        RegisterNo: 'กข1234',
        ProjectType: 'Owner',
        Model: 'AION Y Plus',
        CustomerName: 'คุณสมชาย ใจดี',
    },
    {
        InventoryItemID: 1002,
        VinNo: 'LSJA24B32PB005678',
        RegisterNo: 'กข5678',
        ProjectType: 'Rental',
        Model: 'AION S',
        CustomerName: 'บริษัท ขนส่งไทย จำกัด',
    },
    {
        InventoryItemID: 1003,
        VinNo: 'LSJA24B32PB009999',
        RegisterNo: 'กค9999',
        ProjectType: 'Owner',
        Model: 'AION Y Plus',
        CustomerName: 'คุณสมหญิง รักดี',
    },
    {
        InventoryItemID: 1004,
        VinNo: 'LSJA24B32PB001111',
        RegisterNo: 'ขก1111',
        ProjectType: 'Fleet',
        Model: 'AION S Plus',
        CustomerName: 'บริษัท แท็กซี่ไฟฟ้า จำกัด',
    },
    {
        InventoryItemID: 1005,
        VinNo: 'LSJA24B32PB002222',
        RegisterNo: 'ขก2222',
        ProjectType: 'Rental',
        Model: 'AION Y',
        CustomerName: 'คุณประสิทธิ์ มั่นคง',
    },
    {
        InventoryItemID: 1006,
        VinNo: 'LSJA24B32PB003333',
        RegisterNo: 'ขข3333',
        ProjectType: 'Owner',
        Model: 'AION ES',
        CustomerName: 'คุณวิภา สุขใจ',
    },
    {
        InventoryItemID: 1007,
        VinNo: 'LSJA24B32PB004444',
        RegisterNo: 'คก4444',
        ProjectType: 'Fleet',
        Model: 'AION Y Plus',
        CustomerName: 'บริษัท อีวีลอจิสติกส์ จำกัด',
    },
    {
        InventoryItemID: 1008,
        VinNo: 'LSJA24B32PB005555',
        RegisterNo: 'คค5555',
        ProjectType: 'Owner',
        Model: 'AION S',
        CustomerName: 'คุณนภา แสงจันทร์',
    },
];

export async function GET(request: NextRequest) {
    try {
        const searchParams = request.nextUrl.searchParams;
        const query = searchParams.get('q') || '';

        // ค้นหาเฉพาะเมื่อมีคำค้นหามากกว่า 3 ตัวอักษร
        if (query.length < 4) {
            return NextResponse.json({
                success: true,
                data: [],
                message: 'กรุณากรอกทะเบียนอย่างน้อย 4 ตัวอักษร',
            });
        }

        // ค้นหา mock data
        const results = mockVehicles.filter((v) =>
            v.RegisterNo.toLowerCase().includes(query.toLowerCase())
        );

        return NextResponse.json({
            success: true,
            data: results,
        });
    } catch (error) {
        console.error('Error in vehicle lookup:', error);
        return NextResponse.json(
            { success: false, error: 'Failed to lookup vehicle' },
            { status: 500 }
        );
    }
}
