// Vehicle Lookup API
// GET /api/vehicles/lookup?q=ทะเบียน
// Calls EV7 Tracking API to get car info

import { NextRequest, NextResponse } from 'next/server';

interface VehicleData {
    InventoryItemID: number;
    VinNo: string;
    RegisterNo: string;
    ProjectType: string;
    Model: string;
    ModelCode?: string;
    CustomerName: string;
}

interface EV7ApiResponse {
    Data: VehicleData | null;
    Status: number;
    Url: string | null;
    Message: string;
    ErrorMsg: string | null;
}

const EV7_API_URL = 'https://ev7tracking.icareprojects.com/api/EVSeven/GetCarInfo';
const EV7_API_TOKEN = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJuYW1laWQiOiIzNSIsInVuaXF1ZV9uYW1lIjoi4LiE4Li44LiTR0kgVXNlciIsImVtYWlsIjoiZ2lAdGVzdC5jb20iLCJmaXJzdE5hbWUiOiJHSSIsImxhc3ROYW1lIjoiVXNlciIsImZ1bGxOYW1lIjoi4LiE4Li44LiTR0kgVXNlciIsImlzQWRtaW4iOiJGYWxzZSIsImlzQWN0aXZlIjoiVHJ1ZSIsImp0aSI6IjY4YWMyMmRlLWQ3OWItNDFlNy1hMDkyLTc5ZmIxYTBlNDgwYyIsImlhdCI6MTc2ODM5OTY0Miwicm9sZSI6IlVzZXIiLCJuYmYiOjE3NjgzOTk2NDIsImV4cCI6MTc3MDk5MTY0MiwiaXNzIjoiRVY3WElDQVJFIiwiYXVkIjoiSUNBUkUifQ.3fWNvXW1Zah5b9V47-M_5In9zwsvHOYIOGkebSKKZWg';

export async function GET(request: NextRequest) {
    try {
        const searchParams = request.nextUrl.searchParams;
        const query = searchParams.get('q') || '';

        // ค้นหาเฉพาะเมื่อมีคำค้นหามากกว่า 1 ตัวอักษร
        if (query.length < 2) {
            return NextResponse.json({
                success: true,
                data: [],
                message: 'กรุณากรอกทะเบียนอย่างน้อย 2 ตัวอักษร',
            });
        }

        // Call EV7 Tracking API
        const response = await fetch(EV7_API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${EV7_API_TOKEN}`,
            },
            body: JSON.stringify({ RegisterNo: query }),
        });

        if (!response.ok) {
            console.error('EV7 API error:', response.status, response.statusText);
            return NextResponse.json(
                { success: false, error: 'Failed to connect to EV7 API' },
                { status: 502 }
            );
        }

        const apiResponse: EV7ApiResponse = await response.json();

        // Check if the API found a vehicle
        if (apiResponse.Status === 1 && apiResponse.Data) {
            const vehicle = apiResponse.Data;
            return NextResponse.json({
                success: true,
                data: [{
                    InventoryItemID: vehicle.InventoryItemID,
                    VinNo: vehicle.VinNo,
                    RegisterNo: vehicle.RegisterNo,
                    ProjectType: vehicle.ProjectType,
                    Model: vehicle.Model,
                    CustomerName: vehicle.CustomerName,
                }],
            });
        }

        // No vehicle found
        return NextResponse.json({
            success: true,
            data: [],
            message: apiResponse.Message || 'ไม่พบข้อมูลรถ',
        });

    } catch (error) {
        console.error('Error in vehicle lookup:', error);
        return NextResponse.json(
            { success: false, error: 'Failed to lookup vehicle' },
            { status: 500 }
        );
    }
}
