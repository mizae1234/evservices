// กฎเลขไมล์สำหรับลูกค้าจองเอง: คำนวณว่า "จองได้ไกลสุดกี่วัน" ก่อนรถจะวิ่งเกินเกณฑ์เช็คระยะ
// ใช้ค่าเฉลี่ยเดียวกับ MileageWarning (400 กม./วัน)

export const AVG_DAILY_KM = 400;
export const MAX_BOOKING_HORIZON_DAYS = 30;

export interface MileageWindow {
    /** เลขไมล์ปัจจุบันถึง/เกินเกณฑ์แล้ว — เลือกเกณฑ์นี้ไม่ได้ */
    exceeded: boolean;
    /** จำนวนวันสูงสุดนับจากวันนี้ที่ยังจองได้ (0 = ต้องเป็นวันนี้) */
    maxDays: number;
    /** เหลือไมล์ก่อนถึงเกณฑ์ */
    remainingKm: number;
    /** ต้องรีบ (จองได้ภายใน 3 วัน) */
    urgent: boolean;
}

export function computeMileageWindow(currentMileage: number, targetMileage: number): MileageWindow {
    const remainingKm = targetMileage - currentMileage;
    if (remainingKm <= 0) return { exceeded: true, maxDays: 0, remainingKm: 0, urgent: true };
    const maxDays = Math.min(MAX_BOOKING_HORIZON_DAYS, Math.floor(remainingKm / AVG_DAILY_KM));
    return { exceeded: false, maxDays, remainingKm, urgent: maxDays <= 3 };
}

/** YYYY-MM-DD + n วัน (คำนวณแบบ UTC ไม่ผูกกับ timezone เครื่อง) */
export function addDaysToDateString(ymd: string, days: number): string {
    const [y, m, d] = ymd.split('-').map(Number);
    return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}
