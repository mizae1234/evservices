'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { Header } from '@/components/layouts/Header';
import { Button } from '@/components/ui/Button';
import { Search, Download, Filter, Loader2, Calendar } from 'lucide-react';
import * as XLSX from 'xlsx';

interface BookingReport {
    BookingID: number;
    BookingNo: string;
    BookingDate: string;
    StartTime: string;
    EndTime: string;
    CustomerName: string;
    CustomerPhone: string;
    CarRegister: string;
    CarModel: string;
    LastMileage: number;
    Mileage: number;
    Status: number;
    BookingType: string;
    CSStatus?: string;
    ClaimID: number | null;
    Branch: { BranchName: string } | null;
    ServiceType: { Name: string } | null;
}

export default function BookingReportPage() {
    const { data: session } = useSession();
    const isAdmin = session?.user?.role === 'ADMIN';

    const [branches, setBranches] = useState<any[]>([]);
    const [data, setData] = useState<BookingReport[]>([]);
    const [isLoading, setIsLoading] = useState(false);

    // Filters
    const [filterBranch, setFilterBranch] = useState(isAdmin ? 'all' : session?.user?.branchId || '');
    const [filterDateFrom, setFilterDateFrom] = useState(() => {
        const d = new Date();
        d.setDate(1); // First day of current month
        return d.toISOString().split('T')[0];
    });
    const [filterDateTo, setFilterDateTo] = useState(() => {
        const d = new Date();
        d.setMonth(d.getMonth() + 1, 0); // Last day of current month
        return d.toISOString().split('T')[0];
    });
    const [searchQuery, setSearchQuery] = useState('');
    const [filterStatus, setFilterStatus] = useState('all');

    useEffect(() => {
        if (isAdmin) {
            fetchBranches();
        }
    }, [isAdmin]);

    const fetchBranches = async () => {
        try {
            const res = await fetch('/api/branches');
            const result = await res.json();
            if (result.success) {
                setBranches(result.data);
            }
        } catch (error) {
            console.error('Failed to fetch branches:', error);
        }
    };

    const fetchReport = async () => {
        setIsLoading(true);
        try {
            const params = new URLSearchParams();
            if (filterBranch) params.append('branchId', filterBranch);
            if (filterDateFrom) params.append('dateFrom', filterDateFrom);
            if (filterDateTo) params.append('dateTo', filterDateTo);
            if (searchQuery) params.append('search', searchQuery);
            if (filterStatus !== 'all') params.append('status', filterStatus);

            const res = await fetch(`/api/bookings/report?${params.toString()}`);
            const result = await res.json();

            if (result.success) {
                setData(result.data);
            }
        } catch (error) {
            console.error('Failed to fetch report:', error);
        } finally {
            setIsLoading(false);
        }
    };

    // Load data initially
    useEffect(() => {
        fetchReport();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const exportToExcel = () => {
        if (data.length === 0) return;

        const excelData = data.map(item => {
            const dateObj = new Date(item.BookingDate);
            const dateStr = `${String(dateObj.getUTCDate()).padStart(2, '0')}/${String(dateObj.getUTCMonth() + 1).padStart(2, '0')}/${dateObj.getUTCFullYear()}`;
            
            let statusText = '';
            switch (item.Status) {
                case 0: statusText = 'รออนุมัติ'; break;
                case 1: statusText = 'อนุมัติแล้ว'; break;
                case 2: statusText = 'ยกเลิก'; break;
                case 3: statusText = item.ClaimID ? 'เปิดใบเคลมแล้ว' : 'รอเปิดเคลม'; break;
                case 4: statusText = 'ปิดงาน'; break;
                default: statusText = 'ไม่ทราบสถานะ';
            }

            let csStatusText = 'รอดำเนินการ';
            switch (item.CSStatus) {
                case 'FOLLOW_UP': csStatusText = 'ติดตามผล'; break;
                case 'CONFIRMED': csStatusText = 'ลูกค้ายืนยันแล้ว'; break;
                case 'NO_ANSWER': csStatusText = 'โทรไม่รับสาย'; break;
                default: csStatusText = 'รอดำเนินการ';
            }

            return {
                'เลขที่จอง': item.BookingNo,
                'วันที่จอง': dateStr,
                'เวลา': `${item.StartTime} - ${item.EndTime}`,
                'สาขา': item.Branch?.BranchName || '-',
                'ทะเบียนรถ': item.CarRegister,
                'รุ่นรถ': item.CarModel,
                'ชื่อลูกค้า': item.CustomerName,
                'เบอร์โทร': item.CustomerPhone || '-',
                'ไมล์ปัจจุบัน': item.LastMileage,
                'ระยะเช็ค': item.Mileage,
                'ประเภทบริการ': item.ServiceType?.Name || '-',
                'ประเภทจอง': item.BookingType,
                'สถานะจอง': statusText,
                'สถานะ Call Center': csStatusText,
            };
        });

        const ws = XLSX.utils.json_to_sheet(excelData);
        
        // Adjust column widths
        const wscols = [
            { wch: 15 }, // เลขที่จอง
            { wch: 12 }, // วันที่จอง
            { wch: 15 }, // เวลา
            { wch: 20 }, // สาขา
            { wch: 15 }, // ทะเบียนรถ
            { wch: 20 }, // รุ่นรถ
            { wch: 25 }, // ชื่อลูกค้า
            { wch: 15 }, // เบอร์โทร
            { wch: 12 }, // ไมล์ปัจจุบัน
            { wch: 12 }, // ระยะเช็ค
            { wch: 25 }, // ประเภทบริการ
            { wch: 12 }, // ประเภทจอง
            { wch: 15 }, // สถานะ
        ];
        ws['!cols'] = wscols;

        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "รายงานการจอง");

        const fileName = `รายงานการจอง_${filterDateFrom}_ถึง_${filterDateTo}.xlsx`;
        XLSX.writeFile(wb, fileName);
    };

    const getStatusBadge = (status: number, claimId: number | null) => {
        switch (status) {
            case 0: return <span className="px-2 py-1 bg-yellow-100 text-yellow-800 rounded-full text-xs font-medium">รออนุมัติ</span>;
            case 1: return <span className="px-2 py-1 bg-blue-100 text-blue-800 rounded-full text-xs font-medium">อนุมัติแล้ว</span>;
            case 2: return <span className="px-2 py-1 bg-red-100 text-red-800 rounded-full text-xs font-medium">ยกเลิก</span>;
            case 3: 
                return claimId 
                    ? <span className="px-2 py-1 bg-emerald-100 text-emerald-800 rounded-full text-xs font-medium">เปิดใบเคลมแล้ว</span>
                    : <span className="px-2 py-1 bg-orange-100 text-orange-800 rounded-full text-xs font-medium">รอเปิดเคลม</span>;
            case 4: return <span className="px-2 py-1 bg-gray-100 text-gray-800 rounded-full text-xs font-medium">ปิดงาน</span>;
            default: return <span className="px-2 py-1 bg-gray-100 text-gray-800 rounded-full text-xs font-medium">ไม่ทราบสถานะ</span>;
        }
    };

    const formatDate = (d: string) => {
        const date = new Date(d);
        return `${String(date.getUTCDate()).padStart(2, '0')}/${String(date.getUTCMonth() + 1).padStart(2, '0')}/${date.getUTCFullYear()}`;
    };

    return (
        <div className="min-h-screen bg-gray-50/50">
            <Header title="รายงานการจองเข้าใช้บริการ" subtitle="ระบบรายงานสำหรับการจองคิวเช็คระยะและซ่อม" />

            <div className="p-6">
                <div className="max-w-7xl mx-auto space-y-6">
                    
                    {/* Filter Card */}
                    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
                        <div className="flex items-center gap-2 mb-4">
                            <Filter className="w-5 h-5 text-gray-500" />
                            <h2 className="font-semibold text-gray-900">ตัวกรองรายงาน</h2>
                        </div>
                        
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
                            {/* Branch Filter - Only for admin */}
                            {isAdmin && (
                                <div>
                                    <label className="block text-xs font-medium text-gray-700 mb-1">สาขา</label>
                                    <select
                                        value={filterBranch}
                                        onChange={(e) => setFilterBranch(e.target.value)}
                                        className="w-full text-sm text-gray-900 rounded-lg border-gray-300 focus:border-blue-500 focus:ring-blue-500"
                                    >
                                        <option value="all">ทุกสาขา</option>
                                        {branches.map(b => (
                                            <option key={b.BranchID} value={b.BranchID}>{b.BranchName}</option>
                                        ))}
                                    </select>
                                </div>
                            )}

                            {/* Date Range */}
                            <div className={isAdmin ? 'lg:col-span-2' : 'lg:col-span-2'}>
                                <label className="block text-xs font-medium text-gray-700 mb-1">ช่วงวันที่จอง (จาก - ถึง)</label>
                                <div className="flex items-center gap-2">
                                    <div className="relative flex-1">
                                        <div className="absolute inset-y-0 left-0 pl-2.5 flex items-center pointer-events-none">
                                            <Calendar className="h-4 w-4 text-gray-400" />
                                        </div>
                                        <input
                                            type="date"
                                            value={filterDateFrom}
                                            onChange={(e) => setFilterDateFrom(e.target.value)}
                                            className="w-full pl-9 text-sm text-gray-900 rounded-lg border-gray-300 focus:border-blue-500 focus:ring-blue-500"
                                        />
                                    </div>
                                    <span className="text-gray-500">-</span>
                                    <div className="relative flex-1">
                                        <div className="absolute inset-y-0 left-0 pl-2.5 flex items-center pointer-events-none">
                                            <Calendar className="h-4 w-4 text-gray-400" />
                                        </div>
                                        <input
                                            type="date"
                                            value={filterDateTo}
                                            onChange={(e) => setFilterDateTo(e.target.value)}
                                            className="w-full pl-9 text-sm text-gray-900 rounded-lg border-gray-300 focus:border-blue-500 focus:ring-blue-500"
                                        />
                                    </div>
                                </div>
                            </div>

                            {/* Search */}
                            <div>
                                <label className="block text-xs font-medium text-gray-700 mb-1">ค้นหา</label>
                                <div className="relative">
                                    <div className="absolute inset-y-0 left-0 pl-2.5 flex items-center pointer-events-none">
                                        <Search className="h-4 w-4 text-gray-400" />
                                    </div>
                                    <input
                                        type="text"
                                        placeholder="ทะเบียน, ชื่อ, เลขจอง"
                                        value={searchQuery}
                                        onChange={(e) => setSearchQuery(e.target.value)}
                                        onKeyDown={(e) => e.key === 'Enter' && fetchReport()}
                                        className="w-full pl-9 text-sm text-gray-900 rounded-lg border-gray-300 focus:border-blue-500 focus:ring-blue-500"
                                    />
                                </div>
                            </div>

                            {/* Status */}
                            <div>
                                <label className="block text-xs font-medium text-gray-700 mb-1">สถานะ</label>
                                <select
                                    value={filterStatus}
                                    onChange={(e) => setFilterStatus(e.target.value)}
                                    className="w-full text-sm text-gray-900 rounded-lg border-gray-300 focus:border-blue-500 focus:ring-blue-500"
                                >
                                    <option value="all">ทั้งหมด</option>
                                    <option value="0">รออนุมัติ</option>
                                    <option value="1">อนุมัติแล้ว</option>
                                    <option value="2">ยกเลิก</option>
                                    <option value="3">เข้ารับบริการ/เคลม</option>
                                    <option value="4">ปิดงาน</option>
                                </select>
                            </div>
                        </div>

                        <div className="mt-4 flex items-center justify-end gap-3">
                            <Button
                                onClick={exportToExcel}
                                disabled={data.length === 0 || isLoading}
                                variant="outline"
                                className="flex items-center gap-2 border-green-600 text-green-700 hover:bg-green-50 hover:text-green-800"
                            >
                                <Download className="w-4 h-4" />
                                Export Excel
                            </Button>
                            <Button
                                onClick={fetchReport}
                                disabled={isLoading}
                                className="flex items-center gap-2"
                            >
                                {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                                ดึงข้อมูล
                            </Button>
                        </div>
                    </div>

                    {/* Results Table */}
                    <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                        <div className="px-5 py-4 border-b border-gray-100 flex justify-between items-center bg-gray-50">
                            <h3 className="font-semibold text-gray-800">ผลการค้นหา</h3>
                            <span className="text-sm text-gray-500">พบ {data.length} รายการ</span>
                        </div>
                        
                        <div className="overflow-x-auto">
                            <table className="w-full text-left border-collapse">
                                <thead>
                                    <tr className="bg-gray-50 border-b border-gray-100 text-xs uppercase text-gray-500 font-semibold tracking-wider">
                                        <th className="px-4 py-3 whitespace-nowrap">เลขที่จอง</th>
                                        <th className="px-4 py-3 whitespace-nowrap">วันที่ / เวลา</th>
                                        <th className="px-4 py-3 whitespace-nowrap">สาขา</th>
                                        <th className="px-4 py-3 whitespace-nowrap">ข้อมูลลูกค้า</th>
                                        <th className="px-4 py-3 whitespace-nowrap">ข้อมูลรถ</th>
                                        <th className="px-4 py-3 whitespace-nowrap">บริการ</th>
                                        <th className="px-4 py-3 whitespace-nowrap">สถานะจอง</th>
                                        <th className="px-4 py-3 whitespace-nowrap">สถานะ Call Center</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100 text-sm">
                                    {isLoading ? (
                                        <tr>
                                            <td colSpan={8} className="px-4 py-20 text-center text-gray-500">
                                                <Loader2 className="w-8 h-8 animate-spin mx-auto mb-2 text-blue-500" />
                                                <p>กำลังโหลดข้อมูล...</p>
                                            </td>
                                        </tr>
                                    ) : data.length === 0 ? (
                                        <tr>
                                            <td colSpan={8} className="px-4 py-20 text-center text-gray-500">
                                                ไม่พบข้อมูลการจองในช่วงเวลาที่เลือก
                                            </td>
                                        </tr>
                                    ) : (
                                        data.map(item => (
                                            <tr key={item.BookingID} className="hover:bg-blue-50/30 transition-colors">
                                                <td className="px-4 py-3">
                                                    <div className="font-medium text-gray-900">{item.BookingNo}</div>
                                                    <div className="text-[10px] text-gray-500 font-mono mt-0.5">{item.BookingType}</div>
                                                </td>
                                                <td className="px-4 py-3">
                                                    <div className="text-gray-900">{formatDate(item.BookingDate)}</div>
                                                    <div className="text-xs text-gray-500">{item.StartTime} - {item.EndTime}</div>
                                                </td>
                                                <td className="px-4 py-3 text-gray-700">
                                                    {item.Branch?.BranchName || '-'}
                                                </td>
                                                <td className="px-4 py-3">
                                                    <div className="text-gray-900 font-medium">{item.CustomerName}</div>
                                                    <div className="text-xs text-gray-500">{item.CustomerPhone || '-'}</div>
                                                </td>
                                                <td className="px-4 py-3">
                                                    <div className="text-gray-900 font-bold">{item.CarRegister}</div>
                                                    <div className="text-xs text-gray-500">{item.CarModel}</div>
                                                </td>
                                                <td className="px-4 py-3">
                                                    <div className="text-gray-900">{item.ServiceType?.Name || '-'}</div>
                                                    <div className="text-xs text-gray-500">ระยะ: {item.Mileage.toLocaleString()} กม.</div>
                                                </td>
                                                <td className="px-4 py-3">
                                                    {getStatusBadge(item.Status, item.ClaimID)}
                                                </td>
                                                <td className="px-4 py-3">
                                                    <span className={`inline-block px-2.5 py-1 rounded-full text-xs font-semibold ${
                                                        item.CSStatus === 'CONFIRMED' ? 'bg-emerald-100 text-emerald-800 border border-emerald-200' :
                                                        item.CSStatus === 'FOLLOW_UP' ? 'bg-orange-100 text-orange-800 border border-orange-200' :
                                                        item.CSStatus === 'NO_ANSWER' ? 'bg-red-100 text-red-800 border border-red-200' :
                                                        'bg-gray-100 text-gray-600'
                                                    }`}>
                                                        {item.CSStatus === 'CONFIRMED' ? 'ลูกค้ายืนยันแล้ว' :
                                                         item.CSStatus === 'FOLLOW_UP' ? 'ติดตามผล' :
                                                         item.CSStatus === 'NO_ANSWER' ? 'โทรไม่รับสาย' :
                                                         'รอดำเนินการ'}
                                                    </span>
                                                </td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>

                </div>
            </div>
        </div>
    );
}
