// Service Attendance & SLA Calculation Utilities
// Pure logic for computing queue stage durations, SLA start times, target SLA, and pass/over status.

import { ACTIVE_STATUSES, QUEUE_STATUS_LABEL, QueueStatus } from '@/lib/queue-status';

const BANGKOK_OFFSET_MS = 7 * 60 * 60 * 1000;

export type TargetSlaSource =
    | 'BOOKING'          // ใช้ DurationMinutes จากใบจอง
    | 'FLAT_RATE'        // ใช้ DurationMinutes จากตาราง CM_FlatRate
    | 'CLAIM_FLAT_RATE'  // Walk-in / ไม่มีไมล์ในใบจอง แต่ดึงไมล์จากใบงานเคลมวันเดียวกันไปเทียบ CM_FlatRate
    | 'NONE_OTHER'       // บริการประเภท "อื่นๆ" (ไม่มีเกณฑ์ SLA)
    | 'NONE_NO_RATE';    // ไม่พบข้อมูล Flat Rate (เช่น Walk-in เช็คระยะที่ยังไม่มีข้อมูลเลขไมล์)

export type SlaStartReason =
    | 'APPOINTMENT_TIME'     // ลูกค้ามีนัดและมาก่อนเวลา -> เริ่มนับจากเวลานัด
    | 'EARLY_SERVICE_START'  // ลูกค้ามีนัดและมาก่อนเวลา แต่พนักงานรับงานก่อนเวลานัด -> เริ่มนับจากเวลารับงานจริง
    | 'CHECK_IN_BOOKING'     // ลูกค้ามีนัด มาตรงเวลาหรือหลังเวลานัด -> เริ่มนับจาก Check-in
    | 'CHECK_IN_WALK_IN';    // Walk-in -> เริ่มนับจาก Check-in

export type SlaEvaluationStatus =
    | 'PASS'                 // ปิดงานแล้ว ภายในเกณฑ์ SLA
    | 'OVER'                 // ปิดงานแล้ว เกินเกณฑ์ SLA
    | 'WAITING_APPOINTMENT'  // กำลังรอถึงเวลานัด (มาก่อนเวลานัดและยังไม่รับงาน)
    | 'IN_PROGRESS'          // กำลังดำเนินการ (ยังไม่เกินเกณฑ์ SLA)
    | 'IN_PROGRESS_OVER'     // กำลังดำเนินการ (ใช้เวลาเกินเกณฑ์ SLA แล้ว)
    | 'NO_SLA'               // ไม่มีเกณฑ์ SLA (บริการ "อื่นๆ" หรือไม่พบ Flat Rate) — แสดงเฉพาะเวลาที่ใช้
    | 'EXCLUDED';            // ยกเลิก / ไม่พบลูกค้า (ไม่นำมาคิด SLA)

export interface FlatRateForSla {
    ServiceTypeID: number;
    MileageID: number | null;
    DurationMinutes: number;
    Description: string | null;
    Mileage: { Value: number } | null;
    CarModel: { ModelName: string; Brand: string | null } | null;
}

export interface QueueLogForSla {
    LogID: number;
    FromStatus: string | null;
    ToStatus: string;
    CreateDate: Date | string;
    ActionByName: string | null;
    Note: string | null;
}

export interface ServiceTypeInfoForSla {
    ServiceTypeID: number;
    Code?: string;
    Name: string;
    RequiresMileage: boolean;
}

export interface MatchedClaimForSla {
    ClaimNo: string;
    Mileage: number;
    CarModel: string | null;
}

export interface QueueForSla {
    QueueID: number;
    QueueLabel: string;
    QueueDate: Date | string;
    BranchID: number;
    CarRegister: string;
    CustomerName: string;
    CustomerPhone: string | null;
    CarModel: string | null;
    BookingType: string;
    Status: string;
    CheckInDate: Date | string;
    CalledDate: Date | string | null;
    UpdateDate: Date | string;
    ServiceTypeID: number | null;
    ServiceOther: string | null;
    RepairDetail: string | null;
    NeedsReview: boolean;
    Branch: { BranchName: string } | null;
    ServiceType: ServiceTypeInfoForSla | null;
    Booking: {
        BookingID: number;
        BookingNo: string;
        BookingDate: Date | string;
        StartTime: string;
        EndTime: string;
        DurationMinutes: number | null;
        Mileage: number;
        CarModel: string;
        ServiceTypeID: number | null;
        ServiceType: ServiceTypeInfoForSla | null;
        Claim?: MatchedClaimForSla | null;
    } | null;
    /** ใบงานเคลมของรถคันเดียวกันในสาขาและวันเดียวกัน (ใช้ช่วยหาเลขไมล์เช็คระยะสำหรับ Walk-in) */
    MatchedClaim?: MatchedClaimForSla | null;
    Logs: QueueLogForSla[];
}

