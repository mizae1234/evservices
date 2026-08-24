// Bookings Main API Route
// Handles GET (list bookings with filters) and POST (create new booking with slot capacity check)

export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { notifyBranchAndAdminUsers, NOTI_TYPES } from '@/lib/notifications';
import { isCSRole, getAllowedBookingType } from '@/lib/permissions';
import { getBangkokDateString } from '@/lib/utils';

const DEFAULT_SLOTS = [
    { StartTime: '08:30', EndTime: '10:30', MaxQueue: 2 },
    { StartTime: '10:30', EndTime: '12:30', MaxQueue: 2 },
    { StartTime: '13:30', EndTime: '15:30', MaxQueue: 2 },
    { StartTime: '15:30', EndTime: '17:30', MaxQueue: 2 },
];

export async function GET(request: NextRequest) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user) {
            return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
        }

        const { searchParams } = new URL(request.url);
        const page = parseInt(searchParams.get('page') || '1');
        const pageSize = parseInt(searchParams.get('pageSize') || '10');
        const status = searchParams.get('status');
        const branchIdParam = searchParams.get('branchId');
        const dateStr = searchParams.get('date'); // filter for specific date YYYY-MM-DD
        const search = searchParams.get('search');
        const isOverdue = searchParams.get('isOverdue') === 'true';

        const where: Record<string, unknown> = {};

        // Allowed booking type scoping (e.g. CS_LINEMAN sees only LINEMAN)
        const allowedType = getAllowedBookingType(session.user);
        if (allowedType) {
            where.BookingType = allowedType;
        }

        // Branch filtering based on user role
        if (session.user.role === 'SERVICE_CENTER') {
            if (session.user.branchId) {
                where.BranchID = session.user.branchId;
            } else {
                where.BranchID = -1; // Force empty result if no branch assigned
            }
        } else if (branchIdParam && !isNaN(parseInt(branchIdParam))) {
            where.BranchID = parseInt(branchIdParam);
        }

        // Status filtering
        if (status !== null && status !== '') {
            where.Status = parseInt(status);
        } else if (isOverdue) {
            // Overdue bookings must be either Pending (0) or Approved (1)
            where.Status = {
                in: [0, 1],
            };
        }

        // Date filtering
        if (isOverdue) {
            const todayStr = getBangkokDateString();
            const [y, m, d] = todayStr.split('-').map(Number);
            const startOfToday = new Date(Date.UTC(y, m - 1, d, 0, 0, 0, 0));
            where.BookingDate = {
                lt: startOfToday,
            };
        } else if (dateStr) {
            const [y, m, d] = dateStr.split('-').map(Number);
            const startOfDay = new Date(Date.UTC(y, m - 1, d, 0, 0, 0, 0));
            const endOfDay = new Date(Date.UTC(y, m - 1, d, 23, 59, 59, 999));
            
            where.BookingDate = {
                gte: startOfDay,
                lte: endOfDay,
            };
        }

        // Search text
        if (search) {
            where.OR = [
                { BookingNo: { contains: search } },
                { CustomerName: { contains: search } },
                { CarRegister: { contains: search } },
            ];
        }

        // Total count
        const total = await prisma.cM_Booking.count({ where });

        // Fetch bookings
        const bookings = await prisma.cM_Booking.findMany({
            where,
            include: {
                Branch: {
                    select: { BranchName: true },
                },
                Logs: {
                    orderBy: { CreateDate: 'desc' },
                },
            },
            orderBy: [
                { BookingDate: 'desc' },
                { StartTime: 'asc' },
                { BookingID: 'desc' },
            ],
            skip: (page - 1) * pageSize,
            take: pageSize,
        });

        return NextResponse.json({
            success: true,
            data: bookings,
            total,
            page,
            pageSize,
            totalPages: Math.ceil(total / pageSize),
        });
    } catch (error) {
        console.error('Error listing bookings:', error);
        return NextResponse.json(
            { success: false, error: 'Failed to fetch bookings list' },
            { status: 500 }
        );
    }
}

