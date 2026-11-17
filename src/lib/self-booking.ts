// ตรรกะฝั่ง server ของ "ลูกค้าจองคิวเอง" — ใช้กฎเดียวกับการจอง bay ของพนักงาน
// (เวลาทำการ, วันหยุด, พักเที่ยง, ชนช่อง, MILEAGE_CHECK อนุมัติอัตโนมัติ)

import { Prisma } from '@prisma/client';
import prisma from '@/lib/prisma';
import { getBangkokDateString } from '@/lib/utils';
import { addDaysToDateString } from '@/lib/mileage-rule';
import { DaySchedule, suggestSlots, timeToMinutes } from '@/lib/slot-suggest';
import { queuePlate } from '@/lib/queue-service';
import { lookupVehicleDetailed, VehicleInfo } from '@/lib/queue-vehicle';
import { MAX_BOOKING_HORIZON_DAYS } from '@/lib/mileage-rule';

export class SelfBookingError extends Error {
    constructor(message: string, public status = 400, public code?: string) {
        super(message);
    }
}

export function dateFromString(ymd: string): Date {
    const [y, m, d] = ymd.split('-').map(Number);
    return new Date(Date.UTC(y, m - 1, d));
}

export function isValidDateString(s: unknown): s is string {
    return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(dateFromString(s).getTime());
}

export function getBangkokNowMinutes(): number {
    const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Bangkok', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(new Date());
    const h = Number(parts.find((p) => p.type === 'hour')?.value) % 24;
    const m = Number(parts.find((p) => p.type === 'minute')?.value);
    return h * 60 + m;
}

/** ผู้สร้างคิว (CreateBy เป็น FK ไป CM_User): ตั้ง SELF_BOOKING_USER_ID ได้, ไม่งั้นใช้ ADMIN คนแรกที่ active */
export async function getSelfBookingUserId(): Promise<number> {
    const envId = Number(process.env.SELF_BOOKING_USER_ID);
    if (Number.isInteger(envId) && envId > 0) return envId;
    const admin = await prisma.cM_User.findFirst({
        where: { IsActive: true, Role: { RoleCode: 'ADMIN' } },
        orderBy: { UserID: 'asc' },
        select: { UserID: true },
    });
    if (!admin) throw new SelfBookingError('ระบบยังไม่พร้อมให้จองออนไลน์ กรุณาติดต่อสาขา', 503);
    return admin.UserID;
}

export async function getOnlineBranch(branchId: number) {
    const branch = await prisma.cM_MsServiceBranch.findFirst({
        where: { BranchID: branchId, IsActive: true, AllowOnlineBooking: true },
        select: { BranchID: true, BranchName: true, OpenTime: true, CloseTime: true },
    });
    if (!branch) throw new SelfBookingError('สาขานี้ยังไม่เปิดให้จองออนไลน์');
    return branch;
}

/** ทะเบียนแบบ canonical (ตัดช่องว่าง/ขีด/จุด ตัวพิมพ์ใหญ่) ความยาว 2-20 ตัว — เงื่อนไขเดียวกับหน้าเช็คอินรับคิว */
export function parsePlate(rawPlate: string): string {
    const plate = queuePlate(rawPlate);
    if (plate.length < 2 || plate.length > 20) throw new SelfBookingError('กรุณากรอกทะเบียนรถให้ถูกต้อง');
    return plate;
}

/**
 * ค้นรถจาก EV7 ด้วยทะเบียนที่พิมพ์ (เงื่อนไขเดียวกับหน้าเช็คอินรับคิว)
 * - EV7 พบรถแต่ทะเบียนเต็มไม่ตรงกับที่พิมพ์ (เช่น พิมพ์เลขท้าย) → ให้พิมพ์ทะเบียนให้ครบ ไม่เปิดเผยข้อมูลจากการเดา
 * - ไม่พบ หรือ EV7 เรียกไม่สำเร็จ → vehicle = null ให้ลูกค้ากรอกเอง (ไม่แสดงข้อความเตือน, บันทึกเป็น RETAIL)
 */
