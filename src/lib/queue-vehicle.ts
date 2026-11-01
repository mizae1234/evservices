// Vehicle lookup ฝั่ง server สำหรับ public check-in + ฟังก์ชัน mask ข้อมูลส่วนบุคคล

export interface VehicleInfo {
    vinNo: string | null;
    carModel: string | null;
    inventoryItemId: number | null;
    projectType: string | null;
    customerName: string | null;
}

// ค้นรถ Leasing จาก EV7 API; ล้มเหลว/ไม่พบ = null (ไม่ throw)
export async function lookupVehicle(plate: string): Promise<VehicleInfo | null> {
    const url = process.env.EV7_API_URL;
    if (!url) return null;
    try {
        const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.EV7_API_TOKEN || ''}` },
            body: JSON.stringify({ RegisterNo: plate }),
            signal: AbortSignal.timeout(5000),
        });
        if (!res.ok) return null;
        const json = await res.json();
        if (json.Status === 1 && json.Data) {
            return {
                vinNo: json.Data.VinNo ?? null,
                carModel: json.Data.Model ?? null,
                inventoryItemId: json.Data.InventoryItemID ?? null,
                projectType: json.Data.ProjectType ?? null,
                customerName: json.Data.CustomerName ?? null,
            };
        }
    } catch {
        // เรียก API ไม่ได้ -> ถือว่าไม่พบ
    }
    return null;
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