export interface StageMinutesBreakdown {
    WAITING_CALL: number | null;
    WAITING_REPAIR: number | null;
    IN_REPAIR: number | null;
    WAITING_PAYMENT: number | null;
}

export interface ServiceSlaTimelineStep {
    logId: number;
    fromStatus: string | null;
    toStatus: string;
    at: string;
    actionByName: string | null;
    note: string | null;
    spentMinutes: number | null;
}

export interface ServiceSlaReportItem {
    QueueID: number;
    QueueLabel: string;
    QueueDate: string;
    BranchID: number;
    BranchName: string;
    VisitType: 'BOOKING' | 'WALK_IN';
    BookingID: number | null;
    BookingNo: string | null;
    ClaimNo: string | null;
    BookingType: string;
    AppointmentStartTime: string | null;
    AppointmentEndTime: string | null;
    AppointmentAt: string | null;
    CarRegister: string;
    CarModel: string | null;
    CustomerName: string;
    CustomerPhone: string | null;
    IsOtherService: boolean;
    ServiceName: string;
    Mileage: number | null;
    FlatRateDescription: string | null;
    RepairDetail: string | null;
    Status: QueueStatus;
    StatusLabel: string;
    CheckInAt: string;
    FirstServiceActionAt: string | null;
    DoneAt: string | null;
    ClosedAt: string | null;
    IsEarlyArrival: boolean;
    EarlyArrivalMinutes: number;
    SlaStartAt: string;
    SlaStartReason: SlaStartReason;
    SlaStartReasonLabel: string;
    StageMinutes: StageMinutesBreakdown;
    ActualTotalMinutes: number | null;
    SlaMinutes: number | null;
    TargetSlaMinutes: number | null;
    TargetSlaSource: TargetSlaSource;
    TargetSlaSourceLabel: string;
    SlaDiffMinutes: number | null;
    SlaStatus: SlaEvaluationStatus;
    SlaStatusLabel: string;
    Timeline: ServiceSlaTimelineStep[];
}

export interface ServiceSlaSummary {
    totalQueues: number;
    bookingCount: number;
    walkInCount: number;
    completedCount: number;
    activeCount: number;
    cancelledOrNoShowCount: number;
    slaEvaluatedCount: number;
    slaPassCount: number;
    slaOverCount: number;
    slaNoTargetCount: number;
    slaPassRate: number; // 0 - 100 (rounded to 1 decimal, out of slaEvaluatedCount)
    avgSlaMinutes: number;
    avgActualMinutes: number;
    avgWaitBeforeRepairMinutes: number;
    avgRepairMinutes: number;
}

const STAGE_KEYS: (keyof StageMinutesBreakdown)[] = [
    'WAITING_CALL',
    'WAITING_REPAIR',
    'IN_REPAIR',
    'WAITING_PAYMENT',
];

export const SLA_START_REASON_LABEL: Record<SlaStartReason, string> = {
    APPOINTMENT_TIME: 'เวลานัดหมาย (มาก่อนนัด)',
    EARLY_SERVICE_START: 'เวลารับงานจริง (ก่อนเวลานัด)',
    CHECK_IN_BOOKING: 'เวลา Check-in',
    CHECK_IN_WALK_IN: 'เวลา Check-in (Walk-in)',
};

export const TARGET_SLA_SOURCE_LABEL: Record<TargetSlaSource, string> = {
    BOOKING: 'ตามเวลาใบจอง',
    FLAT_RATE: 'ตาม Flat Rate',
    CLAIM_FLAT_RATE: 'ตาม Flat Rate (ไมล์ใบเคลม)',
    NONE_OTHER: 'ไม่กำหนดเกณฑ์ (บริการอื่นๆ)',
    NONE_NO_RATE: 'ไม่พบเกณฑ์ Flat Rate',
};