export async function resolveVehicle(rawPlate: string): Promise<{ plate: string; vehicle: VehicleInfo | null; lookupFailed: boolean }> {
    const plate = parsePlate(rawPlate);
    const { vehicle, failed } = await lookupVehicleDetailed(plate);
    if (vehicle?.registerNo && queuePlate(vehicle.registerNo) !== plate) {
        throw new SelfBookingError('กรุณากรอกทะเบียนรถให้ครบ (รวมตัวอักษรนำหน้า)', 400, 'PLATE_INCOMPLETE');
    }
    return { plate, vehicle, lookupFailed: failed };
}

/**
 * สาขานี้ยังมีที่นัดหมายว่างไหม (ใช้เตือนลูกค้า)
 * ยังไม่เลือกบริการ: ดูช่อง 60 นาที (งานสั้นสุด) ใน 30 วัน; เลือกบริการแล้ว: ใช้เวลางานจริง + จำกัดวันตามเลขไมล์
 */
export async function getBranchAvailability(branchId: number, opts: { duration?: number; horizonDays?: number } = {}) {
    const duration = opts.duration ?? 60;
    const horizonDays = opts.horizonDays ?? MAX_BOOKING_HORIZON_DAYS;
    const today = getBangkokDateString();
    const days = await buildDaySchedules(branchId, today, addDaysToDateString(today, horizonDays));
    const [first] = suggestSlots({ days, duration, count: 1 });

    // "วันนี้เต็ม" ต้องเป็นเพราะมีคนจองเต็มจริง: วันนี้ยังเปิดทำการและยังรับจองได้ (ถ้าไม่มีการจองเลยจะมีช่องว่าง)
    // ถ้าเลยเวลารับจอง/เลยเวลาทำการ/วันหยุด/ไม่ใช่วันทำการ ไม่นับ เพราะลูกค้าต้องเลือกวันถัดไปอยู่แล้ว
    const todayDay = days.find((d) => d.date === today);
    const todayHasCapacity = !!todayDay
        && suggestSlots({ days: [{ ...todayDay, bays: todayDay.bays.map((b) => ({ ...b, busy: [] })) }], duration, count: 1 }).length > 0;
    const todayHasSlot = !!todayDay && suggestSlots({ days: [todayDay], duration, count: 1 }).length > 0;

    return {
        full: !first,
        nextAvailableDate: first?.date ?? null,
        todayFull: todayHasCapacity && !todayHasSlot,
        horizonDays,
        lastBookableDate: addDaysToDateString(today, horizonDays),
    };
}

