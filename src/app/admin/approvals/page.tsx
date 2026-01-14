// Admin Claims List Page
// Displays all claims with approval actions

'use client';

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import {
    Card,
    CardContent,
    CardHeader,
    CardTitle,
    Button,
    Input,
    Select,
    StatusBadge,
    LoadingPage,
} from '@/components/ui';
import { Header } from '@/components/layouts';
import { formatDate, formatCurrency } from '@/lib/utils';
import { Claim, PaginatedResponse } from '@/types';
import { Search, Eye, Building, ChevronLeft, ChevronRight } from 'lucide-react';

const statusOptions = [
    { value: '', label: 'ทุกสถานะ' },
    { value: '1', label: 'รออนุมัติ' },
    { value: '0', label: 'แบบร่าง' },
    { value: '2', label: 'อนุมัติแล้ว' },
    { value: '3', label: 'ปฏิเสธ' },
    { value: '4', label: 'ขอข้อมูลเพิ่ม' },
];

function AdminClaimsContent() {
    const router = useRouter();
    const searchParams = useSearchParams();

    const [claims, setClaims] = useState<Claim[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [pagination, setPagination] = useState({
        total: 0,
        page: 1,
        pageSize: 10,
        totalPages: 0,
    });

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

    const [search, setSearch] = useState(searchParams.get('search') || '');
    const [status, setStatus] = useState(searchParams.get('status') || '');
    const [startDate, setStartDate] = useState(searchParams.get('startDate') || defaults.startDate);
    const [endDate, setEndDate] = useState(searchParams.get('endDate') || defaults.endDate);

    useEffect(() => {
        fetchClaims();
    }, [searchParams]);

    const fetchClaims = async () => {
        setIsLoading(true);
        try {
            const params = new URLSearchParams();
            params.set('page', searchParams.get('page') || '1');
            params.set('pageSize', '10');
            if (searchParams.get('search')) params.set('search', searchParams.get('search')!);
            if (searchParams.get('status')) params.set('status', searchParams.get('status')!);
            if (searchParams.get('startDate')) params.set('startDate', searchParams.get('startDate')!);
            if (searchParams.get('endDate')) params.set('endDate', searchParams.get('endDate')!);

            const res = await fetch(`/api/claims?${params.toString()}`);
            const data: PaginatedResponse<Claim> = await res.json();

            if (data.success) {
                setClaims(data.data);
                setPagination({
                    total: data.total,
                    page: data.page,
                    pageSize: data.pageSize,
                    totalPages: data.totalPages,
                });
            }
        } catch (error) {
            console.error('Error fetching claims:', error);
        } finally {
            setIsLoading(false);
        }
    };

    const handleSearch = () => {
        const params = new URLSearchParams();
        if (search) params.set('search', search);
        if (status) params.set('status', status);
        if (startDate) params.set('startDate', startDate);
        if (endDate) params.set('endDate', endDate);
        params.set('page', '1');
        router.push(`/admin/approvals?${params.toString()}`);
    };

    const handlePageChange = (newPage: number) => {
        const params = new URLSearchParams(searchParams.toString());
        params.set('page', newPage.toString());
        router.push(`/admin/approvals?${params.toString()}`);
    };

    return (
        <>
            <Header title="อนุมัติเคลม" subtitle="ตรวจสอบและอนุมัติรายการเคลม" />

            <div className="mt-6 space-y-6">
                {/* Filters */}
                <div className="flex flex-wrap gap-3 items-end">
                    <div className="flex-1 min-w-[200px] max-w-md">
                        <Input
                            placeholder="ค้นหาเลขเคลม, ชื่อลูกค้า, ทะเบียนรถ..."
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                        />
                    </div>
                    <div className="w-40">
                        <Select
                            options={statusOptions}
                            value={status}
                            onChange={(e) => setStatus(e.target.value)}
                        />
                    </div>
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

                {/* Claims Table */}
                <Card>
                    <CardHeader>
                        <CardTitle>รายการเคลมทั้งหมด ({pagination.total} รายการ)</CardTitle>
                    </CardHeader>
                    <CardContent className="p-0">
                        {isLoading ? (
                            <LoadingPage />
                        ) : claims.length === 0 ? (
                            <div className="text-center py-12">
                                <p className="text-gray-500">ไม่พบรายการเคลม</p>
                            </div>
                        ) : (
                            <>
                                <div className="overflow-x-auto">
                                    <table className="w-full">
                                        <thead className="bg-gray-50 border-b border-gray-200">
                                            <tr>
                                                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase">
                                                    เลขเคลม
                                                </th>
                                                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase">
                                                    สาขา
                                                </th>
                                                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase">
                                                    ลูกค้า
                                                </th>
                                                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase">
                                                    ทะเบียน
                                                </th>
                                                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase">
                                                    จำนวนเงิน
                                                </th>
                                                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase">
                                                    สถานะ
                                                </th>
                                                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase">
                                                    วันที่
                                                </th>
                                                <th className="px-6 py-3 text-right text-xs font-semibold text-gray-600 uppercase">
                                                    จัดการ
                                                </th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-gray-200">
                                            {claims.map((claim) => (
                                                <tr
                                                    key={claim.ClaimID}
                                                    className={`hover:bg-gray-50 ${claim.Status === 1 ? 'bg-yellow-50' : ''
                                                        }`}
                                                >
                                                    <td className="px-6 py-4 whitespace-nowrap">
                                                        <span className="font-medium text-gray-900">
                                                            {claim.ClaimNo}
                                                        </span>
                                                    </td>
                                                    <td className="px-6 py-4 whitespace-nowrap">
                                                        <div className="flex items-center gap-1 text-sm text-gray-600">
                                                            <Building className="w-4 h-4" />
                                                            {claim.Branch?.BranchName || '-'}
                                                        </div>
                                                    </td>
                                                    <td className="px-6 py-4 whitespace-nowrap text-gray-700">
                                                        {claim.CustomerName}
                                                    </td>
                                                    <td className="px-6 py-4 whitespace-nowrap text-gray-700">
                                                        {claim.CarRegister}
                                                    </td>
                                                    <td className="px-6 py-4 whitespace-nowrap font-medium text-gray-900">
                                                        {formatCurrency(Number(claim.Amount))}
                                                    </td>
                                                    <td className="px-6 py-4 whitespace-nowrap">
                                                        <StatusBadge status={claim.Status} />
                                                    </td>
                                                    <td className="px-6 py-4 whitespace-nowrap text-gray-500 text-sm">
                                                        {formatDate(claim.ClaimDate)}
                                                    </td>
                                                    <td className="px-6 py-4 whitespace-nowrap text-right">
                                                        <Link href={`/admin/approvals/${claim.ClaimID}`}>
                                                            <Button
                                                                variant={claim.Status === 1 ? 'primary' : 'ghost'}
                                                                size="sm"
                                                            >
                                                                <Eye className="w-4 h-4 mr-1" />
                                                                {claim.Status === 1 ? 'ตรวจสอบ' : 'ดู'}
                                                            </Button>
                                                        </Link>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>

                                {/* Pagination */}
                                {pagination.totalPages > 1 && (
                                    <div className="flex items-center justify-between px-6 py-4 border-t border-gray-200">
                                        <p className="text-sm text-gray-500">
                                            แสดง {(pagination.page - 1) * pagination.pageSize + 1} -{' '}
                                            {Math.min(pagination.page * pagination.pageSize, pagination.total)}{' '}
                                            จาก {pagination.total} รายการ
                                        </p>
                                        <div className="flex gap-2">
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                onClick={() => handlePageChange(pagination.page - 1)}
                                                disabled={pagination.page === 1}
                                            >
                                                <ChevronLeft className="w-4 h-4" />
                                            </Button>
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                onClick={() => handlePageChange(pagination.page + 1)}
                                                disabled={pagination.page === pagination.totalPages}
                                            >
                                                <ChevronRight className="w-4 h-4" />
                                            </Button>
                                        </div>
                                    </div>
                                )}
                            </>
                        )}
                    </CardContent>
                </Card>
            </div>
        </>
    );
}

export default function AdminClaimsPage() {
    return (
        <Suspense fallback={<LoadingPage />}>
            <AdminClaimsContent />
        </Suspense>
    );
}