export const SLA_STATUS_LABEL: Record<SlaEvaluationStatus, string> = {
    PASS: 'ผ่าน SLA',
    OVER: 'เกิน SLA',
    WAITING_APPOINTMENT: 'รอถึงเวลานัด',
    IN_PROGRESS: 'กำลังดำเนินการ',
    IN_PROGRESS_OVER: 'กำลังดำเนินการ (เกิน SLA)',
    NO_SLA: 'ไม่ระบุเกณฑ์ SLA',
    EXCLUDED: 'ไม่คิด SLA',
};

/**
 * ตรวจสอบว่าเป็นคิวประเภทบริการ "อื่นๆ" หรือไม่
 */
export function isOtherServiceQueue(queue: QueueForSla): boolean {
    const st = queue.ServiceType ?? queue.Booking?.ServiceType ?? null;
    if (!st) return true;
    if (st.Code && st.Code.trim().toUpperCase() === 'OTHER') return true;
    const trimmedName = st.Name.trim();
    return trimmedName === 'อื่นๆ' || trimmedName.startsWith('อื่นๆ');
}

/**
 * แปลงวันที่นัดหมาย (UTC midnight ของวันตามเวลาไทย) + เวลา HH:MM (Asia/Bangkok) เป็น UTC Date
 */
export function parseBangkokAppointment(bookingDate: Date | string, startTime: string): Date | null {
    if (!startTime) return null;
    const match = /^(\d{1,2}):(\d{2})$/.exec(startTime.trim());
    if (!match) return null;
    const hh = Number(match[1]);
    const mm = Number(match[2]);
    if (hh < 0 || hh > 23 || mm < 0 || mm > 59) return null;

    const d = typeof bookingDate === 'string' ? new Date(bookingDate) : bookingDate;
    if (Number.isNaN(d.getTime())) return null;

    const utcMs = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), hh, mm, 0, 0) - BANGKOK_OFFSET_MS;
    return new Date(utcMs);
}

function selectBestFlatRate(candidates: FlatRateForSla[], carModelText: string): FlatRateForSla | undefined {
    if (candidates.length === 0) return undefined;
    const cleanTarget = carModelText.trim().toLowerCase();

    if (cleanTarget) {
        // 1. Exact match on "Brand ModelName" or "ModelName"
        const exact = candidates.find((r) => {
            if (!r.CarModel) return false;
            const full = r.CarModel.Brand
                ? `${r.CarModel.Brand} ${r.CarModel.ModelName}`
                : r.CarModel.ModelName;
            return (
                full.trim().toLowerCase() === cleanTarget ||
                r.CarModel.ModelName.trim().toLowerCase() === cleanTarget
            );
        });
        if (exact) return exact;

        // 2. Partial match (prefer longest ModelName first so "Y PLUS TAXI" wins over "Y PLUS")
        const withModel = candidates
            .filter((r) => r.CarModel?.ModelName)
            .sort((a, b) => b.CarModel!.ModelName.length - a.CarModel!.ModelName.length);
        const partial = withModel.find((r) =>
            cleanTarget.includes(r.CarModel!.ModelName.trim().toLowerCase())
        );
        if (partial) return partial;
    }

    // 3. Generic model-less Flat Rate, then fallback to first candidate
    return candidates.find((r) => !r.CarModel) ?? candidates[0];
}

/**
 * คำนวณเกณฑ์เวลาเป้าหมาย (Target SLA) จากใบจองและตาราง CM_FlatRate เท่านั้น (ไม่ใช้ค่าคงที่ 1 ชม.):
 * 1. หากเป็นบริการ "อื่นๆ" -> ไม่กำหนดเกณฑ์ (minutes = null, source = 'NONE_OTHER')
 * 2. หากมีใบจองและระบุ DurationMinutes > 0 -> ใช้ DurationMinutes ของใบจอง
 * 3. ค้นหาจาก CM_FlatRate ตามประเภทบริการ + รุ่นรถ + ระยะไมล์ (ทั้งคิวจองและ Walk-in; โดย Walk-in ดึงไมล์จากใบเคลมวันเดียวกันได้)
 * 4. หากไม่พบเกณฑ์เลย -> minutes = null, source = 'NONE_NO_RATE' (แสดงเฉพาะเวลาที่ใช้โดยไม่ตัดสินผ่าน/เกิน SLA)
 */
