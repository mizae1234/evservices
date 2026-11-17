// Vehicle lookup ฝั่ง server สำหรับ public check-in + ฟังก์ชัน mask ข้อมูลส่วนบุคคล

export interface VehicleInfo {
    vinNo: string | null;
    carModel: string | null;
    inventoryItemId: number | null;
    projectType: string | null;
    customerName: string | null;
}

export interface VehicleLookupResult {
    vehicle: VehicleInfo | null;
    /** true = เรียก EV7 ไม่สำเร็จ (ไม่ได้ตั้งค่า/ล่ม/ช้าเกิน/ตอบผิดรูปแบบ) ต่างจาก "ค้นแล้วไม่พบ" */
    failed: boolean;
}

// ค้นรถ Leasing จาก EV7 API; แยกผล "ไม่พบ" ออกจาก "เรียกไม่สำเร็จ" (ไม่ throw)
export async function lookupVehicleDetailed(plate: string): Promise<VehicleLookupResult> {
    const url = process.env.EV7_API_URL;
    if (!url) {
        console.error('EV7 lookup skipped: EV7_API_URL is not configured');
        return { vehicle: null, failed: true };
    }
    try {
        const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.EV7_API_TOKEN || ''}` },
            body: JSON.stringify({ RegisterNo: plate }),
            signal: AbortSignal.timeout(5000),
        });
        if (!res.ok) {
            console.error('EV7 lookup failed:', res.status);
            return { vehicle: null, failed: true };
        }
        const json = await res.json();
        if (json.Status === 1 && json.Data) {
            return {
                vehicle: {
                    vinNo: json.Data.VinNo ?? null,
                    carModel: json.Data.Model ?? null,
                    inventoryItemId: json.Data.InventoryItemID ?? null,
                    projectType: json.Data.ProjectType ?? null,
                    customerName: json.Data.CustomerName ?? null,
                },
                failed: false,
            };
        }
        return { vehicle: null, failed: false };
    } catch (error) {
        console.error('EV7 lookup error:', error instanceof Error ? error.message : error);
        return { vehicle: null, failed: true };
    }
}

// ค้นรถ Leasing จาก EV7 API; ล้มเหลว/ไม่พบ = null (ไม่ throw)
export async function lookupVehicle(plate: string): Promise<VehicleInfo | null> {
    return (await lookupVehicleDetailed(plate)).vehicle;
}

/** แสดงชื่อจริงเต็ม ส่วนนามสกุลแทนด้วย *** (เช่น "วิภา รักษ์โลก" -> "วิภา ***") */
export function maskName(name: string | null | undefined): string {
    const parts = (name ?? '').trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return '';
    return parts.length === 1 ? parts[0] : `${parts[0]} ***`;
}

export function maskPhone(phone: string | null | undefined): string {
    const p = (phone ?? '').replace(/\D/g, '');
    return p.length >= 4 ? `•••-•••-${p.slice(-4)}` : '';
}
