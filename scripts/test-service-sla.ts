// Pure-logic tests for Service Attendance & SLA calculation (no DB connection)
// Run: npx ts-node -r tsconfig-paths/register --compiler-options '{"module":"commonjs"}' scripts/test-service-sla.ts

import assert from 'node:assert/strict';
import {
    evaluateQueueSla,
    FlatRateForSla,
    parseBangkokAppointment,
    QueueForSla,
    summarizeServiceSla,
} from '../src/lib/service-sla';

const SAMPLE_FLAT_RATES: FlatRateForSla[] = [
    {
        ServiceTypeID: 1,
        MileageID: 10,
        DurationMinutes: 90,
        Description: 'เช็คระยะ 10,000 กม.',
        Mileage: { Value: 10000 },
        CarModel: { ModelName: 'Y PLUS', Brand: 'AION' },
    },
    {
        ServiceTypeID: 1,
        MileageID: 10,
        DurationMinutes: 150,
        Description: 'เช็คระยะ 10,000 กม. (TAXI)',
        Mileage: { Value: 10000 },
        CarModel: { ModelName: 'Y PLUS TAXI', Brand: 'AION' },
    },
    {
        ServiceTypeID: 2,
        MileageID: null,
        DurationMinutes: 120,
        Description: 'ซ่อมทั่วไป',
        Mileage: null,
        CarModel: null,
    },
];

// Helper: Bangkok timestamp -> UTC Date
function bkk(dateStr: string, timeStr: string): Date {
    const [y, m, d] = dateStr.split('-').map(Number);
    const [hh, mm] = timeStr.split(':').map(Number);
    return new Date(Date.UTC(y, m - 1, d, hh, mm, 0, 0) - 7 * 3600 * 1000);
}

function makeBaseQueue(overrides: Partial<QueueForSla> = {}): QueueForSla {
    return {
        QueueID: 1,
        QueueLabel: 'A001',
        QueueDate: new Date(Date.UTC(2026, 10, 13, 0, 0, 0, 0)),
        BranchID: 1,
        CarRegister: '1กข1234',
        CustomerName: 'สมชาย ใจดี',
        CustomerPhone: '0812345678',
        CarModel: 'AION Y PLUS',
        BookingType: 'EV7',
        Status: 'DONE',
        CheckInDate: bkk('2026-11-13', '08:30'),
        CalledDate: null,
        UpdateDate: bkk('2026-11-13', '10:55'),
        ServiceTypeID: 1,
        ServiceOther: null,
        RepairDetail: 'เช็คระยะตามนัด',
        NeedsReview: false,
        Branch: { BranchName: 'สาขาพระราม 9' },
        ServiceType: { ServiceTypeID: 1, Code: 'MILEAGE_CHECK', Name: 'เช็คระยะเท่านั้น', RequiresMileage: true },
        Booking: null,
        Logs: [],
        ...overrides,
    };
}

// 1. parseBangkokAppointment converts Bangkok date + HH:MM to exact UTC timestamp
const appt = parseBangkokAppointment(new Date(Date.UTC(2026, 10, 13)), '10:00');
assert.ok(appt);
assert.equal(appt.toISOString(), '2026-11-13T03:00:00.000Z');

