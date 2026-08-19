// Bay Booking & Slot Utilities
// Shared across Bay Calendar, Bay Booking Form, and Reschedule Modals

export interface BayBookingItem {
    BookingID: number;
    BookingNo: string;
    StartTime: string;
    EndTime: string;
    StartMinutes?: number;
    EndMinutes?: number;
    CustomerName?: string;
    CarRegister?: string;
    Status: number;
    DurationMinutes?: number;
    BayID?: number;
    isMasked?: boolean;
}

export interface BayItem {
    BayID: number;
    BranchID: number;
    BayName: string;
    SortOrder?: number;
    Bookings: BayBookingItem[];
}

/**
 * Convert HH:MM string to total minutes from midnight
 */
export function timeToMinutes(t: string): number {
    if (!t) return 0;
    const [h, m] = t.split(':').map(Number);
    return (h || 0) * 60 + (m || 0);
}

/**
 * Convert total minutes to HH:MM format (24-hour)
 */
export function minutesToTime(m: number): string {
    const h = Math.floor(m / 60);
    const min = m % 60;
    return `${h.toString().padStart(2, '0')}:${min.toString().padStart(2, '0')}`;
}

/**
 * Check if two time ranges [s1, e1) and [s2, e2) overlap
 */
export function isTimeOverlapping(s1: string, e1: string, s2: string, e2: string): boolean {
    const start1 = timeToMinutes(s1);
    const end1 = timeToMinutes(e1);
    const start2 = timeToMinutes(s2);
    const end2 = timeToMinutes(e2);
    return start1 < end2 && start2 < end1;
}

/**
 * Check if time range intersects lunch break (12:00 - 13:00)
 */
export function isLunchBreakOverlap(startTime: string, endTime: string): boolean {
    const s = timeToMinutes(startTime);
    const e = timeToMinutes(endTime);
    const lunchStart = 12 * 60; // 12:00
    const lunchEnd = 13 * 60;   // 13:00

    return (s >= lunchStart && s < lunchEnd) || (e > lunchStart && e <= lunchEnd);
}

export interface BayConflictResult {
    hasConflict: boolean;
    reason?: string;
    conflictingBooking?: BayBookingItem;
    isLunchBreak?: boolean;
    isBlockedBay?: boolean;
}

/**
 * Check if a specific bay has conflict for a proposed time range
 */
export function checkBayConflict(params: {
    bay: BayItem | undefined;
    startTime: string;
    endTime: string;
    excludeBookingId?: number;
}): BayConflictResult {
    const { bay, startTime, endTime, excludeBookingId } = params;

    if (!bay || !startTime || !endTime) {
        return { hasConflict: false };
    }

    // 1. Check blocked bay
    const isBayBlocked = bay.Bookings?.some(
        bk => bk.CustomerName === '[ปิดช่องซ่อมชั่วคราว]' && bk.CarRegister === 'BLOCK' && bk.Status !== 2
    );
    if (isBayBlocked) {
        return {
            hasConflict: true,
            isBlockedBay: true,
            reason: `ช่องซ่อม ${bay.BayName} งดให้บริการชั่วคราว`,
        };
    }

    // 2. Check Lunch break (12:00 - 13:00)
    if (isLunchBreakOverlap(startTime, endTime)) {
        return {
            hasConflict: true,
            isLunchBreak: true,
            reason: 'ช่วงเวลาที่เลือกทับซ้อนกับเวลาพักกลางวัน (12:00 - 13:00 น.)',
        };
    }

    // 3. Check overlapping bookings in this bay
    const conflict = bay.Bookings?.find(b => {
        if (b.Status === 2) return false; // Ignored cancelled
        if (excludeBookingId && b.BookingID === excludeBookingId) return false;
        return isTimeOverlapping(startTime, endTime, b.StartTime, b.EndTime);
    });

    if (conflict) {
        const nameDisplay = conflict.isMasked ? 'คิวอื่น' : conflict.CustomerName || conflict.CarRegister || 'จองแล้ว';
        return {
            hasConflict: true,
            conflictingBooking: conflict,
            reason: `ช่วงเวลา ${startTime} - ${endTime} น. ทับซ้อนกับคิวในช่อง ${bay.BayName} (${conflict.BookingNo || nameDisplay})`,
        };
    }

    return { hasConflict: false };
}

/**
 * Find available alternative time slots in the given bay
 */
export function findAlternativeSlotsInBay(params: {
    bay: BayItem | undefined;
    durationMinutes: number;
    openTime?: string;
    closeTime?: string;
    excludeBookingId?: number;
    maxSlots?: number;
}): { start: string; end: string }[] {
    const {
        bay,
        durationMinutes,
        openTime = '08:30',
        closeTime = '17:30',
        excludeBookingId,
        maxSlots = 5,
    } = params;

    if (!bay || durationMinutes <= 0) return [];

    const openMin = timeToMinutes(openTime);
    const closeMin = timeToMinutes(closeTime);
    const slots: { start: string; end: string }[] = [];

    const activeBookings = (bay.Bookings || []).filter(
        b => b.Status !== 2 && (!excludeBookingId || b.BookingID !== excludeBookingId)
    );

    for (let m = openMin; m < closeMin; m += 30) {
        const slotStart = minutesToTime(m);
        let slotEndMin = m + durationMinutes;

        // Account for 12:00 - 13:00 lunch break if crossing lunch
        if (m < 12 * 60 && slotEndMin > 12 * 60) {
            slotEndMin += 60;
        }

        if (slotEndMin > closeMin) continue;

        const slotEnd = minutesToTime(slotEndMin);

        // Check lunch overlap
        if (isLunchBreakOverlap(slotStart, slotEnd)) continue;

        // Check booking overlap
        const hasOverlap = activeBookings.some(bk => isTimeOverlapping(slotStart, slotEnd, bk.StartTime, bk.EndTime));

        if (!hasOverlap) {
            slots.push({ start: slotStart, end: slotEnd });
            if (slots.length >= maxSlots) break;
        }
    }

    return slots;
}

/**
 * Find other bays that are available at the EXACT requested time
 */
export function findAlternativeAvailableBays(params: {
    bays: BayItem[];
    currentBayId: number | string | undefined;
    startTime: string;
    endTime: string;
    excludeBookingId?: number;
}): BayItem[] {
    const { bays, currentBayId, startTime, endTime, excludeBookingId } = params;

    if (!bays || !startTime || !endTime) return [];

    return bays.filter(bay => {
        if (currentBayId && bay.BayID.toString() === currentBayId.toString()) return false;
        const res = checkBayConflict({ bay, startTime, endTime, excludeBookingId });
        return !res.hasConflict;
    });
}
