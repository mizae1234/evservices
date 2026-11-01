// งานบำรุงรักษาคิว: ยกเลิกคิวที่ค้างข้ามวันอัตโนมัติ (ทุกเที่ยงคืนเวลา Bangkok)

import { prisma } from '@/lib/prisma';
import { publishQueueChange } from '@/lib/queue-events';
import { getTodayQueueDate } from '@/lib/queue-service';
import { ACTIVE_STATUSES } from '@/lib/queue-status';

const DAY_MS = 24 * 60 * 60 * 1000;
const BANGKOK_OFFSET_MS = 7 * 60 * 60 * 1000;

/** ยกเลิกคิวที่ยังไม่ปิด (ทุกสถานะที่ยัง active) ของวันก่อนหน้า พร้อมบันทึกประวัติ */
export async function cancelStaleQueues(): Promise<number> {
    const today = getTodayQueueDate();
    const stale = await prisma.cM_Queue.findMany({
        where: { QueueDate: { lt: today }, Status: { in: ACTIVE_STATUSES } },
        select: { QueueID: true, BranchID: true, Status: true },
    });
    let cancelled = 0;
    const branches = new Set<number>();
    for (const q of stale) {
        // อัปเดตเฉพาะเมื่อสถานะยังเหมือนเดิม กันชนกับพนักงานที่เพิ่งเปลี่ยนสถานะ
        const res = await prisma.cM_Queue.updateMany({
            where: { QueueID: q.QueueID, Status: q.Status },
            data: { Status: 'CANCELLED', Version: { increment: 1 } },
        });
        if (res.count === 0) continue;
        await prisma.cM_QueueLog.create({
            data: { QueueID: q.QueueID, FromStatus: q.Status, ToStatus: 'CANCELLED', ActionByName: 'ระบบ', Note: 'ยกเลิกอัตโนมัติ: คิวค้างข้ามวัน' },
        });
        cancelled++;
        branches.add(q.BranchID);
    }
    branches.forEach(publishQueueChange);
    return cancelled;
}

// กวาดซ้ำแบบ lazy (เช่น หลังรีสตาร์ตข้ามเที่ยงคืน) จำกัดไม่เกินนาทีละครั้ง
let lastSweep = 0;
export async function sweepStaleQueuesThrottled(): Promise<void> {
    const now = Date.now();
    if (now - lastSweep < 60_000) return;
    lastSweep = now;
    try {
        await cancelStaleQueues();
    } catch (error) {
        console.error('Queue stale sweep failed:', error);
    }
}

function msUntilNextBangkokMidnight(): number {
    const now = Date.now();
    const nextLocalMidnight = (Math.floor((now + BANGKOK_OFFSET_MS) / DAY_MS) + 1) * DAY_MS - BANGKOK_OFFSET_MS;
    return nextLocalMidnight - now;
}

const globalForJob = globalThis as unknown as { queueMidnightJobStarted?: boolean };

/** ตั้งเวลารันทุกเที่ยงคืน (เวลา Bangkok) สำหรับ deploy แบบ instance เดียว */
export function startQueueMidnightJob(): void {
    if (globalForJob.queueMidnightJobStarted) return;
    globalForJob.queueMidnightJobStarted = true;

    const schedule = () => {
        // +5 วินาที ให้พ้นเที่ยงคืนแน่นอนก่อนตัดสินว่าเป็น "วันก่อนหน้า"
        setTimeout(async () => {
            try {
                const n = await cancelStaleQueues();
                console.log(`[queue] midnight job: cancelled ${n} stale queue(s)`);
            } catch (error) {
                console.error('[queue] midnight job failed:', error);
            } finally {
                schedule();
            }
        }, msUntilNextBangkokMidnight() + 5000).unref?.();
    };
    schedule();
    // เผื่อเซิร์ฟเวอร์เพิ่งเริ่มหลังข้ามเที่ยงคืน
    sweepStaleQueuesThrottled();
}
