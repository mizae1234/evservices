// Admin Reports Page
// View and export claims data to Excel

'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import * as XLSX from 'xlsx';
import {
    Card,
    CardContent,
    CardHeader,
    CardTitle,
    Button,
    Input,
    Select,
    LoadingPage,
} from '@/components/ui';
import { Header } from '@/components/layouts';
import { formatDate, formatCurrency } from '@/lib/utils';
import { Claim, PaginatedResponse, CLAIM_STATUS } from '@/types';
import { Search, Download, FileSpreadsheet } from 'lucide-react';

const statusOptions = [
    { value: 'all', label: 'ทุกสถานะ' },
    { value: '0', label: 'แบบร่าง' },
    { value: '1', label: 'รออนุมัติ' },
    { value: '2', label: 'อนุมัติแล้ว' },
    { value: '3', label: 'ปฏิเสธ' },
    { value: '4', label: 'ขอข้อมูลเพิ่ม' },
];

const getStatusText = (status: number): string => {
    switch (status) {
        case 0: return 'แบบร่าง';
        case 1: return 'รออนุมัติ';
        case 2: return 'อนุมัติแล้ว';
        case 3: return 'ปฏิเสธ';
        case 4: return 'ขอข้อมูลเพิ่ม';
        default: return '-';
    }
};