// 2. Booked customer arrives >1h early (08:30 for 10:00 appointment), staff accepts at 10:05, finishes at 10:55
//    Target SLA from Booking.DurationMinutes = 90 -> SLA starts at 10:00 -> 55 mins -> PASS!
{
    const q = makeBaseQueue({
        CheckInDate: bkk('2026-11-13', '08:30'),
        Booking: {
            BookingID: 100,
            BookingNo: 'BK-2026-0001',
            BookingDate: new Date(Date.UTC(2026, 10, 13)),
            StartTime: '10:00',
            EndTime: '11:30',
            DurationMinutes: 90,
            Mileage: 10000,
            CarModel: 'AION Y PLUS',
            ServiceTypeID: 1,
            ServiceType: { ServiceTypeID: 1, Code: 'MILEAGE_CHECK', Name: 'เช็คระยะเท่านั้น', RequiresMileage: true },
        },
        Logs: [
            { LogID: 1, FromStatus: null, ToStatus: 'WAITING_CALL', CreateDate: bkk('2026-11-13', '08:30'), ActionByName: 'ลูกค้า', Note: null },
            { LogID: 2, FromStatus: 'WAITING_CALL', ToStatus: 'WAITING_CALL', CreateDate: bkk('2026-11-13', '10:02'), ActionByName: 'พนักงาน', Note: 'ประกาศเรียกคิว' },
            { LogID: 3, FromStatus: 'WAITING_CALL', ToStatus: 'WAITING_REPAIR', CreateDate: bkk('2026-11-13', '10:05'), ActionByName: 'พนักงาน', Note: null },
            { LogID: 4, FromStatus: 'WAITING_REPAIR', ToStatus: 'IN_REPAIR', CreateDate: bkk('2026-11-13', '10:10'), ActionByName: 'ช่าง', Note: null },
            { LogID: 5, FromStatus: 'IN_REPAIR', ToStatus: 'WAITING_PAYMENT', CreateDate: bkk('2026-11-13', '10:45'), ActionByName: 'ช่าง', Note: null },
            { LogID: 6, FromStatus: 'WAITING_PAYMENT', ToStatus: 'DONE', CreateDate: bkk('2026-11-13', '10:55'), ActionByName: 'แคชเชียร์', Note: null },
        ],
    });
    const res = evaluateQueueSla(q, SAMPLE_FLAT_RATES, bkk('2026-11-13', '12:00'));
    assert.equal(res.IsEarlyArrival, true);
    assert.equal(res.EarlyArrivalMinutes, 90);
    assert.equal(res.SlaStartReason, 'APPOINTMENT_TIME');
    assert.equal(res.SlaStartAt, bkk('2026-11-13', '10:00').toISOString());
    assert.equal(res.ActualTotalMinutes, 145);
    assert.equal(res.SlaMinutes, 55);
    assert.equal(res.TargetSlaMinutes, 90);
    assert.equal(res.TargetSlaSource, 'BOOKING');
    assert.equal(res.SlaStatus, 'PASS');
}

// 3. Booked customer arrives early (08:45 for 10:00), staff accepts EARLY at 09:00, finishes at 10:15
//    No DurationMinutes on booking -> falls back to FlatRate (90 mins) -> SLA starts at 09:00 -> 75 mins -> PASS!
{
    const q = makeBaseQueue({
        QueueID: 2,
        CheckInDate: bkk('2026-11-13', '08:45'),
        Booking: {
            BookingID: 101,
            BookingNo: 'BK-2026-0002',
            BookingDate: new Date(Date.UTC(2026, 10, 13)),
            StartTime: '10:00',
            EndTime: '12:00',
            DurationMinutes: null,
            Mileage: 10000,
            CarModel: 'AION Y PLUS',
            ServiceTypeID: 1,
            ServiceType: { ServiceTypeID: 1, Code: 'MILEAGE_CHECK', Name: 'เช็คระยะเท่านั้น', RequiresMileage: true },
        },
        Logs: [
            { LogID: 10, FromStatus: null, ToStatus: 'WAITING_CALL', CreateDate: bkk('2026-11-13', '08:45'), ActionByName: 'ลูกค้า', Note: null },
            { LogID: 11, FromStatus: 'WAITING_CALL', ToStatus: 'WAITING_REPAIR', CreateDate: bkk('2026-11-13', '09:00'), ActionByName: 'พนักงาน', Note: null },
            { LogID: 12, FromStatus: 'WAITING_REPAIR', ToStatus: 'IN_REPAIR', CreateDate: bkk('2026-11-13', '09:10'), ActionByName: 'ช่าง', Note: null },
            { LogID: 13, FromStatus: 'IN_REPAIR', ToStatus: 'WAITING_PAYMENT', CreateDate: bkk('2026-11-13', '10:05'), ActionByName: 'ช่าง', Note: null },
            { LogID: 14, FromStatus: 'WAITING_PAYMENT', ToStatus: 'DONE', CreateDate: bkk('2026-11-13', '10:15'), ActionByName: 'แคชเชียร์', Note: null },
        ],
    });
    const res = evaluateQueueSla(q, SAMPLE_FLAT_RATES, bkk('2026-11-13', '12:00'));
    assert.equal(res.SlaStartReason, 'EARLY_SERVICE_START');
    assert.equal(res.SlaMinutes, 75);
    assert.equal(res.TargetSlaMinutes, 90);
    assert.equal(res.TargetSlaSource, 'FLAT_RATE');
    assert.equal(res.SlaStatus, 'PASS');
}