export function resolveTargetSla(
    queue: QueueForSla,
    flatRates: FlatRateForSla[]
): {
    minutes: number | null;
    source: TargetSlaSource;
    flatRateDescription: string | null;
    effectiveMileage: number | null;
    claimNo: string | null;
} {
    const booking = queue.Booking;
    const claim = booking?.Claim ?? queue.MatchedClaim ?? null;

    if (isOtherServiceQueue(queue)) {
        return {
            minutes: null,
            source: 'NONE_OTHER',
            flatRateDescription: null,
            effectiveMileage: null,
            claimNo: claim?.ClaimNo ?? null,
        };
    }

    const st = queue.ServiceType ?? booking?.ServiceType ?? null;
    const serviceTypeId = st?.ServiceTypeID ?? queue.ServiceTypeID ?? booking?.ServiceTypeID ?? null;
    const requiresMileage = st?.RequiresMileage ?? false;

    const bookingMileage = booking?.Mileage && booking.Mileage > 0 ? booking.Mileage : null;
    const claimMileage = claim?.Mileage && claim.Mileage > 0 ? claim.Mileage : null;
    const effectiveMileage = bookingMileage ?? claimMileage ?? null;
    const usedClaimMileage = !bookingMileage && !!claimMileage;

    const carModelStr = queue.CarModel || booking?.CarModel || claim?.CarModel || '';

    let matchedRate: FlatRateForSla | undefined;
    if (serviceTypeId) {
        if (requiresMileage) {
            if (effectiveMileage && effectiveMileage > 0) {
                const candidates = flatRates.filter(
                    (r) =>
                        r.ServiceTypeID === serviceTypeId &&
                        r.Mileage?.Value === effectiveMileage &&
                        r.DurationMinutes > 0
                );
                matchedRate = selectBestFlatRate(candidates, carModelStr);
            }
        } else {
            const candidates = flatRates.filter(
                (r) =>
                    r.ServiceTypeID === serviceTypeId &&
                    r.MileageID === null &&
                    r.DurationMinutes > 0
            );
            matchedRate = selectBestFlatRate(candidates, carModelStr);
        }
    }

    const flatRateDescription = matchedRate?.Description?.trim() || null;

    if (booking?.DurationMinutes && booking.DurationMinutes > 0) {
        return {
            minutes: booking.DurationMinutes,
            source: 'BOOKING',
            flatRateDescription,
            effectiveMileage,
            claimNo: claim?.ClaimNo ?? null,
        };
    }

    if (matchedRate && matchedRate.DurationMinutes > 0) {
        return {
            minutes: matchedRate.DurationMinutes,
            source: usedClaimMileage ? 'CLAIM_FLAT_RATE' : 'FLAT_RATE',
            flatRateDescription,
            effectiveMileage,
            claimNo: claim?.ClaimNo ?? null,
        };
    }

    return {
        minutes: null,
        source: 'NONE_NO_RATE',
        flatRateDescription: null,
        effectiveMileage,
        claimNo: claim?.ClaimNo ?? null,
    };
}

export function formatDurationMinutes(minutes: number | null | undefined): string {
    if (minutes == null || Number.isNaN(minutes)) return '-';
    const mins = Math.max(0, Math.round(minutes));
    if (mins < 60) return `${mins} นาที`;
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return m > 0 ? `${h} ชม. ${m} นาที` : `${h} ชม.`;
}

function toDate(val: Date | string): Date {
    return typeof val === 'string' ? new Date(val) : val;
}

/**
 * ประเมิน SLA และระยะเวลาแต่ละขั้นตอนของคิว 1 รายการ
 */
