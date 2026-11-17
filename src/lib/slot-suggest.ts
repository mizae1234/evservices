// Engine แนะนำเวลาจอง (pure function, ไม่ต่อ DB, ไม่สุ่ม)
//
// หลักการ: เสนอเฉพาะเวลาที่ "ชิด" กับคิวเดิม (ต่อท้ายคิวก่อนหน้า / เปิดร้าน / หลังพักเที่ยง หรือจบพอดีคิวถัดไป)
// และไม่คาบเกี่ยวพักเที่ยง 12:00-13:00 (งานต้องจบก่อน 12:00 หรือเริ่มหลัง 13:00) เพื่อไม่ให้เกิดช่องว่างคั่น เช่น คิวเดิม 9:00-10:00 → เสนอ 10:00 ไม่ใช่ 10:30
// แล้วให้คะแนนช่องที่ลงล็อกที่สุด และคัดให้ครบ N ช่องแบบกระจายวัน

export const LUNCH_START = 12 * 60;
export const LUNCH_END = 13 * 60;
export const MIN_USABLE_GAP = 30; // ช่องว่างที่เหลือสั้นกว่านี้ถือว่าเสียเปล่า

export interface BusyBlock { start: number; end: number }
export interface BaySchedule { bayId: number; bayName: string; busy: BusyBlock[] }
export interface DaySchedule {
    date: string; // YYYY-MM-DD
    open: number; // นาทีนับจาก 00:00
    close: number;
    /** วันนี้: เวลาเริ่มจองได้เร็วสุด (นาที) */
    earliestStart?: number;
    bays: BaySchedule[];
}
export interface SlotOption {
    date: string;
    bayId: number;
    bayName: string;
    start: number;
    end: number;
    score: number;
    /** ช่องว่างที่เหลือรอบคิวนี้ (นาที) — 0 = ลงล็อกพอดี */
    leftoverBefore: number;
    leftoverAfter: number;
}

