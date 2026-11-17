// ระยะเช็คสำหรับ check-in: จับคู่รุ่นรถ -> ตัวเลือกระยะเช็คของรุ่นนั้น (ไม่รู้รุ่น/จับคู่ไม่ได้ = แสดงทุกระยะ)

import { prisma } from '@/lib/prisma';

export interface MileageOption { mileageId: number; value: number; label: string }
export type MileageOptionsByService = Record<number, MileageOption[]>;

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim();
const stripParen = (s: string) => s.replace(/\s*\([^)]*\)\s*/g, ' ');

/**
 * หา ModelID จากชื่อรุ่นที่ได้มาจากใบจอง/EV7 API
 * 1) ตรงชื่อเต็ม (ไม่สนตัวพิมพ์/ช่องว่าง) หรือ "ยี่ห้อ ชื่อรุ่น"
 * 2) ไม่เจอ: ตรงชื่อรุ่นเมื่อตัดวงเล็บท้ายชื่อ เช่น "ES" -> ES (Retail), ES (Taxi) (รวมทุกรุ่นที่เข้าเงื่อนไข)
 * ไม่เจอเลย -> [] (ผู้เรียกใช้ทุกระยะแทน)
 */
export async function matchCarModelIds(model: string | null | undefined): Promise<number[]> {
    const m = norm(model ?? '');
    if (!m) return [];
    const models = await prisma.cM_MsCarModel.findMany({ where: { IsActive: true }, select: { ModelID: true, ModelName: true, Brand: true } });
    const names = (x: { ModelName: string; Brand: string | null }, f: (s: string) => string) => [f(x.ModelName), f(`${x.Brand ?? ''} ${x.ModelName}`)].map(norm);
    const exact = models.filter((x) => names(x, (s) => s).includes(m));
    if (exact.length) return exact.map((x) => x.ModelID);
    return models.filter((x) => names(x, stripParen).includes(m)).map((x) => x.ModelID);
}

/** ตัวเลือกระยะเช็คต่อประเภทบริการที่ต้องใช้เลขไมล์; ใส่ modelIds เพื่อจำกัดเฉพาะรุ่นนั้น (ถ้าไม่มีเรทของรุ่น -> ไม่ส่งบริการนั้นกลับ) */
export async function getMileageOptions(opts?: { serviceTypeIds?: number[]; modelIds?: number[] }): Promise<MileageOptionsByService> {
    const serviceTypeIds = opts?.serviceTypeIds
        ?? (await prisma.cM_ServiceType.findMany({ where: { IsActive: true, RequiresMileage: true }, select: { ServiceTypeID: true } })).map((s) => s.ServiceTypeID);
    const modelIds = opts?.modelIds?.length ? opts.modelIds : null;
    const rates = await prisma.cM_FlatRate.findMany({
        where: {
            IsActive: true,
            MileageID: { not: null },
            ServiceTypeID: { in: serviceTypeIds },
            ...(modelIds ? { CarModelID: { in: modelIds } } : {}),
        },
        select: { ServiceTypeID: true, Mileage: { select: { MileageID: true, Value: true, Label: true } } },
    });
    const out: MileageOptionsByService = {};
    for (const r of rates) {
        if (!r.Mileage) continue;
        const list = (out[r.ServiceTypeID] ??= []);
        if (list.some((x) => x.mileageId === r.Mileage!.MileageID)) continue;
        list.push({ mileageId: r.Mileage.MileageID, value: r.Mileage.Value, label: r.Mileage.Label });
    }
    for (const k of Object.keys(out)) out[Number(k)].sort((a, b) => a.value - b.value);
    return out;
}