export async function POST(request: NextRequest) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user) {
            return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
        }

        const body = await request.json();
        const {
            BookingDate,
            StartTime,
            EndTime,
            CustomerName,
            CustomerPhone,
            CarModel,
            CarRegister,
            VinNo,
            ProjectType,
            InventoryItemID,
            LastMileage,
            Mileage,
            ClaimDetail,
            BranchID,
            IsCheckMileage,
            BookingType,
            // New Bay Booking fields
            BayID,
            ServiceTypeID,
            DurationMinutes,
            // Force overlap flag (SERVICE_CENTER/ADMIN only)
            forceOverlap,
        } = body;

        let bookingType = BookingType === 'RETAIL' ? 'RETAIL' : BookingType === 'LINEMAN' ? 'LINEMAN' : 'EV7';
        
        // If user is scoped to a specific booking type (e.g. CS_LINEMAN -> LINEMAN), enforce it
        const allowedType = getAllowedBookingType(session.user);
        if (allowedType) {
            bookingType = allowedType;
        }

        // Check if CS tries to create a block booking
        if (CustomerName === '[ปิดช่องซ่อมชั่วคราว]' && isCSRole(session.user.role)) {
            return NextResponse.json({ success: false, error: 'CS ไม่ได้รับอนุญาตให้ปิดช่องซ่อม' }, { status: 403 });
        }

        // Validation
        if (!BookingDate || !StartTime || !CustomerName || !CarRegister || !CarModel || !BranchID) {
            return NextResponse.json({ success: false, error: 'กรุณากรอกข้อมูลที่จำเป็นให้ครบถ้วน' }, { status: 400 });
        }

        const isBlockBooking = CustomerName === '[ปิดช่องซ่อมชั่วคราว]';
        const cleanPhone = (CustomerPhone || '').toString().replace(/[^0-9]/g, '');
        if (!isBlockBooking) {
            if (!cleanPhone) {
                return NextResponse.json({ success: false, error: 'กรุณาระบุเบอร์โทรลูกค้า' }, { status: 400 });
            }
            if (cleanPhone.length !== 10) {
                return NextResponse.json({ success: false, error: 'เบอร์โทรลูกค้าต้องเป็นตัวเลข 10 หลัก' }, { status: 400 });
            }
        }

        // Check if date is in the past
        const todayStr = getBangkokDateString();
        if (BookingDate < todayStr) {
            return NextResponse.json({ success: false, error: 'ไม่สามารถเลือกจองคิวย้อนหลังได้' }, { status: 400 });
        }

        const branchId = parseInt(BranchID);
        const [y, m, d] = BookingDate.split('-').map(Number);
        const bookingDate = new Date(Date.UTC(y, m - 1, d, 0, 0, 0, 0));

        // 1. Check Weekly Off-Day
        const dayOfWeek = bookingDate.getUTCDay();
        const workingDayConfig = await prisma.cM_BranchWorkingDay.findUnique({
            where: {
                BranchID_DayOfWeek: {
                    BranchID: branchId,
                    DayOfWeek: dayOfWeek,
                },
            },
        });
        const isDefaultClosed = dayOfWeek === 0;
        const isClosedDay = workingDayConfig ? !workingDayConfig.IsOpen : isDefaultClosed;

        if (isClosedDay) {
            const THAI_DAYS = ['วันอาทิตย์', 'วันจันทร์', 'วันอังคาร', 'วันพุธ', 'วันพฤหัสบดี', 'วันศุกร์', 'วันเสาร์'];
            return NextResponse.json({
                success: false,
                error: `ขออภัย สาขาปิดทำการใน${THAI_DAYS[dayOfWeek]}`,
            }, { status: 400 });
        }

        // 2. Check Special Holiday
        const startOfDay = new Date(Date.UTC(y, m - 1, d, 0, 0, 0, 0));
        const endOfDay = new Date(Date.UTC(y, m - 1, d, 23, 59, 59, 999));

        const specialHoliday = await prisma.cM_BranchHoliday.findFirst({
            where: {
                BranchID: branchId,
                HolidayDate: { gte: startOfDay, lte: endOfDay },
                IsActive: true,
            },
        });

        if (specialHoliday) {
            return NextResponse.json({
                success: false,
                error: `ขออภัย สาขาปิดให้บริการในวันที่เลือกเนื่องจาก: ${specialHoliday.Description || 'วันหยุดพิเศษ'}`,
            }, { status: 400 });
        }

        // 2.1 Block duplicate bookings for the same vehicle on the same day (Status in [0, 1, 3] - Pending, Approved, Claimed)
        const cleanRegister = CarRegister.replace(/\s/g, '');
        const duplicateBooking = await prisma.cM_Booking.findFirst({
            where: {
                CarRegister: cleanRegister,
                BookingDate: { gte: startOfDay, lte: endOfDay },
                Status: { in: [0, 1, 3] },
            },
        });

        if (duplicateBooking) {
            return NextResponse.json({
                success: false,
                error: `รถทะเบียน ${CarRegister} มีคิวการจองในวันที่เลือกแล้ว ไม่สามารถจองซ้ำภายในวันเดียวกันได้`,
            }, { status: 400 });
        }

        // Get user ID
        const dbUser = await prisma.cM_User.findUnique({
            where: { Email: session.user.email },
            select: { UserID: true },
        });

        if (!dbUser) {
            return NextResponse.json({ success: false, error: 'User not found in system' }, { status: 400 });
        }

        // ============================================================
        // BAY-BASED BOOKING PATH (new)
        // ============================================================
        if (BayID) {
            const bayId = parseInt(BayID);
            const serviceTypeId = ServiceTypeID ? parseInt(ServiceTypeID) : null;
            const duration = DurationMinutes ? parseInt(DurationMinutes) : null;

            // Validate required fields for bay booking
            if (!EndTime) {
                return NextResponse.json({ success: false, error: 'EndTime is required for bay booking' }, { status: 400 });
            }

            // Validate bay exists and belongs to this branch
            const bay = await prisma.cM_ServiceBay.findUnique({
                where: { BayID: bayId },
            });

            if (!bay || bay.BranchID !== branchId || !bay.IsActive) {
                return NextResponse.json({ success: false, error: 'Bay ไม่ถูกต้องหรือไม่เปิดให้บริการ' }, { status: 400 });
            }

            // Validate StartTime and EndTime are within branch operating hours
            const timeToMinutes = (t: string) => {
                const [hh, mm] = t.split(':').map(Number);
                return hh * 60 + mm;
            };

            const branchInfo = await prisma.cM_MsServiceBranch.findUnique({
                where: { BranchID: branchId },
                select: { OpenTime: true, CloseTime: true },
            });

            const openTime = branchInfo?.OpenTime || '08:30';
            const closeTime = branchInfo?.CloseTime || '17:30';

            const startMinutes = timeToMinutes(StartTime);
            const openMinutes = timeToMinutes(openTime);
            const endMinutes = timeToMinutes(EndTime);
            const closeMinutes = timeToMinutes(closeTime);

            if (startMinutes < openMinutes) {
                return NextResponse.json({
                    success: false,
                    error: `เวลาเริ่ม (${StartTime}) ก่อนเวลาเปิดทำการ (${openTime})`,
                }, { status: 400 });
            }

            if (endMinutes > closeMinutes) {
                return NextResponse.json({
                    success: false,
                    error: `เวลาจบ (${EndTime}) เกินเวลาปิดทำการ (${closeTime})`,
                }, { status: 400 });
            }

            // Check lunch break overlap (12:00 - 13:00)
            // Allow bookings that span across lunch (e.g. 11:30 start, end 14:30 — the frontend already adds 1hr for lunch)
            // Block only if the booking starts during lunch hour
            const lunchStart = 12 * 60; // 12:00
            const lunchEnd = 13 * 60;   // 13:00
            if (startMinutes >= lunchStart && startMinutes < lunchEnd) {
                return NextResponse.json({
                    success: false,
                    error: 'ไม่สามารถเริ่มจองในช่วงเวลาพักกลางวัน (12:00 - 13:00 น.) ได้',
                }, { status: 400 });
            }

            // Check for time overlap with existing bookings on this bay
            const existingBayBookings = await prisma.cM_Booking.findMany({
                where: {
                    BayID: bayId,
                    BookingDate: { gte: startOfDay, lte: endOfDay },
                    Status: { in: [0, 1, 3] }, // PENDING, APPROVED, CONVERTED
                },
                select: { StartTime: true, EndTime: true, BookingNo: true },
            });

            let hasOverlap = false;
            let overlapInfo = '';
            for (const existing of existingBayBookings) {
                const existStart = timeToMinutes(existing.StartTime);
                const existEnd = timeToMinutes(existing.EndTime);

                // Check overlap: two intervals overlap if start1 < end2 AND start2 < end1
                if (startMinutes < existEnd && existStart < endMinutes) {
                    hasOverlap = true;
                    overlapInfo = `${existing.BookingNo}: ${existing.StartTime}-${existing.EndTime}`;
                    break;
                }
            }

            if (hasOverlap) {
                const canForceOverlap = session.user.role === 'SERVICE_CENTER' || session.user.role === 'ADMIN';
                if (!canForceOverlap || !forceOverlap) {
                    return NextResponse.json({
                        success: false,
                        error: `ช่วงเวลา ${StartTime}-${EndTime} ทับซ้อนกับการจองที่มีอยู่ (${overlapInfo})`,
                    }, { status: 409 });
                }
                // SERVICE_CENTER/ADMIN with forceOverlap=true → allow through
            }

            // Determine auto-approve: MILEAGE_CHECK auto-approves
            let bookingStatus = 0; // PENDING by default
            if (serviceTypeId) {
                const serviceType = await prisma.cM_ServiceType.findUnique({
                    where: { ServiceTypeID: serviceTypeId },
                    select: { Code: true },
                });
                if (serviceType?.Code === 'MILEAGE_CHECK') {
                    bookingStatus = 1; // AUTO APPROVED
                }
            }
            // Admin always auto-approves
            if (session.user.role === 'ADMIN') {
                bookingStatus = 1;
            }

            // Generate BookingNo
            const datePrefix = `BKG-${BookingDate.replace(/-/g, '')}-`;
            const lastBooking = await prisma.cM_Booking.findFirst({
                where: { BookingNo: { startsWith: datePrefix } },
                orderBy: { BookingNo: 'desc' },
                select: { BookingNo: true },
            });

            let nextSequence = 1;
            if (lastBooking?.BookingNo) {
                const match = lastBooking.BookingNo.match(/(\d{4})$/);
                if (match) nextSequence = parseInt(match[1]) + 1;
            }

            const bookingNo = `${datePrefix}${nextSequence.toString().padStart(4, '0')}`;

            // Create the bay booking
            const booking = await prisma.cM_Booking.create({
                data: {
                    BookingNo: bookingNo,
                    BookingDate: bookingDate,
                    StartTime,
                    EndTime,
                    CustomerName,
                    CustomerPhone: cleanPhone || null,
                    CarModel,
                    CarRegister: CarRegister.replace(/\s/g, ''),
                    VinNo: VinNo || null,
                    ProjectType: ProjectType || null,
                    InventoryItemID: InventoryItemID ? parseInt(InventoryItemID) : null,
                    LastMileage: parseInt(LastMileage) || 0,
                    Mileage: parseInt(Mileage) || 0,
                    ClaimDetail: ClaimDetail || '',
                    BranchID: branchId,
                    CreateBy: dbUser.UserID,
                    BookingType: bookingType,
                    Status: bookingStatus,
                    // Bay-specific fields
                    BayID: bayId,
                    ServiceTypeID: serviceTypeId,
                    DurationMinutes: duration,
                },
                include: {
                    Bay: { select: { BayName: true } },
                    ServiceType: { select: { Code: true, Name: true } },
                },
            });

            // Log creation
            const forceOverlapNote = hasOverlap && forceOverlap ? ` [⚠️ จองทับเวลาโดย ${session.user.name || session.user.email} — ทับซ้อนกับ ${overlapInfo}]` : '';
            await prisma.cM_BookingLog.create({
                data: {
                    BookingID: booking.BookingID,
                    LogType: bookingStatus === 1 ? 'AUTO_APPROVED' : 'CREATED',
                    Content: (bookingStatus === 1
                        ? `Bay booking created and auto-approved (${booking.ServiceType?.Name || 'N/A'}) on ${booking.Bay?.BayName || 'Bay'}`
                        : `Bay booking created on ${booking.Bay?.BayName || 'Bay'}, pending approval`) + forceOverlapNote,
                    CreateBy: session.user.name || session.user.email || 'System',
                },
            });

            // Notify SERVICE_CENTER (same branch) + ADMIN
            try {
                const currentUserId = parseInt(session.user.id);
                const branchInfo = await prisma.cM_MsServiceBranch.findUnique({ where: { BranchID: branchId }, select: { BranchName: true } });
                const rawBName = branchInfo?.BranchName || '';
                const bNameText = rawBName.startsWith('สาขา') ? rawBName : `สาขา${rawBName}`;
                const statusLabel = bookingStatus === 1 ? 'อนุมัติอัตโนมัติ' : 'รออนุมัติ';
                
                const dObj = new Date(bookingDate);
                const dateStr = dObj.toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' });
                const timeStr = EndTime ? `${StartTime} - ${EndTime} น.` : `${StartTime} น.`;

                await notifyBranchAndAdminUsers(
                    branchId, 
                    booking.BookingID, 
                    NOTI_TYPES.BOOKING_NEW, 
                    `มีคิวจองใหม่ ${booking.BookingNo} 📥`, 
                    `ลูกค้า ${CustomerName} (ทะเบียน ${CarRegister}) จองคิววันที่ ${dateStr} เวลา ${timeStr} ที่ ${bNameText} (${statusLabel})`, 
                    currentUserId
                );
            } catch (notiErr) { console.error('Noti error:', notiErr); }

            return NextResponse.json({
                success: true,
                data: booking,
                message: bookingStatus === 1 ? 'จองสำเร็จ (อนุมัติอัตโนมัติ)' : 'จองสำเร็จ รอผู้จัดการอนุมัติ',
            });
        }

        // ============================================================
        // LEGACY SLOT-BASED BOOKING PATH (existing behavior)
        // ============================================================
        if (!EndTime) {
            return NextResponse.json({ success: false, error: 'EndTime is required' }, { status: 400 });
        }

        // Fetch max capacity configuration
        const slotConfig = await prisma.cM_BranchSlotConfig.findFirst({
            where: {
                BranchID: branchId,
                StartTime,
                EndTime,
                IsActive: true,
            },
        });

        const defaultSlot = DEFAULT_SLOTS.find(s => s.StartTime === StartTime && s.EndTime === EndTime);
        const maxCapacity = slotConfig ? slotConfig.MaxQueue : (defaultSlot ? defaultSlot.MaxQueue : 2);

        // Count current active bookings in this slot
        const activeBookingsCount = await prisma.cM_Booking.count({
            where: {
                BranchID: branchId,
                BookingDate: { gte: startOfDay, lte: endOfDay },
                StartTime,
                EndTime,
                Status: { in: [0, 1, 3] },
            },
        });

        // Check slot override for capacity
        const slotOverride = await prisma.cM_BranchSlotOverride.findFirst({
            where: {
                BranchID: branchId,
                OverrideDate: { gte: startOfDay, lte: endOfDay },
                StartTime,
                EndTime,
            },
        });

        let effectiveCapacity = maxCapacity;
        if (slotOverride) {
            if (!slotOverride.IsOpen) {
                return NextResponse.json({
                    success: false,
                    error: `ขออภัย สล็อตเวลา ${StartTime} - ${EndTime} ถูกปิดรับคิวชั่วคราว${slotOverride.Reason ? ` (${slotOverride.Reason})` : ''}`,
                }, { status: 400 });
            }
            if (slotOverride.MaxQueueOverride !== null) {
                effectiveCapacity = slotOverride.MaxQueueOverride;
            }
        }

        if (activeBookingsCount >= effectiveCapacity) {
            return NextResponse.json({
                success: false,
                error: `ขออภัย สล็อตเวลา ${StartTime} - ${EndTime} คิวเต็มแล้ว (รับได้สูงสุด ${effectiveCapacity} คิว)`,
            }, { status: 400 });
        }

        // Generate BookingNo
        const datePrefix = `BKG-${BookingDate.replace(/-/g, '')}-`;
        const lastBooking = await prisma.cM_Booking.findFirst({
            where: { BookingNo: { startsWith: datePrefix } },
            orderBy: { BookingNo: 'desc' },
            select: { BookingNo: true },
        });

        let nextSequence = 1;
        if (lastBooking?.BookingNo) {
            const match = lastBooking.BookingNo.match(/-(\d{4})$/);
            if (match) nextSequence = parseInt(match[1]) + 1;
        }

        const bookingNo = `${datePrefix}${nextSequence.toString().padStart(4, '0')}`;

        // Create the booking entry (legacy)
        const booking = await prisma.cM_Booking.create({
            data: {
                BookingNo: bookingNo,
                BookingDate: bookingDate,
                StartTime,
                EndTime,
                CustomerName,
                CustomerPhone: cleanPhone || null,
                CarModel,
                CarRegister: CarRegister.replace(/\s/g, ''),
                VinNo: VinNo || null,
                ProjectType: ProjectType || null,
                InventoryItemID: InventoryItemID ? parseInt(InventoryItemID) : null,
                LastMileage: parseInt(LastMileage) || 0,
                Mileage: parseInt(Mileage) || 0,
                ClaimDetail: ClaimDetail || '',
                BranchID: branchId,
                CreateBy: dbUser.UserID,
                BookingType: bookingType,
                Status: bookingType === 'RETAIL'
                    ? 1
                    : (IsCheckMileage === true || (parseInt(Mileage) > 0) || session.user.role === 'ADMIN') ? 1 : 0,
            },
        });

        // Log creation
        try {
            await prisma.cM_BookingLog.create({
                data: {
                    BookingID: booking.BookingID,
                    LogType: booking.Status === 1 ? 'AUTO_APPROVED' : 'CREATED',
                    Content: booking.Status === 1
                        ? 'Booking created and auto-approved'
                        : 'Booking created, pending approval',
                    CreateBy: session.user.name || session.user.email || 'System',
                },
            });
        } catch (logErr) {
            console.error('Error creating booking log:', logErr);
        }

        // Notify SERVICE_CENTER (same branch) + ADMIN
        try {
            const currentUserId = parseInt(session.user.id);
            const branchInfo = await prisma.cM_MsServiceBranch.findUnique({ where: { BranchID: branchId }, select: { BranchName: true } });
            const rawBName = branchInfo?.BranchName || '';
            const bNameText = rawBName.startsWith('สาขา') ? rawBName : `สาขา${rawBName}`;
            const bkStatus = booking.Status === 1 ? 'อนุมัติอัตโนมัติ' : 'รออนุมัติ';

            const dObj = new Date(bookingDate);
            const dateStr = dObj.toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' });
            const timeStr = EndTime ? `${StartTime} - ${EndTime} น.` : `${StartTime} น.`;

            await notifyBranchAndAdminUsers(
                branchId, 
                booking.BookingID, 
                NOTI_TYPES.BOOKING_NEW, 
                `มีคิวจองใหม่ ${booking.BookingNo} 📥`, 
                `ลูกค้า ${CustomerName} (ทะเบียน ${CarRegister}) จองคิววันที่ ${dateStr} เวลา ${timeStr} ที่ ${bNameText} (${bkStatus})`, 
                currentUserId
            );
        } catch (notiErr) { console.error('Noti error:', notiErr); }

        return NextResponse.json({
            success: true,
            data: booking,
        });
    } catch (error) {
        console.error('Error creating booking:', error);
        return NextResponse.json(
            { success: false, error: 'Failed to create booking' },
            { status: 500 }
        );
    }
}