export function evaluateQueueSla(
    queue: QueueForSla,
    flatRates: FlatRateForSla[],
    now: Date = new Date()
): ServiceSlaReportItem {
    const checkInAt = toDate(queue.CheckInDate);
    const updateAt = toDate(queue.UpdateDate);
    const status = queue.Status as QueueStatus;
    const isActive = ACTIVE_STATUSES.includes(status);
    const isClosed = !isActive;
    const isOther = isOtherServiceQueue(queue);

    // เรียงประวัติตามเวลาจริงจากเก่า -> ใหม่
    const sortedLogs = [...queue.Logs].sort(
        (a, b) => toDate(a.CreateDate).getTime() - toDate(b.CreateDate).getTime()
    );

    const stageMs: Record<keyof StageMinutesBreakdown, number | null> = {
        WAITING_CALL: null,
        WAITING_REPAIR: null,
        IN_REPAIR: null,
        WAITING_PAYMENT: null,
    };

    let curEnteredMs = checkInAt.getTime();
    let firstServiceActionAt: Date | null = queue.CalledDate ? toDate(queue.CalledDate) : null;
    let firstActionFromLog: Date | null = null;
    let doneAtFromLog: Date | null = null;
    let lastTransitionAt: Date | null = null;

    const timeline: ServiceSlaTimelineStep[] = [];

    for (const log of sortedLogs) {
        const logAt = toDate(log.CreateDate);
        const logMs = logAt.getTime();
        const isTransition = log.FromStatus != null && log.FromStatus !== log.ToStatus;

        let spentMinutes: number | null = null;
        if (isTransition) {
            const spentMs = Math.max(0, logMs - curEnteredMs);
            spentMinutes = Math.round(spentMs / 60000);
            const fromKey = log.FromStatus as keyof StageMinutesBreakdown;
            if (STAGE_KEYS.includes(fromKey)) {
                stageMs[fromKey] = (stageMs[fromKey] ?? 0) + spentMs;
            }
            if (
                !firstActionFromLog &&
                log.FromStatus === 'WAITING_CALL' &&
                log.ToStatus !== 'CANCELLED' &&
                log.ToStatus !== 'NO_SHOW'
            ) {
                firstActionFromLog = logAt;
            }
            if (log.ToStatus === 'DONE') {
                doneAtFromLog = logAt;
            }
            lastTransitionAt = logAt;
            curEnteredMs = logMs;
        }

        timeline.push({
            logId: log.LogID,
            fromStatus: log.FromStatus,
            toStatus: log.ToStatus,
            at: logAt.toISOString(),
            actionByName: log.ActionByName,
            note: log.Note,
            spentMinutes,
        });
    }

    if (firstActionFromLog) {
        firstServiceActionAt = firstActionFromLog;
    }

    // ถ้าคิวยังเปิดอยู่ ให้บวกเวลาของสถานะปัจจุบันถึงเวลา now
    if (isActive && STAGE_KEYS.includes(status as keyof StageMinutesBreakdown)) {
        const activeKey = status as keyof StageMinutesBreakdown;
        const ongoingMs = Math.max(0, now.getTime() - curEnteredMs);
        stageMs[activeKey] = (stageMs[activeKey] ?? 0) + ongoingMs;
    }

    const stageMinutes: StageMinutesBreakdown = {
        WAITING_CALL: stageMs.WAITING_CALL != null ? Math.round(stageMs.WAITING_CALL / 60000) : null,
        WAITING_REPAIR: stageMs.WAITING_REPAIR != null ? Math.round(stageMs.WAITING_REPAIR / 60000) : null,
        IN_REPAIR: stageMs.IN_REPAIR != null ? Math.round(stageMs.IN_REPAIR / 60000) : null,
        WAITING_PAYMENT: stageMs.WAITING_PAYMENT != null ? Math.round(stageMs.WAITING_PAYMENT / 60000) : null,
    };

    const doneAt: Date | null = status === 'DONE' ? (doneAtFromLog ?? updateAt) : null;
    const closedAt: Date | null = isClosed ? (lastTransitionAt ?? updateAt) : null;

    // คำนวณจุดเริ่มต้นนับเวลา (slaStartAt)
    const booking = queue.Booking;
    const appointmentAt = booking ? parseBangkokAppointment(booking.BookingDate, booking.StartTime) : null;

    let slaStartAt = checkInAt;
    let slaStartReason: SlaStartReason = booking ? 'CHECK_IN_BOOKING' : 'CHECK_IN_WALK_IN';
    let isEarlyArrival = false;
    let earlyArrivalMinutes = 0;

    if (booking && appointmentAt) {
        if (checkInAt.getTime() < appointmentAt.getTime()) {
            isEarlyArrival = true;
            earlyArrivalMinutes = Math.round((appointmentAt.getTime() - checkInAt.getTime()) / 60000);

            if (firstServiceActionAt && firstServiceActionAt.getTime() < appointmentAt.getTime()) {
                slaStartAt = firstServiceActionAt;
                slaStartReason = 'EARLY_SERVICE_START';
            } else {
                slaStartAt = appointmentAt;
                slaStartReason = 'APPOINTMENT_TIME';
            }

            if (doneAt && doneAt.getTime() < slaStartAt.getTime()) {
                slaStartAt = checkInAt;
                slaStartReason = 'EARLY_SERVICE_START';
            }
        } else {
            slaStartAt = checkInAt;
            slaStartReason = 'CHECK_IN_BOOKING';
        }
    }

    const {
        minutes: targetSlaMinutes,
        source: targetSlaSource,
        flatRateDescription,
        effectiveMileage,
        claimNo,
    } = resolveTargetSla(queue, flatRates);

    // คำนวณเวลารวมจริง, เวลาที่ใช้บริการ และผลการประเมิน SLA
    let actualTotalMinutes: number | null = null;
    let slaMinutes: number | null = null;
    let slaDiffMinutes: number | null = null;
    let slaStatus: SlaEvaluationStatus = 'EXCLUDED';

    if (status === 'DONE' && doneAt) {
        actualTotalMinutes = Math.max(0, Math.round((doneAt.getTime() - checkInAt.getTime()) / 60000));
        slaMinutes = Math.max(0, Math.round((doneAt.getTime() - slaStartAt.getTime()) / 60000));

        if (targetSlaMinutes == null) {
            slaDiffMinutes = null;
            slaStatus = 'NO_SLA';
        } else {
            slaDiffMinutes = slaMinutes - targetSlaMinutes;
            slaStatus = slaMinutes <= targetSlaMinutes ? 'PASS' : 'OVER';
        }
    } else if (isActive) {
        actualTotalMinutes = Math.max(0, Math.round((now.getTime() - checkInAt.getTime()) / 60000));
        if (now.getTime() < slaStartAt.getTime()) {
            slaMinutes = 0;
            slaDiffMinutes = targetSlaMinutes != null ? -targetSlaMinutes : null;
            slaStatus = targetSlaMinutes == null ? 'NO_SLA' : 'WAITING_APPOINTMENT';
        } else {
            slaMinutes = Math.max(0, Math.round((now.getTime() - slaStartAt.getTime()) / 60000));
            if (targetSlaMinutes == null) {
                slaDiffMinutes = null;
                slaStatus = 'NO_SLA';
            } else {
                slaDiffMinutes = slaMinutes - targetSlaMinutes;
                slaStatus = slaMinutes > targetSlaMinutes ? 'IN_PROGRESS_OVER' : 'IN_PROGRESS';
            }
        }
    } else {
        // CANCELLED / NO_SHOW
        if (closedAt) {
            actualTotalMinutes = Math.max(0, Math.round((closedAt.getTime() - checkInAt.getTime()) / 60000));
        }
        slaStatus = 'EXCLUDED';
    }

    const serviceName =
        queue.ServiceType?.Name ||
        booking?.ServiceType?.Name ||
        (queue.ServiceOther ? `อื่นๆ (${queue.ServiceOther})` : 'อื่นๆ');

    return {
        QueueID: queue.QueueID,
        QueueLabel: queue.QueueLabel,
        QueueDate: toDate(queue.QueueDate).toISOString(),
        BranchID: queue.BranchID,
        BranchName: queue.Branch?.BranchName || '-',
        VisitType: booking ? 'BOOKING' : 'WALK_IN',
        BookingID: booking?.BookingID ?? null,
        BookingNo: booking?.BookingNo ?? null,
        ClaimNo: claimNo,
        BookingType: queue.BookingType,
        AppointmentStartTime: booking?.StartTime ?? null,
        AppointmentEndTime: booking?.EndTime ?? null,
        AppointmentAt: appointmentAt ? appointmentAt.toISOString() : null,
        CarRegister: queue.CarRegister,
        CarModel: queue.CarModel || booking?.CarModel || null,
        CustomerName: queue.CustomerName,
        CustomerPhone: queue.CustomerPhone,
        IsOtherService: isOther,
        ServiceName: serviceName,
        Mileage: effectiveMileage,
        FlatRateDescription: flatRateDescription,
        RepairDetail: queue.RepairDetail,
        Status: status,
        StatusLabel: QUEUE_STATUS_LABEL[status] ?? queue.Status,
        CheckInAt: checkInAt.toISOString(),
        FirstServiceActionAt: firstServiceActionAt ? firstServiceActionAt.toISOString() : null,
        DoneAt: doneAt ? doneAt.toISOString() : null,
        ClosedAt: closedAt ? closedAt.toISOString() : null,
        IsEarlyArrival: isEarlyArrival,
        EarlyArrivalMinutes: earlyArrivalMinutes,
        SlaStartAt: slaStartAt.toISOString(),
        SlaStartReason: slaStartReason,
        SlaStartReasonLabel: SLA_START_REASON_LABEL[slaStartReason],
        StageMinutes: stageMinutes,
        ActualTotalMinutes: actualTotalMinutes,
        SlaMinutes: slaMinutes,
        TargetSlaMinutes: targetSlaMinutes,
        TargetSlaSource: targetSlaSource,
        TargetSlaSourceLabel: TARGET_SLA_SOURCE_LABEL[targetSlaSource],
        SlaDiffMinutes: slaDiffMinutes,
        SlaStatus: slaStatus,
        SlaStatusLabel: SLA_STATUS_LABEL[slaStatus],
        Timeline: timeline,
    };
}

