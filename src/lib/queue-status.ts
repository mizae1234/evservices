// Queue status workflow: สถานะ ลำดับ และสิทธิ์การเปลี่ยนสถานะ

export const QUEUE_STATUS = {
    WAITING_CALL: 'WAITING_CALL',
    WAITING_REPAIR: 'WAITING_REPAIR',
    IN_REPAIR: 'IN_REPAIR',
    WAITING_PAYMENT: 'WAITING_PAYMENT',
    DONE: 'DONE',
    CANCELLED: 'CANCELLED',
    NO_SHOW: 'NO_SHOW',
} as const;

export type QueueStatus = (typeof QUEUE_STATUS)[keyof typeof QUEUE_STATUS];

// สถานะที่ยังเปิดอยู่ (ตรงกับ filtered unique index ใน SQL)
export const ACTIVE_STATUSES: QueueStatus[] = ['WAITING_CALL', 'WAITING_REPAIR', 'IN_REPAIR', 'WAITING_PAYMENT'];

// คอลัมน์ Kanban ตามลำดับ (ไม่รวมสถานะปิด)
export const BOARD_STATUSES: QueueStatus[] = ['WAITING_CALL', 'WAITING_REPAIR', 'IN_REPAIR', 'WAITING_PAYMENT', 'DONE'];

export const QUEUE_STATUS_LABEL: Record<QueueStatus, string> = {
    WAITING_CALL: 'รอเรียกคิว',
    WAITING_REPAIR: 'รอเข้าซ่อม',
    IN_REPAIR: 'กำลังซ่อม',
    WAITING_PAYMENT: 'รอชำระเงิน',
    DONE: 'เสร็จสิ้น',
    CANCELLED: 'ยกเลิก',
    NO_SHOW: 'ไม่พบลูกค้า',
};

export function isQueueStatus(value: unknown): value is QueueStatus {
    return typeof value === 'string' && value in QUEUE_STATUS;
}

const NEXT: Record<QueueStatus, QueueStatus | null> = {
    WAITING_CALL: 'WAITING_REPAIR',
    WAITING_REPAIR: 'IN_REPAIR',
    IN_REPAIR: 'WAITING_PAYMENT',
    WAITING_PAYMENT: 'DONE',
    DONE: null,
    CANCELLED: null,
    NO_SHOW: null,
};

export function getNextStatus(status: QueueStatus): QueueStatus | null {
    return NEXT[status];
}

// ลำดับขั้นไปข้างหน้า (ใช้กับคิวบริการ "อื่นๆ" ที่ข้ามสถานะได้)
const FORWARD_ORDER: QueueStatus[] = ['WAITING_CALL', 'WAITING_REPAIR', 'IN_REPAIR', 'WAITING_PAYMENT', 'DONE'];

/**
 * เดินหน้าทีละขั้นเท่านั้น; ยกเลิกได้จากทุกสถานะที่ยังเปิด; NO_SHOW ได้เฉพาะตอนรอเรียกคิว
 * คิวบริการ "อื่นๆ" (canSkip) ข้ามไปสถานะที่อยู่ถัดไปข้างหน้าได้ เช่น เรียกคิวแล้วกดเสร็จสิ้นเลย
 */
export function canTransition(from: QueueStatus, to: QueueStatus, canSkip = false): boolean {
    if (to === 'CANCELLED') return ACTIVE_STATUSES.includes(from);
    if (to === 'NO_SHOW') return from === 'WAITING_CALL';
    if (canSkip) {
        const a = FORWARD_ORDER.indexOf(from);
        const b = FORWARD_ORDER.indexOf(to);
        return a !== -1 && b > a;
    }
    return NEXT[from] === to;
}

/** ต้องมีรายละเอียดงานซ่อมก่อนรับเข้าซ่อม (WAITING_CALL -> WAITING_REPAIR); บริการ "อื่นๆ" ไม่บังคับ */
export function requiresRepairDetail(from: QueueStatus, to: QueueStatus, canSkip = false): boolean {
    return !canSkip && from === 'WAITING_CALL' && to === 'WAITING_REPAIR';
}

/**
 * สิทธิ์จัดการคิว: ADMIN ทุกสาขา, SERVICE_CENTER เฉพาะสาขาตัวเอง
 * CS ไม่ผูกสาขา จึงไม่มีสิทธิ์จัดการคิวหน้าร้าน
 */
export function canManageQueue(user: { role?: string | null; branchId?: number | null }, queueBranchId: number): boolean {
    if (user.role === 'ADMIN') return true;
    if (user.role === 'SERVICE_CENTER') return user.branchId != null && user.branchId === queueBranchId;
    return false;
}
