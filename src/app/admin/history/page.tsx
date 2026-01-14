// Admin History Page
// Displays claim history and audit logs

'use client';

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import {
    Card,
    CardContent,
    CardHeader,
    CardTitle,
    StatusBadge,
    LoadingPage,
    Input,
    Button,
} from '@/components/ui';
import { Header } from '@/components/layouts';
import { formatDateTime, formatCurrency, getActionText } from '@/lib/utils';
import { Claim } from '@/types';
import { History, Building, ArrowRight, Search } from 'lucide-react';

function AdminHistoryContent() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const [claims, setClaims] = useState<Claim[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    // Helper to get default dates
    const getDefaultDates = () => {
        const end = new Date();
        const start = new Date();
        start.setDate(start.getDate() - 7);
        return {
            startDate: start.toISOString().split('T')[0],
            endDate: end.toISOString().split('T')[0],
        };
    };

    const defaults = getDefaultDates();
    const [startDate, setStartDate] = useState(searchParams.get('startDate') || defaults.startDate);
    const [endDate, setEndDate] = useState(searchParams.get('endDate') || defaults.endDate);

    useEffect(() => {
        fetchClaims();
    }, [searchParams]);

    const fetchClaims = async () => {
        try {
            const params = new URLSearchParams();
            params.set('pageSize', '50');
            if (searchParams.get('startDate')) params.set('startDate', searchParams.get('startDate')!);
            if (searchParams.get('endDate')) params.set('endDate', searchParams.get('endDate')!);

            const res = await fetch(`/api/claims?${params.toString()}`);
            const data = await res.json();

            if (data.success) {
                // Filter to show only completed claims
                const completedClaims = data.data.filter(
                    (claim: Claim) => claim.Status === 2 || claim.Status === 3
                );
                setClaims(completedClaims);
            }
        } catch (error) {
            console.error('Error fetching claims:', error);
        } finally {
            setIsLoading(false);
        }
    };

    const handleSearch = () => {
        const params = new URLSearchParams();
        if (startDate) params.set('startDate', startDate);
        if (endDate) params.set('endDate', endDate);
        router.push(`/admin/history?${params.toString()}`);
    };

    if (isLoading) return <LoadingPage />;

    return (
        <>
            <Header title="ประวัติเคลม" subtitle="ประวัติการอนุมัติและปฏิเสธเคลม" />

            <div className="mt-6 space-y-6">
                {/* Date Filter */}
                <div className="flex flex-wrap gap-3 items-end">
                    <div className="flex items-center gap-2">
                        <Input
                            type="date"
                            value={startDate}
                            onChange={(e) => setStartDate(e.target.value)}
                            className="w-36"
                        />
                        <span className="text-gray-500">-</span>
                        <Input
                            type="date"
                            value={endDate}
                            onChange={(e) => setEndDate(e.target.value)}
                            className="w-36"
                        />
                    </div>
                    <Button onClick={handleSearch} variant="secondary">
                        <Search className="w-4 h-4 mr-2" />
                        ค้นหา
                    </Button>
                </div>

                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <History className="w-5 h-5" />
                            ประวัติการดำเนินการ ({claims.length} รายการ)
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        {claims.length === 0 ? (
                            <div className="text-center py-12">
                                <History className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                                <p className="text-gray-500">ยังไม่มีประวัติการดำเนินการ</p>
                            </div>
                        ) : (
                            <div className="space-y-3">
                                {claims.map((claim) => (
                                    <Link
                                        key={claim.ClaimID}
                                        href={`/admin/approvals/${claim.ClaimID}`}
                                        className="flex items-center justify-between p-4 bg-gray-50 hover:bg-gray-100 rounded-xl transition-colors group"
                                    >
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2 mb-1">
                                                <span className="font-medium text-gray-900">{claim.ClaimNo}</span>
                                                <StatusBadge status={claim.Status} />
                                            </div>
                                            <p className="text-sm text-gray-600">
                                                {claim.CustomerName} • {claim.CarModel} • {claim.CarRegister}
                                            </p>
                                            <div className="flex items-center gap-4 mt-2 text-xs text-gray-500">
                                                <span className="flex items-center gap-1">
                                                    <Building className="w-3 h-3" />
                                                    {claim.Branch?.BranchName}
                                                </span>
                                                {claim.ApprovedDate && (
                                                    <span>
                                                        {claim.Status === 2 ? 'อนุมัติเมื่อ' : 'ปฏิเสธเมื่อ'}{' '}
                                                        {formatDateTime(claim.ApprovedDate)}
                                                    </span>
                                                )}
                                            </div>
                                            {claim.ApprovalNote && (
                                                <p className="mt-2 text-sm text-gray-600 italic">
                                                    &quot;{claim.ApprovalNote}&quot;
                                                </p>
                                            )}
                                        </div>
                                        <div className="text-right ml-4">
                                            <p className="font-bold text-gray-900">
                                                {formatCurrency(Number(claim.Amount))}
                                            </p>
                                            <ArrowRight className="w-4 h-4 text-gray-400 group-hover:text-blue-600 mt-2 ml-auto" />
                                        </div>
                                    </Link>
                                ))}
                            </div>
                        )}
                    </CardContent>
                </Card>
            </div>
        </>
    );
}

export default function AdminHistoryPage() {
    return (
        <Suspense fallback={<LoadingPage />}>
            <AdminHistoryContent />
        </Suspense>
    );
}
