// Pure-logic tests ของ engine แนะนำเวลา + กฎเลขไมล์ (ไม่ต่อ DB)
// รัน: npx ts-node --compiler-options '{"module":"commonjs"}' scripts/test-slot-suggest.ts

import assert from 'node:assert/strict';
import { computeEnd, DaySchedule, isSlotFree, suggestSlots, timeToMinutes as t } from '../src/lib/slot-suggest';
import { computeMileageWindow } from '../src/lib/mileage-rule';

const day = (date: string, busy: [string, string][], extra: Partial<DaySchedule> = {}): DaySchedule => ({
    date, open: t('08:30'), close: t('17:30'),
    bays: [{ bayId: 1, bayName: 'Bay 1', busy: busy.map(([s, e]) => ({ start: t(s), end: t(e) })) }],
    ...extra,
});

// 1) ไม่มีช่องว่างคั่น: คิวเดิม 9:00-10:00 → ต้องเสนอ 10:00 (ต่อท้าย) ไม่ใช่ 10:30
{
    const out = suggestSlots({ days: [day('2026-11-17', [['09:00', '10:00']])], duration: 60, count: 5 });
    const starts = out.map((o) => o.start);
    assert.ok(starts.includes(t('10:00')), 'ต้องมี 10:00');
    assert.ok(!starts.includes(t('10:30')), 'ห้ามมี 10:30');
}

// 2) ทุกตัวเลือกต้อง "ชิด": ด้านหน้าหรือด้านหลังไม่มีเศษ 1-29 นาที
{
    const out = suggestSlots({ days: [day('2026-11-17', [['09:00', '10:00'], ['14:00', '15:00']])], duration: 90, count: 5 });
    for (const o of out) {
        for (const l of [o.leftoverBefore, o.leftoverAfter]) assert.ok(l === 0 || l >= 30, `เศษเสียเปล่า ${l}`);
    }
}

// 3) พักเที่ยง: ห้ามคาบเกี่ยว 12:00-13:00 (ต้องจบก่อน 12:00 หรือเริ่มหลัง 13:00)
{
    assert.equal(computeEnd(t('10:00'), 180), t('13:00'));
    const out = suggestSlots({ days: [day('2026-11-17', [])], duration: 180, count: 20, maxPerDay: 20 });
    assert.ok(out.length > 0);
    assert.ok(out.every((o) => o.end <= t('12:00') || o.start >= t('13:00')), 'ห้ามคร่อมพักเที่ยง');
    const d = day('2026-11-17', [['09:00', '10:00']]);
    assert.equal(isSlotFree(d, 1, t('10:00'), 180), false); // 10:00-13:00 คร่อมพัก
    assert.equal(isSlotFree(d, 1, t('10:00'), 120), true); // 10:00-12:00 ได้
    assert.equal(isSlotFree(d, 1, t('13:00'), 180), true);
    const out2 = suggestSlots({ days: [day('2026-11-17', [['08:30', '12:00']])], duration: 60 });
    assert.equal(out2[0].start, t('13:00'));
}

// 4) deterministic + ไม่เกิน count + กระจายวัน
{
    const days = ['2026-11-17', '2026-11-18', '2026-11-19'].map((d) => day(d, [['09:00', '10:00']]));
    const a = suggestSlots({ days, duration: 60 });
    const b = suggestSlots({ days, duration: 60 });
    assert.deepEqual(a, b);
    assert.equal(a.length, 5);
    assert.equal(new Set(a.map((o) => o.date)).size, 3);
}

// 5) bay ที่มีคิวอยู่แล้วถูกเลือกก่อน bay ว่าง (pack ให้แน่น)
{
    const d: DaySchedule = {
        date: '2026-11-17', open: t('08:30'), close: t('17:30'),
        bays: [
            { bayId: 1, bayName: 'Bay 1', busy: [] },
            { bayId: 2, bayName: 'Bay 2', busy: [{ start: t('08:30'), end: t('10:00') }] },
        ],
    };
    const out = suggestSlots({ days: [d], duration: 60, count: 1 });
    assert.equal(out[0].bayId, 2);
    assert.equal(out[0].start, t('10:00'));
}

// 6) วันนี้: ไม่เสนอเวลาที่ผ่านไปแล้ว; ไม่มี slot → ว่าง
{
    const out = suggestSlots({ days: [day('2026-11-17', [], { earliestStart: t('15:00') })], duration: 60 });
    assert.ok(out.every((o) => o.start >= t('15:00')));
    assert.equal(suggestSlots({ days: [day('2026-11-17', [['08:30', '17:30']])], duration: 60 }).length, 0);
}

// 7) isSlotFree
{
    const d = day('2026-11-17', [['09:00', '10:00']]);
    assert.equal(isSlotFree(d, 1, t('10:00'), 60), true);
    assert.equal(isSlotFree(d, 1, t('09:30'), 60), false);
    assert.equal(isSlotFree(d, 1, t('12:30'), 60), false);
    assert.equal(isSlotFree(d, 1, t('16:30'), 120), false);
}

// 8) กฎเลขไมล์: 9,800 กม. เกณฑ์ 10,000 → จองได้วันนี้เท่านั้น; 9,000 → 2 วัน; ถึงเกณฑ์แล้ว → exceeded
{
    const a = computeMileageWindow(9800, 10000);
    assert.equal(a.maxDays, 0);
    assert.equal(a.urgent, true);
    assert.equal(computeMileageWindow(9000, 10000).maxDays, 2);
    assert.equal(computeMileageWindow(10000, 10000).exceeded, true);
    assert.equal(computeMileageWindow(0, 100000).maxDays, 30);
}

console.log('slot-suggest tests passed');