/** สร้างตารางว่างรายวัน/รายช่อง ตั้งแต่ fromDate..toDate (ข้ามวันหยุดประจำสัปดาห์และวันหยุดพิเศษ) */
export async function buildDaySchedules(branchId: number, fromDate: string, toDate: string): Promise<DaySchedule[]> {
    const branch = await getOnlineBranch(branchId);
    const open = timeToMinutes(branch.OpenTime || '08:30');
    const close = timeToMinutes(branch.CloseTime || '17:30');

    const from = dateFromString(fromDate);
    const to = dateFromString(toDate);
    const [bays, workingDays, holidays, bookings] = await Promise.all([
        prisma.cM_ServiceBay.findMany({
            where: { BranchID: branchId, IsActive: true, IsOnline: true },
            orderBy: { SortOrder: 'asc' },
            select: { BayID: true, BayName: true },
        }),
        prisma.cM_BranchWorkingDay.findMany({ where: { BranchID: branchId } }),
        prisma.cM_BranchHoliday.findMany({
            where: { BranchID: branchId, IsActive: true, HolidayDate: { gte: from, lte: new Date(to.getTime() + 86_399_999) } },
            select: { HolidayDate: true },
        }),
        prisma.cM_Booking.findMany({
            where: { BranchID: branchId, BayID: { not: null }, Status: { in: [0, 1, 3] }, BookingDate: { gte: from, lte: new Date(to.getTime() + 86_399_999) } },
            select: { BayID: true, BookingDate: true, StartTime: true, EndTime: true },
        }),
    ]);

    const workingMap = new Map(workingDays.map((w) => [w.DayOfWeek, w.IsOpen]));
    const holidaySet = new Set(holidays.map((h) => h.HolidayDate.toISOString().slice(0, 10)));
    const todayStr = getBangkokDateString();
    const nowMinutes = getBangkokNowMinutes();

    const days: DaySchedule[] = [];
    for (let date = fromDate; date <= toDate; date = addDaysToDateString(date, 1)) {
        if (date < todayStr) continue;
        const dow = dateFromString(date).getUTCDay();
        const isOpen = workingMap.has(dow) ? workingMap.get(dow)! : dow !== 0; // ค่าเริ่มต้น: ปิดวันอาทิตย์
        if (!isOpen || holidaySet.has(date)) continue;
        days.push({
            date,
            open,
            close,
            // วันนี้ต้องเผื่อเวลาให้ลูกค้าเดินทาง 60 นาที ปัดขึ้นเป็น 15 นาที
            earliestStart: date === todayStr ? Math.ceil((nowMinutes + 60) / 15) * 15 : undefined,
            bays: bays.map((b) => ({
                bayId: b.BayID,
                bayName: b.BayName,
                busy: bookings
                    .filter((bk) => bk.BayID === b.BayID && bk.BookingDate.toISOString().slice(0, 10) === date)
                    .map((bk) => ({ start: timeToMinutes(bk.StartTime), end: timeToMinutes(bk.EndTime) })),
            })),
        });
    }
    return days;
}

interface RateRow { MileageID: number | null; DurationMinutes: number; CarModelID: number | null; CarModel: { ModelName: string; Brand: string | null } | null; Mileage: { Value: number; Label: string } | null }

/** เลือก flat rate: ของรุ่นรถตัวเองก่อน, ถัดมารุ่นกลาง (ไม่ระบุรุ่น), สุดท้ายตัวแรกที่มี */
function pickRate(rates: RateRow[], carModel: string | null): RateRow | null {
    if (rates.length === 0) return null;
    const model = carModel?.trim();
    const own = model ? rates.find((r) => r.CarModel && (r.CarModel.ModelName === model || `${r.CarModel.Brand ?? ''} ${r.CarModel.ModelName}`.trim() === model)) : null;
    return own ?? rates.find((r) => r.CarModelID == null) ?? rates[0];
}

export async function resolveService(serviceTypeId: number, mileageId: number | null, carModel: string | null) {
    const serviceType = await prisma.cM_ServiceType.findFirst({
        where: { ServiceTypeID: serviceTypeId, IsActive: true },
        select: { ServiceTypeID: true, Code: true, Name: true, RequiresMileage: true },
    });
    if (!serviceType) throw new SelfBookingError('ประเภทบริการไม่ถูกต้อง');

    const rates = await prisma.cM_FlatRate.findMany({
        where: {
            ServiceTypeID: serviceTypeId,
            IsActive: true,
            ...(serviceType.RequiresMileage ? { MileageID: mileageId ?? -1 } : { MileageID: null }),
        },
        select: { MileageID: true, DurationMinutes: true, CarModelID: true, CarModel: { select: { ModelName: true, Brand: true } }, Mileage: { select: { Value: true, Label: true } } },
    });
    if (serviceType.RequiresMileage && mileageId == null) throw new SelfBookingError('กรุณาเลือกระยะเช็ค');
    const rate = pickRate(rates, carModel);
    if (serviceType.RequiresMileage && !rate) throw new SelfBookingError('ไม่พบข้อมูลระยะเช็คที่เลือก');
    // ไม่ต้องใช้ไมล์ & ไม่มี flat rate → 120 นาที (ตามหน้า bay-booking ของพนักงาน)
    const duration = rate && rate.DurationMinutes > 0 ? rate.DurationMinutes : 120;
    return {
        serviceType,
        duration,
        targetMileage: serviceType.RequiresMileage ? rate!.Mileage?.Value ?? null : null,
    };
}

