import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import prisma from '@/lib/prisma';
import { authOptions } from '@/lib/auth';
import { getAllowedBookingType, isCSRole } from '@/lib/permissions';
import { ACTIVE_STATUSES, isQueueStatus } from '@/lib/queue-status';
import { normalizePlate } from '@/lib/queue-service';
import { getBangkokDateString } from '@/lib/utils';
import {
    evaluateQueueSla,
    MatchedClaimForSla,
    QueueForSla,
    summarizeServiceSla,
} from '@/lib/service-sla';

export const dynamic = 'force-dynamic';

const DAY_MS = 24 * 60 * 60 * 1000;

function parseDateParam(dateStr: string | null, endOfDay = false): Date | null {
    if (!dateStr) return null;
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr.trim());
    if (!match) return null;
    const y = Number(match[1]);
    const m = Number(match[2]);
    const d = Number(match[3]);
    if (endOfDay) {
        return new Date(Date.UTC(y, m - 1, d, 23, 59, 59, 999));
    }
    return new Date(Date.UTC(y, m - 1, d, 0, 0, 0, 0));
}

function formatUtcYmd(d: Date | string): string {
    const dt = typeof d === 'string' ? new Date(d) : d;
    return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}`;
}

export async function GET(request: NextRequest) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user) {
            return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
        }

        const role = session.user.role;
        if (role !== 'ADMIN' && role !== 'SERVICE_CENTER' && !isCSRole(role)) {
            return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
        }

        const { searchParams } = new URL(request.url);
        const branchId = searchParams.get('branchId');
        const dateFrom = searchParams.get('dateFrom');
        const dateTo = searchParams.get('dateTo');
        const search = searchParams.get('search')?.trim() || '';
        const status = searchParams.get('status') || 'all';
        const visitType = searchParams.get('visitType') || 'all';
        const slaResult = searchParams.get('slaResult') || 'all';

        // Role-based branch scoping
        let targetBranchId: number | undefined = undefined;
        if (role === 'SERVICE_CENTER') {
            targetBranchId = Number(session.user.branchId) || -1;
        } else if (branchId && branchId !== 'all') {
            const parsed = parseInt(branchId, 10);
            if (!Number.isNaN(parsed)) {
                targetBranchId = parsed;
            }
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const whereClause: Record<string, any> = {};

        const allowedType = getAllowedBookingType(session.user);
        if (allowedType) {
            whereClause.BookingType = allowedType;
        }

        if (targetBranchId !== undefined) {
            whereClause.BranchID = targetBranchId;
        }

        const startDate = parseDateParam(dateFrom, false);
        const endDate = parseDateParam(dateTo, true);
        if (startDate || endDate) {
            whereClause.QueueDate = {
                ...(startDate ? { gte: startDate } : {}),
                ...(endDate ? { lte: endDate } : {}),
            };
        }

        if (visitType === 'BOOKING') {
            whereClause.BookingID = { not: null };
        } else if (visitType === 'WALK_IN') {
            whereClause.BookingID = null;
        }

        if (status && status !== 'all') {
            if (status === 'ACTIVE') {
                whereClause.Status = { in: ACTIVE_STATUSES };
            } else if (isQueueStatus(status)) {
                whereClause.Status = status;
            }
        }

        if (search) {
            const normalizedSearch = search.replace(/\s+/g, '');
            whereClause.OR = [
                { QueueLabel: { contains: search } },
                { CarRegister: { contains: normalizedSearch } },
                { CustomerName: { contains: search } },
                { CustomerPhone: { contains: normalizedSearch } },
                { Booking: { BookingNo: { contains: search } } },
            ];
        }

        // Fetch queues in chunks of 500 to avoid SQL Server 2100 parameter limit on `include`
        const PAGE_SIZE = 500;
        let queues: QueueForSla[] = [];
        let skip = 0;
        let hasMore = true;

        while (hasMore) {
            const batch = await prisma.cM_Queue.findMany({
                where: whereClause,
                include: {
                    Branch: {
                        select: { BranchName: true },
                    },
                    ServiceType: {
                        select: { ServiceTypeID: true, Code: true, Name: true, RequiresMileage: true },
                    },
                    Booking: {
                        select: {
                            BookingID: true,
                            BookingNo: true,
                            BookingDate: true,
                            StartTime: true,
                            EndTime: true,
                            DurationMinutes: true,
                            Mileage: true,
                            CarModel: true,
                            ServiceTypeID: true,
                            ServiceType: {
                                select: { ServiceTypeID: true, Code: true, Name: true, RequiresMileage: true },
                            },
                            Claim: {
                                select: { ClaimNo: true, Mileage: true, CarModel: true },
                            },
                        },
                    },
                    Logs: {
                        select: {
                            LogID: true,
                            FromStatus: true,
                            ToStatus: true,
                            CreateDate: true,
                            ActionByName: true,
                            Note: true,
                        },
                        orderBy: { CreateDate: 'asc' },
                    },
                },
                orderBy: [
                    { QueueDate: 'desc' },
                    { CheckInDate: 'desc' },
                    { QueueID: 'desc' },
                ],
                take: PAGE_SIZE,
                skip,
            });

            queues = queues.concat(batch as unknown as QueueForSla[]);
            if (batch.length < PAGE_SIZE) {
                hasMore = false;
            } else {
                skip += PAGE_SIZE;
            }
        }

        const flatRates = queues.length > 0
            ? await prisma.cM_FlatRate.findMany({
                where: { IsActive: true },
                select: {
                    ServiceTypeID: true,
                    MileageID: true,
                    DurationMinutes: true,
                    Description: true,
                    Mileage: { select: { Value: true } },
                    CarModel: { select: { ModelName: true, Brand: true } },
                },
            })
            : [];

        // Match same-day CM_DocClaim for Walk-in (or bookings without ClaimID) so mileage-based Flat Rate can be resolved
        const needsClaimMatch = queues.some(
            (q) => !q.Booking?.Claim && (!q.Booking || !(q.Booking.Mileage > 0))
        );

        const claimByBranchPlateDate = new Map<string, MatchedClaimForSla>();
        if (needsClaimMatch && queues.length > 0) {
            const queueTimes = queues.map((q) => new Date(q.QueueDate).getTime());
            const minDate = new Date(Math.min(...queueTimes) - DAY_MS);
            const maxDate = new Date(Math.max(...queueTimes) + 2 * DAY_MS);

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const claimWhere: Record<string, any> = {
                IsActive: true,
                Status: { not: 3 }, // exclude rejected claims
                ...(targetBranchId !== undefined ? { BranchID: targetBranchId } : {}),
                OR: [
                    { ServiceDate: { gte: minDate, lte: maxDate } },
                    { ServiceDate: null, ClaimDate: { gte: minDate, lte: maxDate } },
                ],
            };

            const claims = await prisma.cM_DocClaim.findMany({
                where: claimWhere,
                select: {
                    BranchID: true,
                    CarRegister: true,
                    CarModel: true,
                    Mileage: true,
                    ClaimNo: true,
                    ServiceDate: true,
                    ClaimDate: true,
                },
                orderBy: { ClaimID: 'desc' },
            });

            for (const c of claims) {
                const ymd = getBangkokDateString(c.ServiceDate ?? c.ClaimDate);
                const key = `${c.BranchID}:${normalizePlate(c.CarRegister)}:${ymd}`;
                if (!claimByBranchPlateDate.has(key)) {
                    claimByBranchPlateDate.set(key, {
                        ClaimNo: c.ClaimNo,
                        Mileage: c.Mileage,
                        CarModel: c.CarModel,
                    });
                }
            }
        }

        const now = new Date();
        const evaluatedItems = queues.map((q) => {
            const key = `${q.BranchID}:${normalizePlate(q.CarRegister)}:${formatUtcYmd(q.QueueDate)}`;
            const matchedClaim = q.Booking?.Claim ?? claimByBranchPlateDate.get(key) ?? null;
            return evaluateQueueSla({ ...q, MatchedClaim: matchedClaim }, flatRates, now);
        });
        const summary = summarizeServiceSla(evaluatedItems);

        const filteredItems =
            slaResult === 'PASS'
                ? evaluatedItems.filter((item) => item.SlaStatus === 'PASS')
                : slaResult === 'OVER'
                    ? evaluatedItems.filter(
                        (item) => item.SlaStatus === 'OVER' || item.SlaStatus === 'IN_PROGRESS_OVER'
                    )
                    : slaResult === 'NO_SLA'
                        ? evaluatedItems.filter((item) => item.SlaStatus === 'NO_SLA')
                        : evaluatedItems;

        return NextResponse.json({
            success: true,
            data: {
                items: filteredItems,
                summary,
            },
        });
    } catch (error) {
        console.error('Error fetching service SLA report:', error);
        return NextResponse.json(
            { success: false, error: 'Failed to fetch service SLA report' },
            { status: 500 }
        );
    }
}
