// In-memory pub/sub สำหรับ SSE (ใช้ได้เฉพาะ deploy แบบ instance เดียว)

import { EventEmitter } from 'events';

const globalForQueue = globalThis as unknown as { queueEmitter?: EventEmitter };

const emitter = globalForQueue.queueEmitter ?? new EventEmitter();
emitter.setMaxListeners(0);
globalForQueue.queueEmitter = emitter;

export function publishQueueChange(branchId: number): void {
    emitter.emit(`branch:${branchId}`);
}

export function subscribeQueueChange(branchId: number, listener: () => void): () => void {
    const event = `branch:${branchId}`;
    emitter.on(event, listener);
    return () => emitter.off(event, listener);
}

// ประกาศเรียกคิว: ส่งไปยังหน้า Monitor ของสาขาเพื่อออกเสียง
export interface QueueCallPayload {
    id: string;
    label: string;
    plate?: string;
    /** ช่องบริการที่ให้ไปรับบริการ เช่น { name: 'ช่องชำระเงิน', no: '2' } (ไม่มี = ไม่ประกาศช่อง) */
    channel?: { name: string; no: string };
}

export function publishQueueCall(branchId: number, payload: QueueCallPayload): void {
    emitter.emit(`call:${branchId}`, payload);
}

export function subscribeQueueCall(branchId: number, listener: (payload: QueueCallPayload) => void): () => void {
    const event = `call:${branchId}`;
    emitter.on(event, listener);
    return () => emitter.off(event, listener);
}
