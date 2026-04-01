import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { CLAIM_STATUS } from '@/types';

// Helper to calculate turnaround difference
function calculateTAT(start: Date, end: Date) {
    const diffMs = end.getTime() - start.getTime();
    if (diffMs < 0) return { ms: 0, days: 0, hours: 0, minutes: 0, totalHours: 0 };
    
    const diffMinutes = Math.floor(diffMs / (1000 * 60));
    const days = Math.floor(diffMinutes / (60 * 24));
    const hours = Math.floor((diffMinutes % (60 * 24)) / 60);
    const minutes = diffMinutes % 60;
    
    const totalHours = Math.floor(diffMinutes / 60);
    return { ms: diffMs, days, hours, minutes, totalHours };
}

export async function GET(request: NextRequest) {
    try {
        const session = await getServerSession(authOptions);

        if (!session?.user) {
            return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
        }

        // Must be admin to view this report usually, but let's allow service center to see their own
        const isAdmin = session.user.role === 'ADMIN';

        const searchParams = request.nextUrl.searchParams;
        const startDate = searchParams.get('startDate');
        const endDate = searchParams.get('endDate');
        const submittedStartDate = searchParams.get('submittedStartDate');
        const submittedEndDate = searchParams.get('submittedEndDate');

        // Build where clause
        const where: any = { 
            IsActive: true,
            Status: CLAIM_STATUS.APPROVED
        };

        if (!isAdmin && session.user.branchId) {
            where.BranchID = session.user.branchId;
        }

        if (startDate || endDate) {
            where.ApprovedDate = {};
            if (startDate) {
                where.ApprovedDate.gte = new Date(startDate);
            }
            if (endDate) {
                const end = new Date(endDate);
                end.setDate(end.getDate() + 1); // include the end date
                where.ApprovedDate.lt = end;
            }
        }

        // Fetch claims in chunks to avoid SQL Server 2100 parameter limit on `include` queries
        const PAGE_SIZE = 500;
        let claims: any[] = [];
        let hasMore = true;
        let skip = 0;

        while (hasMore) {
            const batch = await prisma.cM_DocClaim.findMany({
                where,
                include: {
                    Branch: true,
                    Logs: {
                        where: { Action: 'SUBMITTED' },
                        orderBy: { ActionDate: 'desc' } // Get the latest submission
                    }
                },
                orderBy: { ApprovedDate: 'desc' },
                take: PAGE_SIZE,
                skip: skip
            });

            claims = claims.concat(batch);
            if (batch.length < PAGE_SIZE) {
                hasMore = false;
            } else {
                skip += PAGE_SIZE;
            }
        }

        // Calculate Turnaround Times
        let totalMs = 0;
        let validClaimsCount = 0;

        const processedClaims = claims.map(claim => {
            // Find the most recent "SUBMITTED" log before approval
            // The single SUBMITTED log is fetched via Prisma relations above
            const log = claim.Logs[0];
            const submitDate = log ? log.ActionDate : claim.ClaimDate; // Fallback 
            
            let tat = { ms: 0, days: 0, hours: 0, minutes: 0, totalHours: 0 };
            
            if (submitDate && claim.ApprovedDate) {
                tat = calculateTAT(submitDate, claim.ApprovedDate);
                totalMs += tat.ms;
                validClaimsCount++;
            }

            const turntext = `${tat.days > 0 ? `${tat.days} วัน ` : ''}${tat.hours > 0 ? `${tat.hours} ชม. ` : ''}${tat.minutes} นาที`;

            return {
                ClaimID: claim.ClaimID,
                ClaimNo: claim.ClaimNo,
                Amount: claim.Amount,
                BranchName: claim.Branch?.BranchName || '-',
                CustomerName: claim.CustomerName,
                SubmittedDate: log ? log.ActionDate : claim.ClaimDate,
                ApprovedDate: claim.ApprovedDate,
                TurnaroundDays: tat.days,
                TurnaroundHours: tat.hours,
                TurnaroundMinutes: tat.minutes,
                TurnaroundText: turntext.trim(),
                TotalTurnaroundHours: tat.totalHours
            };
        });

        // Filter by submitted date range (post-processing since SubmittedDate comes from Logs)
        let filteredClaims = processedClaims;
        if (submittedStartDate) {
            const sStart = new Date(submittedStartDate);
            filteredClaims = filteredClaims.filter(c => c.SubmittedDate && new Date(c.SubmittedDate) >= sStart);
        }
        if (submittedEndDate) {
            const sEnd = new Date(submittedEndDate);
            sEnd.setDate(sEnd.getDate() + 1); // include end date
            filteredClaims = filteredClaims.filter(c => c.SubmittedDate && new Date(c.SubmittedDate) < sEnd);
        }

        // Re-compute averages based on filtered results
        let filteredTotalMs = 0;
        let filteredValidCount = 0;
        filteredClaims.forEach(c => {
            if (c.SubmittedDate && c.ApprovedDate) {
                const diffMs = new Date(c.ApprovedDate).getTime() - new Date(c.SubmittedDate).getTime();
                if (diffMs > 0) {
                    filteredTotalMs += diffMs;
                    filteredValidCount++;
                }
            }
        });

        // Compute Averages
        let avgDays = 0;
        let avgHours = 0;
        
        if (filteredValidCount > 0) {
            const avgMs = filteredTotalMs / filteredValidCount;
            const avgTotalHours = Math.floor(avgMs / (1000 * 60 * 60));
            avgDays = Math.floor(avgTotalHours / 24);
            avgHours = avgTotalHours % 24;
        }

        return NextResponse.json({
            success: true,
            data: {
                claims: filteredClaims,
                average: {
                    days: avgDays,
                    hours: avgHours
                },
                totalProcessed: filteredValidCount
            }
        });
    } catch (error) {
        console.error('Error fetching TAT report:', error);
        return NextResponse.json(
            { success: false, error: 'Failed to fetch turnaround time report' },
            { status: 500 }
        );
    }
}
