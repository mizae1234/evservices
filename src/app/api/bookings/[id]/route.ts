// Booking Detail API Route
// Handles GET (fetch detail) and PUT (update status/claim association)

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { notifyCSUsers, NOTI_TYPES, formatBookingDate } from '@/lib/notifications';

export async function GET(
    request: NextRequest,
    context: { params: Promise<{ id: string }> }
) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user) {
            return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
        }

        const { id } = await context.params;
        const bookingId = parseInt(id);

        if (isNaN(bookingId)) {
            return NextResponse.json({ success: false, error: 'Invalid booking ID' }, { status: 400 });
        }

        const booking = await prisma.cM_Booking.findUnique({
            where: { BookingID: bookingId },
            include: {
                Branch: {
                    select: { BranchName: true },
                },
                Bay: {
                    select: { BayID: true, BayName: true },
                },
                ServiceType: {
                    select: { RequiresMileage: true, Code: true },
                },
                Logs: {
                    orderBy: {
                        CreateDate: 'desc',
                    },
                },
            },
        });

        if (!booking) {
            return NextResponse.json({ success: false, error: 'Booking not found' }, { status: 404 });
        }

        // Branch authorization check
        if (session.user.role === 'SERVICE_CENTER' && session.user.branchId && booking.BranchID !== session.user.branchId) {
            return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 403 });
        }

        return NextResponse.json({
            success: true,
            data: booking,
        });
    } catch (error) {
        console.error('Error fetching booking details:', error);
        return NextResponse.json(
            { success: false, error: 'Failed to fetch booking details' },
            { status: 500 }
        );
    }
}