export function timeToMinutes(t: string): number {
    const [h, m] = t.split(':').map(Number);
    return h * 60 + m;
}
export function minutesToTime(m: number): string {
    return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

/** เวลาจบ = เริ่ม + ระยะเวลา (การจองออนไลน์ไม่ให้คาบเกี่ยวพักเที่ยง จึงไม่ต้องบวกเวลาพัก — ดู withLunch) */
export function computeEnd(start: number, duration: number): number {
    return start + duration;
}

/** ถือพักเที่ยงเป็นช่วงที่ถูกจองไว้ เพื่อไม่ให้การจองคร่อม 12:00–13:00 */
function withLunch(busy: BusyBlock[]): BusyBlock[] {
    return [...busy, { start: LUNCH_START, end: LUNCH_END }];
}

export function startsInLunch(start: number): boolean {
    return start >= LUNCH_START && start < LUNCH_END;
}

function lunchOverlap(a: number, b: number): number {
    return Math.max(0, Math.min(b, LUNCH_END) - Math.max(a, LUNCH_START));
}

function mergeBusy(busy: BusyBlock[]): BusyBlock[] {
    const sorted = [...busy].sort((x, y) => x.start - y.start);
    const out: BusyBlock[] = [];
    for (const b of sorted) {
        const last = out[out.length - 1];
        if (last && b.start <= last.end) last.end = Math.max(last.end, b.end);
        else out.push({ ...b });
    }
    return out;
}

/** ช่องว่าง (gap) ของ bay ภายในเวลาทำการ */
export function freeGaps(busy: BusyBlock[], open: number, close: number): BusyBlock[] {
    const gaps: BusyBlock[] = [];
    let cursor = open;
    for (const b of mergeBusy(busy)) {
        if (b.start > cursor) gaps.push({ start: cursor, end: Math.min(b.start, close) });
        cursor = Math.max(cursor, b.end);
    }
    if (cursor < close) gaps.push({ start: cursor, end: close });
    return gaps.filter((g) => g.end > g.start);
}

/** ตรวจว่าช่วงเวลานี้ว่างและถูกต้องใน bay นั้นหรือไม่ (ใช้ซ้ำฝั่ง server ตอนยืนยันจอง) */
export function isSlotFree(day: DaySchedule, bayId: number, start: number, duration: number): boolean {
    const bay = day.bays.find((b) => b.bayId === bayId);
    if (!bay || startsInLunch(start) || start < day.open) return false;
    if (day.earliestStart != null && start < day.earliestStart) return false;
    const end = computeEnd(start, duration);
    if (end > day.close) return false;
    return !withLunch(bay.busy).some((b) => start < b.end && b.start < end);
}

function candidatesInGap(gap: BusyBlock, duration: number): number[] {
    const out = new Set<number>();
    // ชิดต้น gap (ถ้าตกช่วงพักเที่ยงให้เลื่อนไป 13:00)
    let front = gap.start;
    if (startsInLunch(front)) front = LUNCH_END;
    if (front < gap.end && computeEnd(front, duration) <= gap.end) out.add(front);
    // ชิดท้าย gap: เริ่มช้าสุดที่ยังจบไม่เกินท้าย gap
    for (let s = gap.end - duration; s >= Math.max(gap.start, gap.end - duration - 60); s -= 5) {
        if (s >= gap.start && !startsInLunch(s) && computeEnd(s, duration) <= gap.end) {
            out.add(s);
            break;
        }
    }
    return [...out];
}

export interface SuggestOptions {
    days: DaySchedule[];
    duration: number; // นาที (ไม่รวมพักเที่ยง)
    count?: number;
    maxPerDay?: number;
}

export function suggestSlots({ days, duration, count = 5, maxPerDay = 2 }: SuggestOptions): SlotOption[] {
    const all: SlotOption[] = [];
    days.forEach((day, dayIndex) => {
        day.bays.forEach((bay) => {
            const hasBookings = bay.busy.length > 0;
            for (const gap of freeGaps(withLunch(bay.busy), day.open, day.close)) {
                for (const start of candidatesInGap(gap, duration)) {
                    if (day.earliestStart != null && start < day.earliestStart) continue;
                    const end = computeEnd(start, duration);
                    // เวลาที่ตกในพักเที่ยงไม่นับเป็นช่องว่างเสียเปล่า
                    const leftoverBefore = Math.max(0, start - gap.start - lunchOverlap(gap.start, start));
                    const leftoverAfter = Math.max(0, gap.end - end - lunchOverlap(end, gap.end));
                    const wasted = [leftoverBefore, leftoverAfter]
                        .filter((l) => l > 0 && l < MIN_USABLE_GAP)
                        .reduce((a, b) => a + b, 0);
                    // น้อย = ดี: เศษเสียเปล่า >> ช่องว่างคั่นด้านหน้า (ไม่ชิดคิวก่อนหน้า) >> bay ที่ยังว่างทั้งวัน >> วันที่ไกล >> เวลาที่ช้า
                    const score =
                        wasted * 10 +
                        (leftoverBefore > 0 && hasBookings ? 40 : 0) +
                        (hasBookings ? 0 : 60) +
                        dayIndex * 30 +
                        start * 0.05;
                    all.push({ date: day.date, bayId: bay.bayId, bayName: bay.bayName, start, end, score, leftoverBefore, leftoverAfter });
                }
            }
        });
    });

    // dedupe เวลาเริ่มเดียวกัน (หลาย bay) เก็บ bay ที่คะแนนดีสุด; tie-break ด้วย bayId เพื่อให้ผลคงที่
    all.sort((a, b) => a.score - b.score || a.date.localeCompare(b.date) || a.start - b.start || a.bayId - b.bayId);
    const seen = new Set<string>();
    const unique = all.filter((o) => {
        const k = `${o.date}|${o.start}`;
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
    });

    const picked: SlotOption[] = [];
    const perDay = new Map<string, number>();
    const take = (o: SlotOption) => {
        picked.push(o);
        perDay.set(o.date, (perDay.get(o.date) ?? 0) + 1);
    };
    // รอบ 1: ช่องที่ดีสุดของแต่ละวัน (กระจายวัน) รอบ 2: เติมด้วยคะแนนดีสุดจำกัดต่อวัน
    for (const o of unique) {
        if (picked.length >= count) break;
        if (!perDay.has(o.date)) take(o);
    }
    for (const o of unique) {
        if (picked.length >= count) break;
        if (!picked.includes(o) && (perDay.get(o.date) ?? 0) < maxPerDay) take(o);
    }
    return picked.sort((a, b) => a.date.localeCompare(b.date) || a.start - b.start);
}
