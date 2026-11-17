// ตรวจรูปแบบทะเบียนที่ลูกค้าพิมพ์ และแจ้งเตือนเมื่อพบสิ่งผิดปกติ (ไม่แปลงค่าให้เอง — ให้ลูกค้าตรวจและพิมพ์ใหม่)
// ใช้ได้ทั้ง client และ server

const THAI_CONSONANT = '\\u0E01-\\u0E2E';
const THAI_ANY = '\\u0E01-\\u0E4E';

export function getPlateWarnings(input: string): string[] {
    const raw = input ?? '';
    if (!raw.trim()) return [];
    const warnings: string[] = [];

    if (/[๐-๙]/.test(raw)) {
        warnings.push('พบเลขไทย กรุณาพิมพ์เป็นเลขอารบิก (0-9)');
    }
    if (/[！-～　​-‍⁠﻿]/.test(raw)) {
        warnings.push('พบตัวอักษรที่ผิดปกติ (ตัวเลข/ตัวอักษรแบบเต็มความกว้าง หรืออักขระที่มองไม่เห็น) กรุณาพิมพ์ใหม่');
    }

    // ตรวจส่วนที่เหลือบนข้อความที่ตัดช่องว่าง/ขีด/จุด และอักขระที่แจ้งไปแล้วออก
    const cleaned = raw.replace(/[\s\-‐-―.！-～　​-‍⁠﻿]/g, '');
    if (/[A-Za-z]/.test(cleaned) && new RegExp(`[${THAI_CONSONANT}]`).test(cleaned)) {
        warnings.push('พบตัวอักษรภาษาอังกฤษปนกับภาษาไทย กรุณาตรวจสอบแป้นพิมพ์');
    }
    if (/[^\p{L}\p{N}\p{M}]/u.test(cleaned)) {
        warnings.push('พบสัญลักษณ์ที่ไม่ใช่เลขทะเบียน กรุณาพิมพ์เฉพาะตัวอักษรและตัวเลข');
    }
    if (new RegExp(`\\d[${THAI_ANY}]{2,}$`).test(cleaned)) {
        warnings.push('พบข้อความต่อท้ายเลขทะเบียน (เช่น ชื่อจังหวัด) กรุณาพิมพ์เฉพาะเลขทะเบียน เช่น กข 1234');
    }
    return warnings;
}