/**
 * การจองที่ยังใช้งานอยู่ของทะเบียนนี้ (รออนุมัติ/ยืนยัน และยังไม่เลยเวลานัดหมาย) — เทียบทะเบียนแบบไม่สนขีด/ช่องว่าง
 * beforeId: ใช้ตรวจชนกันตอนจองพร้อมกัน (สนใจเฉพาะรายการที่ BookingID น้อยกว่า)
 */
export async function findActiveBooking(plate: string, beforeId?: number) {
    const key = queuePlate(plate);
    const todayStr = getBangkokDateString();
    // กรองเบื้องต้นใน DB ด้วยชุดตัวเลขท้ายทะเบียน (ขีด/ช่องว่างแทรกระหว่างตัวเลขไม่ได้) แล้วค่อยเทียบ canonical ใน JS
    const digits = key.match(/\d+/g)?.sort((a, b) => b.length - a.length)[0];
    const rows = await prisma.cM_Booking.findMany({
        where: {
            Status: { in: [0, 1] },
            IsActive: true,
            BookingDate: { gte: dateFromString(todayStr) },
            ...(digits && digits.length >= 2 ? { CarRegister: { contains: digits } } : {}),
            ...(beforeId != null ? { BookingID: { lt: beforeId } } : {}),
        },
        orderBy: [{ BookingDate: 'asc' }, { StartTime: 'asc' }],
        include: { Branch: { select: { BranchName: true } }, ServiceType: { select: { Name: true } }, Bay: { select: { BayName: true } } },
    });
    return rows.find((r) => queuePlate(r.CarRegister) === key && !isPastEnd(r.BookingDate, r.EndTime)) ?? null;
}

/**
 * กันจองซ้ำตอนมีคำขอพร้อมกัน (เช็คแล้วค่อย insert ไม่ atomic): หลัง insert ตรวจอีกรอบ
 * ถ้ามีรายการที่ BookingID น้อยกว่า (ถึงก่อน) ชนช่องเดียวกัน หรือทะเบียนเดียวกันมีการจองค้าง → ลบรายการของเราทิ้งแล้วแจ้งลูกค้า
 * (ทั้งสองฝั่งตัดสินด้วยกฎ "ID น้อยกว่าชนะ" จึงเหลือรายการเดียวเสมอ)
 */
export async function rollbackIfConflict(booking: { BookingID: number; BayID: number | null; BookingDate: Date; StartTime: string; EndTime: string; CarRegister: string }) {
    const start = timeToMinutes(booking.StartTime);
    const end = timeToMinutes(booking.EndTime);
    const sameSlot = booking.BayID == null ? [] : await prisma.cM_Booking.findMany({
        where: { BayID: booking.BayID, BookingDate: booking.BookingDate, Status: { in: [0, 1, 3] }, BookingID: { lt: booking.BookingID } },
        select: { StartTime: true, EndTime: true },
    });
    const slotTaken = sameSlot.some((b) => start < timeToMinutes(b.EndTime) && timeToMinutes(b.StartTime) < end);
    const plateBusy = !slotTaken && !!(await findActiveBooking(booking.CarRegister, booking.BookingID));
    if (!slotTaken && !plateBusy) return;

    await prisma.cM_Booking.delete({ where: { BookingID: booking.BookingID } }).catch(async () => {
        await prisma.cM_Booking.update({ where: { BookingID: booking.BookingID }, data: { Status: 2 } }); // ลบไม่ได้ → ยกเลิกแทน
    });
    if (slotTaken) throw new SelfBookingError('ช่วงเวลานี้ไม่ว่างแล้ว กรุณาเลือกเวลาใหม่', 409, 'SLOT_TAKEN');
    throw new SelfBookingError('รถทะเบียนนี้มีการจองที่ยังไม่เสร็จสิ้น กรุณายกเลิกการจองเดิมก่อนจองใหม่', 409, 'ACTIVE_BOOKING');
}

