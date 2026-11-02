// ช่องบริการต่อสถานะ (ใช้ประกาศ "ที่ช่องบริการหมายเลข N")

import { prisma } from '@/lib/prisma';
import { BOARD_STATUSES } from '@/lib/queue-status';

export interface QueueChannel { name: string; no: string }

export const CHANNEL_STATUSES = BOARD_STATUSES.filter((s) => s !== 'DONE');

/** ช่องของทุกสถานะที่ตั้งค่าไว้ (เฉพาะที่มีหมายเลข) */
export async function listQueueChannels(branchId: number): Promise<Record<string, QueueChannel>> {
    const rows = await prisma.cM_QueueChannel.findMany({ where: { BranchID: branchId } });
    const out: Record<string, QueueChannel> = {};
    for (const r of rows) {
        if (r.ChannelNo.trim()) out[r.Status] = { name: r.ChannelName.trim() || 'ช่องบริการ', no: r.ChannelNo.trim() };
    }
    return out;
}

export async function getQueueChannel(branchId: number, status: string): Promise<QueueChannel | null> {
    const row = await prisma.cM_QueueChannel.findUnique({ where: { BranchID_Status: { BranchID: branchId, Status: status } } });
    if (!row || !row.ChannelNo.trim()) return null;
    return { name: row.ChannelName.trim() || 'ช่องบริการ', no: row.ChannelNo.trim() };
}