function AdminReportsContent() {
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

    // Default status to '2' (Approved) if no param provided, or use logic in useEffect
    const [status, setStatus] = useState(searchParams.get('status') ?? '2');
    const [startDate, setStartDate] = useState(searchParams.get('startDate') || defaults.startDate);
    const [endDate, setEndDate] = useState(searchParams.get('endDate') || defaults.endDate);
    const [search, setSearch] = useState(searchParams.get('search') || '');

    useEffect(() => {
        fetchClaims();
    }, [searchParams]);

    const fetchClaims = async () => {
        setIsLoading(true);
        try {
            const params = new URLSearchParams();
            params.set('pageSize', '1000'); // Get all for report

            const statusVal = searchParams.get('status');
            const searchVal = searchParams.get('search');

            // Handle status filter
            if (statusVal === 'all') {
                // Explicitly all statuses - do not set status param for API
            } else if (statusVal) {
                params.set('status', statusVal);
            } else {
                // First load / No param - default to approved
                params.set('status', '2');
            }

            if (searchParams.get('startDate')) params.set('startDate', searchParams.get('startDate')!);
            if (searchParams.get('endDate')) params.set('endDate', searchParams.get('endDate')!);
            if (searchVal) params.set('search', searchVal);

            const res = await fetch(`/api/claims?${params.toString()}`);
            const data: PaginatedResponse<Claim> = await res.json();

            if (data.success) {
                setClaims(data.data);
            }
        } catch (error) {
            console.error('Error fetching claims:', error);
        } finally {
            setIsLoading(false);
        }
    };

    const handleSearch = () => {
        const params = new URLSearchParams();
        // If status is empty (from old logic) or 'all', set it to 'all'
        // If it's a number, set it as is.
        if (status === '' || status === 'all') {
            params.set('status', 'all');
        } else {
            params.set('status', status);
        }

        if (startDate) params.set('startDate', startDate);
        if (endDate) params.set('endDate', endDate);
        if (search) params.set('search', search);

        router.push(`/admin/reports?${params.toString()}`);
    };

    const handleExportExcel = () => {
        // Prepare data for Excel
        const excelData = claims.map((claim) => ({
            'เลขที่เคลม': claim.ClaimNo,
            'วันที่เคลม': formatDate(claim.ClaimDate),
            'รายละเอียด': claim.ClaimDetail || '-',
            'จำนวนเงิน': Number(claim.Amount),
            'สาขา': claim.Branch?.BranchName || '-',
            'ระยะทาง': claim.Mileage || 0,
            'รุ่นรถ': claim.CarModel,
            'ทะเบียนรถ': claim.CarRegister,
            'ชื่อลูกค้า': claim.CustomerName,
            'ไมล์ล่าสุด': claim.LastMileage || 0,
            'VIN Number': (claim as unknown as { VinNo?: string }).VinNo || '-',
            'สถานะ': getStatusText(Number(claim.Status)),
        }));

        // Create workbook and worksheet
        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.json_to_sheet(excelData);

        // Set column widths
        ws['!cols'] = [
            { wch: 18 }, // เลขที่เคลม
            { wch: 12 }, // วันที่เคลม
            { wch: 40 }, // รายละเอียด
            { wch: 12 }, // จำนวนเงิน
            { wch: 20 }, // สาขา
            { wch: 10 }, // ระยะทาง
            { wch: 25 }, // รุ่นรถ
            { wch: 12 }, // ทะเบียนรถ
            { wch: 20 }, // ชื่อลูกค้า
            { wch: 10 }, // ไมล์ล่าสุด
            { wch: 20 }, // VIN Number
            { wch: 12 }, // สถานะ
        ];

        XLSX.utils.book_append_sheet(wb, ws, 'รายงานเคลม');

        // Generate filename with dates
        const filename = `รายงานเคลม_${startDate}_${endDate}.xlsx`;

        // Save file
        XLSX.writeFile(wb, filename);
    };

    return (
        <>
            <Header title="รายงานเคลม" subtitle="ดูและส่งออกข้อมูลเคลม" />

            <div className="mt-6 space-y-6">
                {/* Filters */}
                <div className="flex flex-wrap gap-3 items-end">
                    <div className="w-40">
                        <label className="block text-sm font-medium text-gray-700 mb-1">สถานะ</label>
                        <Select
                            options={statusOptions}
                            value={status}
                            onChange={(e) => setStatus(e.target.value)}
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">ค้นหา</label>
                        <Input
                            placeholder="เลขเคลม, ทะเบียน, ชื่อลูกค้า"
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            className="w-60"
                        />
                    </div>
                    <div className="flex items-end gap-2">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">วันเริ่มต้น</label>
                            <Input
                                type="date"
                                value={startDate}
                                onChange={(e) => setStartDate(e.target.value)}
                                className="w-36"
                            />
                        </div>
                        <span className="text-gray-500 pb-2">-</span>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">วันสิ้นสุด</label>
                            <Input
                                type="date"
                                value={endDate}
                                onChange={(e) => setEndDate(e.target.value)}
                                className="w-36"
                            />
                        </div>
                    </div>
                    <Button onClick={handleSearch} variant="secondary">
                        <Search className="w-4 h-4 mr-2" />
                        ค้นหา
                    </Button>
                    <Button onClick={handleExportExcel} disabled={claims.length === 0}>
                        <Download className="w-4 h-4 mr-2" />
                        Export Excel
                    </Button>
                </div>

                {/* Report Table */}
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <FileSpreadsheet className="w-5 h-5" />
                            ข้อมูลเคลม ({claims.length} รายการ)
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="p-0">
                        {isLoading ? (
                            <LoadingPage />
                        ) : claims.length === 0 ? (
                            <div className="text-center py-12">
                                <p className="text-gray-500">ไม่พบรายการเคลม</p>
                            </div>
                        ) : (
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm">
                                    <thead className="bg-gray-50 border-b border-gray-200">
                                        <tr>
                                            <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">
                                                เลขเคลม
                                            </th>
                                            <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">
                                                วันที่
                                            </th>
                                            <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">
                                                รายละเอียด
                                            </th>
                                            <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase">
                                                จำนวนเงิน
                                            </th>
                                            <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">
                                                สาขา
                                            </th>
                                            <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase">
                                                ระยะทาง
                                            </th>
                                            <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">
                                                รุ่นรถ
                                            </th>
                                            <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">
                                                ทะเบียน
                                            </th>
                                            <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">
                                                ลูกค้า
                                            </th>
                                            <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase">
                                                ไมล์ล่าสุด
                                            </th>
                                            <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">
                                                VIN
                                            </th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-200">
                                        {claims.map((claim) => (
                                            <tr key={claim.ClaimID} className="hover:bg-gray-50">
                                                <td className="px-4 py-3 whitespace-nowrap font-medium text-gray-900">
                                                    {claim.ClaimNo}
                                                </td>
                                                <td className="px-4 py-3 whitespace-nowrap text-gray-600">
                                                    {formatDate(claim.ClaimDate)}
                                                </td>
                                                <td className="px-4 py-3 text-gray-600 max-w-xs truncate">
                                                    {claim.ClaimDetail || '-'}
                                                </td>
                                                <td className="px-4 py-3 whitespace-nowrap text-right font-medium text-gray-900">
                                                    {formatCurrency(Number(claim.Amount))}
                                                </td>
                                                <td className="px-4 py-3 whitespace-nowrap text-gray-600">
                                                    {claim.Branch?.BranchName || '-'}
                                                </td>
                                                <td className="px-4 py-3 whitespace-nowrap text-right text-gray-600">
                                                    {claim.Mileage?.toLocaleString() || '-'}
                                                </td>
                                                <td className="px-4 py-3 whitespace-nowrap text-gray-600">
                                                    {claim.CarModel}
                                                </td>
                                                <td className="px-4 py-3 whitespace-nowrap text-gray-600">
                                                    {claim.CarRegister}
                                                </td>
                                                <td className="px-4 py-3 whitespace-nowrap text-gray-600">
                                                    {claim.CustomerName}
                                                </td>
                                                <td className="px-4 py-3 whitespace-nowrap text-right text-gray-600">
                                                    {claim.LastMileage?.toLocaleString() || '-'}
                                                </td>
                                                <td className="px-4 py-3 whitespace-nowrap text-gray-600">
                                                    {(claim as unknown as { VinNo?: string }).VinNo || '-'}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </CardContent>
                </Card>
            </div>
        </>
    );
}

export default function AdminReportsPage() {
    return (
        <Suspense fallback={<LoadingPage />}>
            <AdminReportsContent />
        </Suspense>
    );
}