// 4. Walk-in "ซ่อมทั่วไป" (RequiresMileage = false) -> resolves FlatRate = 120 mins (NOT 60 mins!)
//    Checks in at 13:00, finishes at 15:20 (140 mins) -> OVER (+20 mins)
{
    const q = makeBaseQueue({
        QueueID: 3,
        Booking: null,
        ServiceTypeID: 2,
        ServiceType: { ServiceTypeID: 2, Code: 'GENERAL_REPAIR', Name: 'ซ่อมทั่วไป', RequiresMileage: false },
        CheckInDate: bkk('2026-11-13', '13:00'),
        Logs: [
            { LogID: 20, FromStatus: null, ToStatus: 'WAITING_CALL', CreateDate: bkk('2026-11-13', '13:00'), ActionByName: 'ลูกค้า', Note: null },
            { LogID: 21, FromStatus: 'WAITING_CALL', ToStatus: 'DONE', CreateDate: bkk('2026-11-13', '15:20'), ActionByName: 'พนักงาน', Note: null },
        ],
    });
    const res = evaluateQueueSla(q, SAMPLE_FLAT_RATES, bkk('2026-11-13', '16:00'));
    assert.equal(res.VisitType, 'WALK_IN');
    assert.equal(res.TargetSlaMinutes, 120);
    assert.equal(res.TargetSlaSource, 'FLAT_RATE');
    assert.equal(res.SlaMinutes, 140);
    assert.equal(res.SlaDiffMinutes, 20);
    assert.equal(res.SlaStatus, 'OVER');
}

// 5. Walk-in "เช็คระยะ" WITH same-day Claim (Mileage = 10,000, GAC AION Y PLUS TAXI) -> resolves TAXI FlatRate = 150 mins!
{
    const q = makeBaseQueue({
        QueueID: 4,
        Booking: null,
        CarModel: 'GAC AION Y PLUS TAXI',
        MatchedClaim: { ClaimNo: 'CLM-2026-0099', Mileage: 10000, CarModel: 'GAC AION Y PLUS TAXI' },
        CheckInDate: bkk('2026-11-13', '09:00'),
        Logs: [
            { LogID: 30, FromStatus: null, ToStatus: 'WAITING_CALL', CreateDate: bkk('2026-11-13', '09:00'), ActionByName: 'ลูกค้า', Note: null },
            { LogID: 31, FromStatus: 'WAITING_CALL', ToStatus: 'DONE', CreateDate: bkk('2026-11-13', '11:10'), ActionByName: 'พนักงาน', Note: null },
        ],
    });
    const res = evaluateQueueSla(q, SAMPLE_FLAT_RATES, bkk('2026-11-13', '12:00'));
    assert.equal(res.TargetSlaMinutes, 150);
    assert.equal(res.TargetSlaSource, 'CLAIM_FLAT_RATE');
    assert.equal(res.Mileage, 10000);
    assert.equal(res.ClaimNo, 'CLM-2026-0099');
    assert.equal(res.SlaMinutes, 130);
    assert.equal(res.SlaStatus, 'PASS');
}