/**
 * สรุปภาพรวม KPI ของรายงานการเข้าใช้บริการและ SLA
 * หมายเหตุ: คิวที่ไม่มีเกณฑ์ SLA (NO_SLA เช่น บริการ "อื่นๆ" หรือไม่พบ Flat Rate) จะแสดงเวลาเฉลี่ยตามปกติ แต่ไม่ถูกนำมาคิดในสัดส่วน ผ่าน/เกิน SLA
 */
export function summarizeServiceSla(items: ServiceSlaReportItem[]): ServiceSlaSummary {
    const totalQueues = items.length;
    let bookingCount = 0;
    let walkInCount = 0;
    let completedCount = 0;
    let activeCount = 0;
    let cancelledOrNoShowCount = 0;
    let slaPassCount = 0;
    let slaOverCount = 0;
    let slaNoTargetCount = 0;

    let sumSlaMinutes = 0;
    let sumActualMinutes = 0;
    let sumWaitBeforeRepair = 0;
    let countWaitBeforeRepair = 0;
    let sumRepair = 0;
    let countRepair = 0;

    for (const item of items) {
        if (item.VisitType === 'BOOKING') bookingCount++;
        else walkInCount++;

        if (item.Status === 'DONE') {
            completedCount++;
            if (item.SlaStatus === 'PASS') slaPassCount++;
            else if (item.SlaStatus === 'OVER') slaOverCount++;
            else if (item.SlaStatus === 'NO_SLA') slaNoTargetCount++;

            if (item.SlaMinutes != null) sumSlaMinutes += item.SlaMinutes;
            if (item.ActualTotalMinutes != null) sumActualMinutes += item.ActualTotalMinutes;

            const waitCall = item.StageMinutes.WAITING_CALL ?? 0;
            const waitRepair = item.StageMinutes.WAITING_REPAIR ?? 0;
            if (item.StageMinutes.WAITING_CALL != null || item.StageMinutes.WAITING_REPAIR != null) {
                sumWaitBeforeRepair += waitCall + waitRepair;
                countWaitBeforeRepair++;
            }
            if (item.StageMinutes.IN_REPAIR != null) {
                sumRepair += item.StageMinutes.IN_REPAIR;
                countRepair++;
            }
        } else if (ACTIVE_STATUSES.includes(item.Status)) {
            activeCount++;
        } else {
            cancelledOrNoShowCount++;
        }
    }

    const slaEvaluatedCount = slaPassCount + slaOverCount;
    const slaPassRate =
        slaEvaluatedCount > 0 ? Math.round((slaPassCount / slaEvaluatedCount) * 1000) / 10 : 0;

    return {
        totalQueues,
        bookingCount,
        walkInCount,
        completedCount,
        activeCount,
        cancelledOrNoShowCount,
        slaEvaluatedCount,
        slaPassCount,
        slaOverCount,
        slaNoTargetCount,
        slaPassRate,
        avgSlaMinutes: completedCount > 0 ? Math.round(sumSlaMinutes / completedCount) : 0,
        avgActualMinutes: completedCount > 0 ? Math.round(sumActualMinutes / completedCount) : 0,
        avgWaitBeforeRepairMinutes:
            countWaitBeforeRepair > 0 ? Math.round(sumWaitBeforeRepair / countWaitBeforeRepair) : 0,
        avgRepairMinutes: countRepair > 0 ? Math.round(sumRepair / countRepair) : 0,
    };
}