/** เลยเวลาจบนัดหมายแล้วหรือยัง (เวลาไทย) */
function isPastEnd(bookingDate: Date, endTime: string): boolean {
    const d = bookingDate.toISOString().slice(0, 10);
    const today = getBangkokDateString();
    return d < today || (d === today && timeToMinutes(endTime) <= getBangkokNowMinutes());
}
function isPastStart(bookingDate: Date, startTime: string): boolean {
    const d = bookingDate.toISOString().slice(0, 10);
    const today = getBangkokDateString();
    return d < today || (d === today && timeToMinutes(startTime) <= getBangkokNowMinutes());
}

export async function createBookingWithRetry(data: Omit<Prisma.CM_BookingUncheckedCreateInput, 'BookingNo'>, dateStr: string) {
    const datePrefix = `BKG-${dateStr.replace(/-/g, '')}-`;
    for (let attempt = 0; attempt < 6; attempt++) {
        const last = await prisma.cM_Booking.findFirst({
            where: { BookingNo: { startsWith: datePrefix } },
            orderBy: { BookingNo: 'desc' },
            select: { BookingNo: true },
        });
        const match = last?.BookingNo.match(/(\d{4})$/);
        const seq = (match ? parseInt(match[1]) : 0) + 1 + attempt;
        try {
            return await prisma.cM_Booking.create({
                data: { ...data, BookingNo: `${datePrefix}${String(seq).padStart(4, '0')}` },
                include: { Bay: { select: { BayName: true } }, ServiceType: { select: { Code: true, Name: true } }, Branch: { select: { BranchName: true } } },
            });
        } catch (e) {
            if (!(e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002')) throw e;
        }
    }
    throw new SelfBookingError('ระบบไม่สามารถสร้างการจองได้ในขณะนี้ กรุณาลองใหม่', 503);
}

export interface BookingView {
    bookingNo: string;
    status: number;
    statusLabel: string;
    date: string;
    startTime: string;
    endTime: string;
    branchName: string;
    serviceName: string | null;
    carRegister: string;
    canCancel: boolean;
    /** เลยเวลานัดหมายแล้วโดยยังไม่ได้เข้ารับบริการ */
    expired: boolean;
    /** ถึงเวลานัดหมายแล้ว (แต่ยังไม่เลยเวลาจบ) */
    started: boolean;
    /** จบการนัดหมายแล้ว (ยกเลิก/เลยเวลา/เสร็จสิ้น) ไม่ต้องติดตามสถานะต่อ */
    closed: boolean;
}

// จบแค่เรื่องนัดหมาย: สถานะหลังรับรถ/เปิดเคลม (3, 4) แสดงเป็น "เสร็จสิ้นการนัดหมาย" ไม่แจ้งรายละเอียดงานบริการ/เคลมต่อ
const STATUS_LABEL: Record<number, string> = { 0: 'รอสาขาอนุมัติ', 1: 'ยืนยันการจองแล้ว', 2: 'ยกเลิกแล้ว', 3: 'เสร็จสิ้นการนัดหมาย', 4: 'เสร็จสิ้นการนัดหมาย' };

export function toBookingView(b: {
    BookingNo: string; Status: number; BookingDate: Date; StartTime: string; EndTime: string; CarRegister: string;
    Branch?: { BranchName: string } | null; ServiceType?: { Name: string } | null;
}): BookingView {
    const open = b.Status === 0 || b.Status === 1;
    const expired = open && isPastEnd(b.BookingDate, b.EndTime);
    const started = open && !expired && isPastStart(b.BookingDate, b.StartTime);
    return {
        bookingNo: b.BookingNo,
        status: b.Status,
        statusLabel: expired ? 'เลยเวลานัดหมายแล้ว' : STATUS_LABEL[b.Status] ?? 'ไม่ทราบสถานะ',
        date: b.BookingDate.toISOString().slice(0, 10),
        startTime: b.StartTime,
        endTime: b.EndTime,
        branchName: b.Branch?.BranchName ?? '',
        serviceName: b.ServiceType?.Name ?? null,
        carRegister: b.CarRegister,
        canCancel: open && !expired,
        expired,
        started,
        closed: !open || expired,
    };
}
