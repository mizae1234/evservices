// Admin Turnaround Time (TAT) Reports Page
// View and export turnaround time for approved claims

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
    LoadingPage,
} from '@/components/ui';
import { Header } from '@/components/layouts';
import { formatDateTime } from '@/lib/utils';
import { Search, Download, FileSpreadsheet, Clock, CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react';

interface TATClaim {
    ClaimID: number;
    ClaimNo: string;
    Amount: number;
    BranchName: string;
    CustomerName: string;
    SubmittedDate: string | null;
    ApprovedDate: string | null;
    TurnaroundDays: number;
    TurnaroundHours: number;
    TurnaroundMinutes: number;
    TurnaroundText: string;
    TotalTurnaroundHours: number;
}

interface TATData {
    claims: TATClaim[];
    average: { days: number, hours: number };
    totalProcessed: number;
}

function TATReportsContent() {
    const router = useRouter();
    const searchParams = useSearchParams();

    const [data, setData] = useState<TATData>({ claims: [], average: { days: 0, hours: 0 }, totalProcessed: 0 });
    const [isLoading, setIsLoading] = useState(true);
    const [currentPage, setCurrentPage] = useState(1);
    const ITEMS_PER_PAGE = 50;

    const getDefaultDates = () => {
        const end = new Date();
        const start = new Date();
        start.setDate(start.getDate() - 30); // Default to last 30 days
        return {
            startDate: start.toISOString().split('T')[0],
            endDate: end.toISOString().split('T')[0],
        };
    };

    const defaults = getDefaultDates();

    const activeStartDate = searchParams.get('startDate') || defaults.startDate;
    const activeEndDate = searchParams.get('endDate') || defaults.endDate;

    const [startDate, setStartDate] = useState(activeStartDate);
    const [endDate, setEndDate] = useState(activeEndDate);

    const activeSubmittedStart = searchParams.get('submittedStartDate') || '';
    const activeSubmittedEnd = searchParams.get('submittedEndDate') || '';
    const [submittedStartDate, setSubmittedStartDate] = useState(activeSubmittedStart);
    const [submittedEndDate, setSubmittedEndDate] = useState(activeSubmittedEnd);

    const [sortConfig, setSortConfig] = useState<{ key: keyof TATClaim | 'TurnaroundText', direction: 'asc' | 'desc' } | null>({ key: 'TotalTurnaroundHours', direction: 'desc' });

    useEffect(() => {
        fetchTATData();
    }, [searchParams]);

    const fetchTATData = async () => {
        setIsLoading(true);
        try {
            const params = new URLSearchParams();
            if (searchParams.get('startDate')) params.set('startDate', searchParams.get('startDate')!);
            if (searchParams.get('endDate')) params.set('endDate', searchParams.get('endDate')!);
            if (searchParams.get('submittedStartDate')) params.set('submittedStartDate', searchParams.get('submittedStartDate')!);
            if (searchParams.get('submittedEndDate')) params.set('submittedEndDate', searchParams.get('submittedEndDate')!);
            
            const res = await fetch(`/api/reports/turnaround-time?${params.toString()}`);
            const result = await res.json();

            if (result.success) {
                setData(result.data);
                setCurrentPage(1); // Reset page on new data
            }
        } catch (error) {
            console.error('Error fetching TAT report:', error);
        } finally {
            setIsLoading(false);
        }
    };

    const handleSearch = () => {
        const params = new URLSearchParams();
        if (startDate) params.set('startDate', startDate);
        if (endDate) params.set('endDate', endDate);
        if (submittedStartDate) params.set('submittedStartDate', submittedStartDate);
        if (submittedEndDate) params.set('submittedEndDate', submittedEndDate);
        router.push(`/admin/reports/turnaround-time?${params.toString()}`);
    };

    const sortedClaims = [...data.claims].sort((a, b) => {
        if (!sortConfig) return 0;
        let aValue: any = a[sortConfig.key as keyof TATClaim];
        let bValue: any = b[sortConfig.key as keyof TATClaim];
        
        if (sortConfig.key === 'TurnaroundText' || sortConfig.key === 'TotalTurnaroundHours') {
            aValue = a.TurnaroundDays * 1440 + a.TurnaroundHours * 60 + a.TurnaroundMinutes;
            bValue = b.TurnaroundDays * 1440 + b.TurnaroundHours * 60 + b.TurnaroundMinutes;
        }

        // Handle date string sorting
        if (sortConfig.key === 'SubmittedDate' || sortConfig.key === 'ApprovedDate') {
            aValue = aValue ? new Date(aValue as string).getTime() : 0;
            bValue = bValue ? new Date(bValue as string).getTime() : 0;
        }
        
        if (aValue < bValue) return sortConfig.direction === 'asc' ? -1 : 1;
        if (aValue > bValue) return sortConfig.direction === 'asc' ? 1 : -1;
        return 0;
    });

    const requestSort = (key: keyof TATClaim) => {
        let direction: 'asc' | 'desc' = 'asc';
        if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') direction = 'desc';
        setSortConfig({ key, direction });
    };

    const totalPages = Math.ceil(sortedClaims.length / ITEMS_PER_PAGE);
    const paginatedClaims = sortedClaims.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE);

    const getPageNumbers = () => {
        const pages = [];
        let start = Math.max(1, currentPage - 2);
        let end = Math.min(totalPages, currentPage + 2);
        
        if (currentPage <= 3) {
            end = Math.min(totalPages, 5);
        }
        if (currentPage >= totalPages - 2) {
            start = Math.max(1, totalPages - 4);
        }

        for (let i = start; i <= end; i++) {
            pages.push(i);
        }
        return pages;
    };

    const handleExportExcel = () => {
        const excelData = data.claims.map((claim) => ({
            'เลขที่เคลม': claim.ClaimNo,
            'ชื่อลูกค้า': claim.CustomerName,
            'สาขา': claim.BranchName,
            'วันที่ส่งอนุมัติ': claim.SubmittedDate ? formatDateTime(new Date(claim.SubmittedDate)) : '-',
            'วันที่อนุมัติ': claim.ApprovedDate ? formatDateTime(new Date(claim.ApprovedDate)) : '-',
            'ระยะเวลาสรุป': claim.TurnaroundText,
            'ใช้เวลา (วัน)': claim.TurnaroundDays,
            'ใช้เวลา (ชั่วโมง)': claim.TurnaroundHours,
            'ใช้เวลา (นาที)': claim.TurnaroundMinutes,
            'เวลาทั้งหมด (ชั่วโมง)': claim.TotalTurnaroundHours
        }));

        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.json_to_sheet(excelData);

        ws['!cols'] = [
            { wch: 18 }, // เลขที่เคลม
            { wch: 20 }, // ชื่อลูกค้า
            { wch: 20 }, // สาขา
            { wch: 20 }, // วันที่ส่งอนุมัติ
            { wch: 20 }, // วันที่อนุมัติ
            { wch: 25 }, // ระยะเวลาสรุป
            { wch: 15 }, // ใช้เวลา (วัน)
            { wch: 15 }, // ใช้เวลา (ชั่วโมง)
            { wch: 15 }, // ใช้เวลา (นาที)
            { wch: 20 }, // เวลาทั้งหมด (ชั่วโมง)
        ];

        XLSX.utils.book_append_sheet(wb, ws, 'TAT Report');

        const filename = `รายงานระยะเวลาอนุมัติ_${startDate}_${endDate}.xlsx`;
        XLSX.writeFile(wb, filename);
    };

    return (
        <>
            <Header title="รายงานระยะเวลาอนุมัติ (TAT)" subtitle="วิเคราะห์เวลาส่งอนุมัติถึงเวลาที่อนุมัติ" />

            <div className="mt-6 space-y-6">
                
                {/* Stats Cards (Dashboard) */}
                {!isLoading && (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        <Card className="bg-white border-blue-100 shadow-sm border-l-4 border-l-blue-500">
                            <CardContent className="p-6">
                                <div className="flex items-center justify-between">
                                    <h3 className="text-sm font-medium text-gray-500">เวลาเฉลี่ย (ทั้งหมด)</h3>
                                    <Clock className="w-5 h-5 text-blue-500" />
                                </div>
                                <div className="mt-4 flex items-baseline gap-2">
                                    <span className="text-3xl font-bold text-gray-900">{data.average.days}</span>
                                    <span className="text-sm font-medium text-gray-500">วัน</span>
                                    <span className="text-3xl font-bold text-gray-900">{data.average.hours}</span>
                                    <span className="text-sm font-medium text-gray-500">ชั่วโมง</span>
                                </div>
                                <p className="mt-1 text-xs text-gray-400">ค่าเฉลี่ยจากใบงานที่อนุมัติแล้ว</p>
                            </CardContent>
                        </Card>

                        <Card className="bg-white border-green-100 shadow-sm border-l-4 border-l-green-500">
                            <CardContent className="p-6">
                                <div className="flex items-center justify-between">
                                    <h3 className="text-sm font-medium text-gray-500">จำนวนใบงานที่วิเคราะห์</h3>
                                    <FileSpreadsheet className="w-5 h-5 text-green-500" />
                                </div>
                                <div className="mt-4">
                                    <span className="text-3xl font-bold text-gray-900">{data.totalProcessed}</span>
                                    <span className="text-sm font-medium text-gray-500 ml-2">รายการ</span>
                                </div>
                                <p className="mt-1 text-xs text-gray-400">ช่วงวันที่ {activeStartDate} ถึง {activeEndDate}</p>
                            </CardContent>
                        </Card>
                    </div>
                )}

                {/* Filters */}
                <div className="flex flex-wrap gap-3 items-end">
                    <div className="flex items-end gap-2">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">วันเริ่มต้น (อนุมัติ)</label>
                            <Input
                                type="date"
                                value={startDate}
                                onChange={(e) => setStartDate(e.target.value)}
                                className="w-40"
                            />
                        </div>
                        <span className="text-gray-500 pb-2">-</span>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">วันสิ้นสุด (อนุมัติ)</label>
                            <Input
                                type="date"
                                value={endDate}
                                onChange={(e) => setEndDate(e.target.value)}
                                className="w-40"
                            />
                        </div>
                    </div>
                    <Button onClick={handleSearch} variant="secondary">
                        <Search className="w-4 h-4 mr-2" />
                        ค้นหา
                    </Button>
                    <Button onClick={handleExportExcel} disabled={data.claims.length === 0}>
                        <Download className="w-4 h-4 mr-2" />
                        Export Excel
                    </Button>
                </div>

                {/* Submitted Date Filters */}
                <div className="flex flex-wrap gap-3 items-end">
                    <div className="flex items-end gap-2">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">วันเริ่มต้น (ส่งอนุมัติ)</label>
                            <Input
                                type="date"
                                value={submittedStartDate}
                                onChange={(e) => setSubmittedStartDate(e.target.value)}
                                className="w-40"
                            />
                        </div>
                        <span className="text-gray-500 pb-2">-</span>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">วันสิ้นสุด (ส่งอนุมัติ)</label>
                            <Input
                                type="date"
                                value={submittedEndDate}
                                onChange={(e) => setSubmittedEndDate(e.target.value)}
                                className="w-40"
                            />
                        </div>
                    </div>
                    {(submittedStartDate || submittedEndDate) && (
                        <Button variant="ghost" size="sm" onClick={() => { setSubmittedStartDate(''); setSubmittedEndDate(''); }}>
                            ล้างตัวกรองวันส่ง
                        </Button>
                    )}
                </div>

                {/* Report Table */}
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <CalendarDays className="w-5 h-5" />
                            รายการคำนวณวันและชั่วโมง ({data.claims.length} รายการ)
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="p-0">
                        {isLoading ? (
                            <LoadingPage />
                        ) : data.claims.length === 0 ? (
                            <div className="text-center py-12">
                                <p className="text-gray-500">ไม่พบรายการเคลมในช่วงเวลาที่เลือก</p>
                            </div>
                        ) : (
                            <>
                                <div className="overflow-x-auto">
                                    <table className="w-full text-sm text-left">
                                    <thead className="bg-gray-50 border-b border-gray-200">
                                        <tr>
                                            <th className="px-4 py-3 text-xs font-semibold text-gray-600 uppercase">
                                                เลขเคลม
                                            </th>
                                            <th className="px-4 py-3 text-xs font-semibold text-gray-600 uppercase">
                                                ลูกค้า / สาขา
                                            </th>
                                            <th 
                                                className="px-4 py-3 text-xs font-semibold text-gray-600 uppercase cursor-pointer hover:bg-gray-100"
                                                onClick={() => requestSort('SubmittedDate')}
                                            >
                                                วันที่ส่งอนุมัติ {sortConfig?.key === 'SubmittedDate' ? (sortConfig.direction === 'asc' ? '↑' : '↓') : ''}
                                            </th>
                                            <th 
                                                className="px-4 py-3 text-xs font-semibold text-gray-600 uppercase cursor-pointer hover:bg-gray-100"
                                                onClick={() => requestSort('ApprovedDate')}
                                            >
                                                วันที่อนุมัติ {sortConfig?.key === 'ApprovedDate' ? (sortConfig.direction === 'asc' ? '↑' : '↓') : ''}
                                            </th>
                                            <th 
                                                className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase cursor-pointer hover:bg-gray-100 group"
                                                onClick={() => requestSort('TurnaroundText')}
                                            >
                                                สรุประยะเวลา {sortConfig?.key === 'TurnaroundText' || sortConfig?.key === 'TotalTurnaroundHours' ? (sortConfig.direction === 'asc' ? '↑' : '↓') : ''}
                                            </th>
                                            <th 
                                                className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase cursor-pointer hover:bg-gray-100 group"
                                                onClick={() => requestSort('TurnaroundDays')}
                                            >
                                                ใช้เวลา (วัน) {sortConfig?.key === 'TurnaroundDays' ? (sortConfig.direction === 'asc' ? '↑' : '↓') : ''}
                                            </th>
                                            <th 
                                                className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase cursor-pointer hover:bg-gray-100 group"
                                                onClick={() => requestSort('TurnaroundHours')}
                                            >
                                                ใช้เวลา (ชั่วโมง) {sortConfig?.key === 'TurnaroundHours' ? (sortConfig.direction === 'asc' ? '↑' : '↓') : ''}
                                            </th>
                                            <th 
                                                className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase cursor-pointer hover:bg-gray-100 group"
                                                onClick={() => requestSort('TurnaroundMinutes')}
                                            >
                                                ใช้เวลา (นาที) {sortConfig?.key === 'TurnaroundMinutes' ? (sortConfig.direction === 'asc' ? '↑' : '↓') : ''}
                                            </th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-200">
                                        {paginatedClaims.map((claim) => (
                                            <tr key={claim.ClaimID} className="hover:bg-gray-50">
                                                <td className="px-4 py-3 whitespace-nowrap font-medium text-gray-900">
                                                    {claim.ClaimNo}
                                                </td>
                                                <td className="px-4 py-3 text-gray-600">
                                                    <div className="font-medium text-gray-900">{claim.CustomerName}</div>
                                                    <div className="text-xs text-gray-500">{claim.BranchName}</div>
                                                </td>
                                                <td className="px-4 py-3 whitespace-nowrap text-gray-600">
                                                    {claim.SubmittedDate ? formatDateTime(new Date(claim.SubmittedDate)) : '-'}
                                                </td>
                                                <td className="px-4 py-3 whitespace-nowrap text-gray-600">
                                                    {claim.ApprovedDate ? formatDateTime(new Date(claim.ApprovedDate)) : '-'}
                                                </td>
                                                <td className="px-4 py-3 whitespace-nowrap text-left font-medium text-gray-900">
                                                    {claim.TurnaroundText}
                                                </td>
                                                <td className="px-4 py-3 whitespace-nowrap text-right font-medium">
                                                    <span className="text-blue-600">{claim.TurnaroundDays}</span>
                                                </td>
                                                <td className="px-4 py-3 whitespace-nowrap text-right font-medium">
                                                    <span className="text-orange-600">{claim.TurnaroundHours}</span>
                                                </td>
                                                <td className="px-4 py-3 whitespace-nowrap text-right font-medium">
                                                    <span className="text-green-600">{claim.TurnaroundMinutes}</span>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                            
                            {totalPages > 1 && (
                                <div className="flex items-center justify-between px-6 py-4 border-t border-gray-200">
                                    <p className="text-sm text-gray-500">
                                        แสดง {(currentPage - 1) * ITEMS_PER_PAGE + 1} -{' '}
                                        {Math.min(currentPage * ITEMS_PER_PAGE, sortedClaims.length)}{' '}
                                        จาก {sortedClaims.length} รายการ
                                    </p>
                                    <div className="flex gap-2">
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                                            disabled={currentPage === 1}
                                        >
                                            <ChevronLeft className="w-4 h-4" />
                                        </Button>

                                        {getPageNumbers().map(pageNum => (
                                            <Button
                                                key={pageNum}
                                                variant={pageNum === currentPage ? "primary" : "outline"}
                                                size="sm"
                                                onClick={() => setCurrentPage(pageNum)}
                                                className={pageNum === currentPage ? "bg-blue-600 text-white hover:bg-blue-700" : ""}
                                            >
                                                {pageNum}
                                            </Button>
                                        ))}

                                        <Button
                                            variant="outline"
                                            size="sm"
                                            onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                                            disabled={currentPage === totalPages}
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

export default function AdminTATReportsPage() {
    return (
        <Suspense fallback={<LoadingPage />}>
            <TATReportsContent />
        </Suspense>
    );
}