export async function PUT(
    request: NextRequest,
    context: { params: Promise<{ id: string }> }
) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user) {
            return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
        }

        const { id } = await context.params;
        const bookingId = parseInt(id);

        if (isNaN(bookingId)) {
            return NextResponse.json({ success: false, error: 'Invalid booking ID' }, { status: 400 });
        }

        const body = await request.json();
        const { 
            status, 
            claimId, 
            BookingDate, 
            StartTime, 
            EndTime, 
            RescheduleReason,
            CustomerName,
            CustomerPhone,
            CarRegister,
            CarModel,
            VinNo,
            LastMileage,
            ClaimDetail,
            BayID,
            cancelReason
        } = body;

        const hasDetails = CustomerName !== undefined || CarRegister !== undefined || CarModel !== undefined || VinNo !== undefined || LastMileage !== undefined || ClaimDetail !== undefined || BayID !== undefined;
        const isDurationUpdate = EndTime !== undefined;
        if (status === undefined && claimId === undefined && (!BookingDate || !StartTime || !EndTime) && !hasDetails && !isDurationUpdate) {
            return NextResponse.json({ success: false, error: 'Missing update parameters' }, { status: 400 });
        }

        const booking = await prisma.cM_Booking.findUnique({
            where: { BookingID: bookingId },
        });

        if (!booking) {
            return NextResponse.json({ success: false, error: 'Booking not found' }, { status: 404 });
        }

        // Branch authorization check
        if (session.user.role === 'SERVICE_CENTER' && session.user.branchId && booking.BranchID !== session.user.branchId) {
            return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 403 });
        }

        // CS block booking permission check
        if (session.user.role === 'CS' && (booking.CustomerName === '[ปิดช่องซ่อมชั่วคราว]' || CustomerName === '[ปิดช่องซ่อมชั่วคราว]')) {
            return NextResponse.json({ success: false, error: 'CS ไม่ได้รับอนุญาตให้จัดการการปิดช่องซ่อม' }, { status: 403 });
        }

        // Block edit/reschedule if booking is already claimed (3) or cancelled (2)
        if (booking.Status === 2 || booking.Status === 3) {
            if (BookingDate || StartTime || EndTime || hasDetails) {
                return NextResponse.json({
                    success: false,
                    error: booking.Status === 3 ? 'ไม่สามารถแก้ไขหรือเลื่อนคิวที่เข้ารับบริการไปแล้วได้' : 'ไม่สามารถแก้ไขหรือเลื่อนคิวที่ถูกยกเลิกไปแล้วได้',
                }, { status: 400 });
            }
        }

        // Update booking data object
        const updateData: Record<string, any> = {};
        const logsToCreate: any[] = [];

        if (status !== undefined) {
            const newStatus = parseInt(status);
            updateData.Status = newStatus;
            if (newStatus === 2) {
                logsToCreate.push({
                    LogType: 'CANCEL',
                    Content: cancelReason ? `ยกเลิกคิวนัดหมายเนื่องจาก: ${cancelReason}` : 'ยกเลิกคิวนัดหมายเข้ารับบริการ',
                    CreateBy: session.user.email || 'SYSTEM',
                });
            }
        }

        if (claimId !== undefined) {
            updateData.ClaimID = claimId ? parseInt(claimId) : null;
        }

        // Details updates
        if (CustomerName !== undefined) updateData.CustomerName = CustomerName;
        if (CustomerPhone !== undefined) updateData.CustomerPhone = CustomerPhone || null;
        if (CarRegister !== undefined) updateData.CarRegister = CarRegister.replace(/\s/g, '');
        if (CarModel !== undefined) updateData.CarModel = CarModel;
        if (VinNo !== undefined) updateData.VinNo = VinNo || null;
        if (LastMileage !== undefined) updateData.LastMileage = parseInt(LastMileage) || 0;
        if (BayID !== undefined) updateData.BayID = BayID ? parseInt(BayID) : null;
        if (ClaimDetail !== undefined && !BookingDate) {
            updateData.ClaimDetail = ClaimDetail;
        }

        // Duration Extension / Adjustment logic (when EndTime is passed without BookingDate)
        if (!BookingDate && EndTime && EndTime !== booking.EndTime) {
            const oldEndTime = booking.EndTime;
            updateData.EndTime = EndTime;
            
            const timeToM = (t: string) => {
                const [h, m] = t.split(':').map(Number);
                return h * 60 + m;
            };
            const startMins = timeToM(booking.StartTime);
            let endMins = timeToM(EndTime);
            if (endMins < startMins) endMins += 24 * 60;
            const newDurationMins = endMins - startMins;
            updateData.DurationMinutes = newDurationMins;

            const durationReasonStr = body.DurationReason ? ` (เหตุผล: ${body.DurationReason})` : '';
            logsToCreate.push({
                LogType: 'EXTEND_DURATION',
                Content: `ขยาย/ปรับเวลาซ่อมจากเดิม (${booking.StartTime} - ${oldEndTime} น.) เป็น (${booking.StartTime} - ${EndTime} น. รวม ${Math.floor(newDurationMins / 60)} ชม. ${newDurationMins % 60} นาที)${durationReasonStr}`,
                CreateBy: session.user.email || 'SYSTEM',
            });
        }

        // Rescheduling logic
        if (BookingDate && StartTime && EndTime) {
            // Block rescheduling if claimed or cancelled
            if (booking.Status === 3) {
                return NextResponse.json({ success: false, error: 'ไม่สามารถเลื่อนคิวที่เข้ารับบริการไปแล้วได้' }, { status: 400 });
            }
            if (booking.Status === 2) {
                return NextResponse.json({ success: false, error: 'ไม่สามารถเลื่อนคิวที่ถูกยกเลิกไปแล้วได้' }, { status: 400 });
            }

            // Check if date is in the past
            const todayStr = new Date().toISOString().split('T')[0];
            if (BookingDate < todayStr) {
                return NextResponse.json({ success: false, error: 'ไม่สามารถเลือกจองคิวย้อนหลังได้' }, { status: 400 });
            }

            const [newY, newM, newD] = BookingDate.split('-').map(Number);
            const newBookingDate = new Date(Date.UTC(newY, newM - 1, newD, 0, 0, 0, 0));
            const startOfDay = new Date(Date.UTC(newY, newM - 1, newD, 0, 0, 0, 0));
            const endOfDay = new Date(Date.UTC(newY, newM - 1, newD, 23, 59, 59, 999));

            // 1. Check Weekly Off-Day
            const dayOfWeek = newBookingDate.getUTCDay(); // 0=Sun, 1=Mon, ..., 6=Sat in UTC
            const workingDayConfig = await prisma.cM_BranchWorkingDay.findUnique({
                where: {
                    BranchID_DayOfWeek: {
                        BranchID: booking.BranchID,
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

            // 2. Check Special Holiday / Closure
            const specialHoliday = await prisma.cM_BranchHoliday.findFirst({
                where: {
                    BranchID: booking.BranchID,
                    HolidayDate: {
                        gte: startOfDay,
                        lte: endOfDay,
                    },
                    IsActive: true,
                },
            });

            if (specialHoliday) {
                return NextResponse.json({
                    success: false,
                    error: `ขออภัย สาขาปิดให้บริการในวันที่เลือกเนื่องจาก: ${specialHoliday.Description || 'วันหยุดพิเศษ / ปิดทำการชั่วคราว'}`,
                }, { status: 400 });
            }

            // 3. Check Capacity / Overlap (Excluding this booking ID)
            const targetBayId = BayID !== undefined ? (BayID ? parseInt(BayID) : null) : booking.BayID;
            let logContent = '';

            const formatDateStr = (date: Date) => {
                const d = new Date(date);
                return `${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}/${d.getUTCFullYear()}`;
            };
            const oldDateFormatted = formatDateStr(booking.BookingDate);
            const newDateFormatted = `${String(newD).padStart(2, '0')}/${String(newM).padStart(2, '0')}/${newY}`;

            if (targetBayId) {
                // Bay Booking overlap checking
                const targetBay = await prisma.cM_ServiceBay.findUnique({
                    where: { BayID: targetBayId },
                    select: { BayName: true }
                });
                const newBayName = targetBay?.BayName || 'ไม่ระบุช่องซ่อม';

                let oldBayName = 'ไม่ระบุช่องซ่อม';
                if (booking.BayID) {
                    const oldBay = await prisma.cM_ServiceBay.findUnique({
                        where: { BayID: booking.BayID },
                        select: { BayName: true }
                    });
                    if (oldBay) oldBayName = oldBay.BayName;
                }

                const bayBookings = await prisma.cM_Booking.findMany({
                    where: {
                        BayID: targetBayId,
                        BookingDate: {
                            gte: startOfDay,
                            lte: endOfDay
                        },
                        Status: {
                            in: [0, 1, 3]
                        },
                        BookingID: {
                            not: bookingId
                        }
                    }
                });

                const timeToM = (t: string) => {
                    const [h, m] = t.split(':').map(Number);
                    return h * 60 + m;
                };
                const isOverlapping = (s1: string, e1: string, s2: string, e2: string) => {
                    return timeToM(s1) < timeToM(e2) && timeToM(s2) < timeToM(e1);
                };

                // Check lunch break overlap (12:00 - 13:00)
                const startMin = timeToM(StartTime);
                const endMin = timeToM(EndTime);
                const lunchStart = 12 * 60; // 12:00
                const lunchEnd = 13 * 60;   // 13:00

                if ((startMin >= lunchStart && startMin < lunchEnd) || (endMin > lunchStart && endMin <= lunchEnd)) {
                    return NextResponse.json({
                        success: false,
                        error: 'ช่วงเวลาที่เลือกทับซ้อนกับเวลาพักกลางวันของศูนย์บริการ (12:00 - 13:00 น.)',
                    }, { status: 400 });
                }

                const duplicateBooking = bayBookings.find(b => isOverlapping(StartTime, EndTime, b.StartTime, b.EndTime));
                if (duplicateBooking) {
                    return NextResponse.json({
                        success: false,
                        error: `ช่วงเวลา ${StartTime} - ${EndTime} น. ทับซ้อนกับการจองที่มีอยู่ในช่องซ่อม ${newBayName} (${duplicateBooking.BookingNo})`,
                    }, { status: 400 });
                }

                logContent = `เลื่อนคิวจากวันที่ ${oldDateFormatted} (${booking.StartTime}-${booking.EndTime} น. ช่อง: ${oldBayName}) ไปเป็นวันที่ ${newDateFormatted} (${StartTime}-${EndTime} น. ช่อง: ${newBayName}) เหตุผล: ${RescheduleReason || 'ไม่ได้ระบุ'}`;
            } else {
                // Slot-based Booking capacity checking
                const slotConfig = await prisma.cM_BranchSlotConfig.findFirst({
                    where: {
                        BranchID: booking.BranchID,
                        StartTime,
                        EndTime,
                        IsActive: true,
                    },
                });

                const DEFAULT_SLOTS = [
                    { StartTime: '08:30', EndTime: '10:30', MaxQueue: 2 },
                    { StartTime: '10:30', EndTime: '12:30', MaxQueue: 2 },
                    { StartTime: '13:30', EndTime: '15:30', MaxQueue: 2 },
                    { StartTime: '15:30', EndTime: '17:30', MaxQueue: 2 },
                ];
                const defaultSlot = DEFAULT_SLOTS.find(s => s.StartTime === StartTime && s.EndTime === EndTime);
                const maxCapacity = slotConfig ? slotConfig.MaxQueue : (defaultSlot ? defaultSlot.MaxQueue : 2);

                const activeBookingsCount = await prisma.cM_Booking.count({
                    where: {
                        BranchID: booking.BranchID,
                        BookingDate: {
                            gte: startOfDay,
                            lte: endOfDay,
                        },
                        StartTime,
                        EndTime,
                        Status: {
                            in: [0, 1, 3],
                        },
                        BookingID: {
                            not: bookingId,
                        },
                    },
                });

                if (activeBookingsCount >= maxCapacity) {
                    return NextResponse.json({
                        success: false,
                        error: `ขออภัย สล็อตเวลา ${StartTime} - ${EndTime} คิวเต็มแล้ว (รับได้สูงสุด ${maxCapacity} คิว)`,
                    }, { status: 400 });
                }

                logContent = `เลื่อนคิวจากวันที่ ${oldDateFormatted} (${booking.StartTime}-${booking.EndTime} น.) ไปเป็นวันที่ ${newDateFormatted} (${StartTime}-${EndTime} น.) เหตุผล: ${RescheduleReason || 'ไม่ได้ระบุ'}`;
            }

            // 4. Construct Reschedule Log
            logsToCreate.push({
                LogType: 'RESCHEDULE',
                Content: logContent,
                CreateBy: session.user.email || 'SYSTEM',
            });

            updateData.BookingDate = newBookingDate;
            updateData.StartTime = StartTime;
            updateData.EndTime = EndTime;
        }

        if (logsToCreate.length > 0) {
            updateData.Logs = {
                create: logsToCreate,
            };
        }

        const updatedBooking = await prisma.cM_Booking.update({
            where: { BookingID: bookingId },
            data: updateData,
        });

        // === Create Notifications (broadcast to all CS users) ===
        try {
            const currentUserId = parseInt(session.user.id);
            const branch = await prisma.cM_MsServiceBranch.findUnique({
                where: { BranchID: booking.BranchID },
                select: { BranchName: true },
            });
            const branchName = branch?.BranchName || '';

            // Status change notifications
            if (status !== undefined) {
                const newStatus = parseInt(status);
                if (newStatus === 1) {
                    await notifyCSUsers(
                        bookingId,
                        NOTI_TYPES.BOOKING_APPROVED,
                        `คิว ${booking.BookingNo} ได้รับการอนุมัติแล้ว ✅`,
                        `คิว ${booking.BookingNo} สาขา${branchName} วันที่ ${formatBookingDate(booking.BookingDate)} เวลา ${booking.StartTime}-${booking.EndTime} น. ลูกค้า ${booking.CustomerName} อนุมัติแล้ว`,
                        currentUserId
                    );
                } else if (newStatus === 2) {
                    await notifyCSUsers(
                        bookingId,
                        NOTI_TYPES.BOOKING_CANCELLED,
                        `คิว ${booking.BookingNo} ถูกยกเลิก ❌`,
                        `คิว ${booking.BookingNo} สาขา${branchName} วันที่ ${formatBookingDate(booking.BookingDate)} เวลา ${booking.StartTime}-${booking.EndTime} น. ลูกค้า ${booking.CustomerName} ถูกยกเลิก${cancelReason ? ` เหตุผล: ${cancelReason}` : ''}`,
                        currentUserId
                    );
                }
            }

            // Reschedule notification
            if (BookingDate && StartTime && EndTime) {
                const [newY, newM2, newD2] = BookingDate.split('-').map(Number);
                const newDateStr = `${newD2}/${newM2}/${newY}`;
                await notifyCSUsers(
                    bookingId,
                    NOTI_TYPES.BOOKING_RESCHEDULED,
                    `คิว ${booking.BookingNo} ถูกเลื่อนนัดหมาย 📅`,
                    `คิว ${booking.BookingNo} ลูกค้า ${booking.CustomerName} เลื่อนจากวันที่ ${formatBookingDate(booking.BookingDate)} (${booking.StartTime}-${booking.EndTime}) ไปเป็นวันที่ ${newDateStr} (${StartTime}-${EndTime}) ${RescheduleReason ? `เหตุผล: ${RescheduleReason}` : ''}`,
                    currentUserId
                );
            }
        } catch (notiError) {
            console.error('Error creating notification:', notiError);
        }

        return NextResponse.json({
            success: true,
            data: updatedBooking,
        });
    } catch (error) {
        console.error('Error updating booking status:', error);
        return NextResponse.json(
            { success: false, error: 'Failed to update booking' },
            { status: 500 }
        );
    }
}