// 6. Walk-in "เช็คระยะ" WITHOUT Claim/Mileage -> NO 1-hour fallback! TargetSlaMinutes = null, SlaStatus = 'NO_SLA', still shows time!
{
    const q = makeBaseQueue({
        QueueID: 5,
        Booking: null,
        MatchedClaim: null,
        CheckInDate: bkk('2026-11-13', '13:00'),
        Logs: [
            { LogID: 40, FromStatus: null, ToStatus: 'WAITING_CALL', CreateDate: bkk('2026-11-13', '13:00'), ActionByName: 'ลูกค้า', Note: null },
            { LogID: 41, FromStatus: 'WAITING_CALL', ToStatus: 'DONE', CreateDate: bkk('2026-11-13', '14:30'), ActionByName: 'พนักงาน', Note: null },
        ],
    });
    const res = evaluateQueueSla(q, SAMPLE_FLAT_RATES, bkk('2026-11-13', '16:00'));
    assert.equal(res.IsOtherService, false);
    assert.equal(res.SlaMinutes, 90);
    assert.equal(res.TargetSlaMinutes, null);
    assert.equal(res.TargetSlaSource, 'NONE_NO_RATE');
    assert.equal(res.SlaStatus, 'NO_SLA');
}

// 7. "อื่นๆ" (Other service, ServiceType = null) -> TargetSlaMinutes = null, SlaStatus = 'NO_SLA', still shows duration!
{
    const otherDone = makeBaseQueue({
        QueueID: 6,
        QueueLabel: 'Z001',
        ServiceTypeID: null,
        ServiceType: null,
        ServiceOther: 'เติมลมยาง + ตรวจเสียงช่วงล่าง',
        Booking: null,
        CheckInDate: bkk('2026-11-13', '13:00'),
        Logs: [
            { LogID: 50, FromStatus: null, ToStatus: 'WAITING_CALL', CreateDate: bkk('2026-11-13', '13:00'), ActionByName: 'ลูกค้า', Note: null },
            { LogID: 51, FromStatus: 'WAITING_CALL', ToStatus: 'DONE', CreateDate: bkk('2026-11-13', '15:00'), ActionByName: 'พนักงาน', Note: null },
        ],
    });
    const resOther = evaluateQueueSla(otherDone, SAMPLE_FLAT_RATES, bkk('2026-11-13', '16:00'));
    assert.equal(resOther.IsOtherService, true);
    assert.equal(resOther.SlaMinutes, 120);
    assert.equal(resOther.TargetSlaMinutes, null);
    assert.equal(resOther.TargetSlaSource, 'NONE_OTHER');
    assert.equal(resOther.SlaStatus, 'NO_SLA');

    const walkInRepairPass = evaluateQueueSla(
        makeBaseQueue({
            QueueID: 7,
            Booking: null,
            ServiceTypeID: 2,
            ServiceType: { ServiceTypeID: 2, Code: 'GENERAL_REPAIR', Name: 'ซ่อมทั่วไป', RequiresMileage: false },
            CheckInDate: bkk('2026-11-13', '13:00'),
            Logs: [
                { LogID: 52, FromStatus: null, ToStatus: 'WAITING_CALL', CreateDate: bkk('2026-11-13', '13:00'), ActionByName: 'ลูกค้า', Note: null },
                { LogID: 53, FromStatus: 'WAITING_CALL', ToStatus: 'DONE', CreateDate: bkk('2026-11-13', '14:40'), ActionByName: 'พนักงาน', Note: null },
            ],
        }),
        SAMPLE_FLAT_RATES,
        bkk('2026-11-13', '16:00')
    );

    const summary = summarizeServiceSla([resOther, walkInRepairPass]);
    assert.equal(summary.completedCount, 2);
    assert.equal(summary.slaEvaluatedCount, 1);
    assert.equal(summary.slaPassCount, 1);
    assert.equal(summary.slaNoTargetCount, 1);
    assert.equal(summary.slaPassRate, 100);
}

console.log('service SLA logic tests passed!');
