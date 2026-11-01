// Rate limit แบบ in-memory (instance เดียว) สำหรับ public endpoints

const hits = new Map<string, { count: number; resetAt: number }>();

export function rateLimit(key: string, limit: number, windowMs: number): boolean {
    const now = Date.now();
    const entry = hits.get(key);
    if (!entry || entry.resetAt <= now) {
        hits.set(key, { count: 1, resetAt: now + windowMs });
        if (hits.size > 5000) {
            for (const [k, v] of hits) if (v.resetAt <= now) hits.delete(k);
        }
        return true;
    }
    entry.count += 1;
    return entry.count <= limit;
}

// หลัง nginx: X-Real-IP คือ $remote_addr ที่ nginx ตั้งเอง (client ปลอมไม่ได้) ส่วนสมาชิกแรกของ X-Forwarded-For
// client เป็นคนใส่ได้ จึงใช้สมาชิกสุดท้าย (ที่ nginx ต่อท้าย) เป็นตัวสำรอง กัน rate limit ถูกหลบด้วยการสุ่ม header
export function getClientIp(request: Request): string {
    const real = request.headers.get('x-real-ip')?.trim();
    if (real) return real;
    const fwd = request.headers.get('x-forwarded-for');
    const last = fwd?.split(',').map((p) => p.trim()).filter(Boolean).pop();
    return last || 'unknown';
}
