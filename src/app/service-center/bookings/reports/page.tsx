'use client';

import { Suspense, useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { Header } from '@/components/layouts/Header';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import {
    Search,
    Download,
    Filter,
    Loader2,
    Calendar,
    Clock,
    CheckCircle2,
    AlertTriangle,
    Users,
    Timer,
    Info,
    ChevronLeft,
    ChevronRight,
    Ticket,
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { isCSRole } from '@/lib/permissions';
import { cn, getBangkokDateString } from '@/lib/utils';
import { QUEUE_STATUS_LABEL, QueueStatus } from '@/lib/queue-status';
import {
    formatDurationMinutes,
    ServiceSlaReportItem,
    ServiceSlaSummary,
} from '@/lib/service-sla';

interface BookingReport {
    FlatRateDescription?: string | null;
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

type ReportTab = 'booking' | 'service';
type ServiceSortKey = 'CheckInAt' | 'SlaMinutes' | 'SlaDiffMinutes' | 'ActualTotalMinutes';

const EMPTY_SUMMARY: ServiceSlaSummary = {
    totalQueues: 0,
    bookingCount: 0,
    walkInCount: 0,
    completedCount: 0,
    activeCount: 0,
    cancelledOrNoShowCount: 0,
    slaEvaluatedCount: 0,
    slaPassCount: 0,
    slaOverCount: 0,
    slaNoTargetCount: 0,
    slaPassRate: 0,
    avgSlaMinutes: 0,
    avgActualMinutes: 0,
    avgWaitBeforeRepairMinutes: 0,
    avgRepairMinutes: 0,
};

function formatBangkokTime(iso: string | null): string {
    if (!iso) return '-';
    return new Date(iso).toLocaleTimeString('th-TH', {
        timeZone: 'Asia/Bangkok',
        hour: '2-digit',
        minute: '2-digit',
    });
}

function formatUtcDateSlash(iso: string): string {
    const date = new Date(iso);
    return `${String(date.getUTCDate()).padStart(2, '0')}/${String(date.getUTCMonth() + 1).padStart(2, '0')}/${date.getUTCFullYear()}`;
}

function ReportsPageContent() {
    const searchParams = useSearchParams();
    const { data: session } = useSession();
    const isAdmin = session?.user?.role === 'ADMIN';
    const isCS = isCSRole(session?.user?.role);
    const canSelectBranch = isAdmin || isCS;

    const initialTab: ReportTab = searchParams.get('tab') === 'service' ? 'service' : 'booking';
    const [activeTab, setActiveTab] = useState<ReportTab>(initialTab);
    const [branches, setBranches] = useState<{ BranchID: number; BranchName: string }[]>([]);

    // =========================================================================
    // Tab 1 State: รายงานการจอง (Booking Report)
    // =========================================================================
    const [data, setData] = useState<BookingReport[]>([]);
    const [isLoading, setIsLoading] = useState(false);

    const [filterBranch, setFilterBranch] = useState(
        canSelectBranch ? 'all' : String(session?.user?.branchId || '')
    );
    const [filterDateFrom, setFilterDateFrom] = useState(() => {
        const d = new Date();
        d.setDate(d.getDate() - 7);
        return getBangkokDateString(d);
    });
    const [filterDateTo, setFilterDateTo] = useState(() => {
        const d = new Date();
        d.setDate(d.getDate() + 30);
        return getBangkokDateString(d);
    });
    const [searchQuery, setSearchQuery] = useState('');
    const [filterStatus, setFilterStatus] = useState('all');

    // =========================================================================
    // Tab 2 State: รายงานการเข้าใช้บริการ & SLA (Service Attendance Report)
    // =========================================================================
    const [serviceItems, setServiceItems] = useState<ServiceSlaReportItem[]>([]);
    const [serviceSummary, setServiceSummary] = useState<ServiceSlaSummary>(EMPTY_SUMMARY);
    const [isServiceLoading, setIsServiceLoading] = useState(false);
    const [hasLoadedService, setHasLoadedService] = useState(false);

    const [svcBranch, setSvcBranch] = useState(
        canSelectBranch ? 'all' : String(session?.user?.branchId || '')
    );
    const [svcDateFrom, setSvcDateFrom] = useState(() => {
        const d = new Date();
        d.setDate(d.getDate() - 7);
        return getBangkokDateString(d);
    });
    const [svcDateTo, setSvcDateTo] = useState(() => getBangkokDateString(new Date()));
    const [svcVisitType, setSvcVisitType] = useState('all');
    const [svcStatus, setSvcStatus] = useState('all');
    const [svcSlaResult, setSvcSlaResult] = useState('all');
    const [svcSearch, setSvcSearch] = useState('');

    const [svcSort, setSvcSort] = useState<{ key: ServiceSortKey; dir: 'asc' | 'desc' }>({
        key: 'CheckInAt',
        dir: 'desc',
    });
    const [svcPage, setSvcPage] = useState(1);
    const [selectedQueueItem, setSelectedQueueItem] = useState<ServiceSlaReportItem | null>(null);
    const ITEMS_PER_PAGE = 50;

    // Sync branch defaults once session resolves
    useEffect(() => {
        if (!session?.user) return;
        if (canSelectBranch) {
            setFilterBranch((prev) => prev || 'all');
            setSvcBranch((prev) => prev || 'all');
        } else if (session.user.branchId) {
            const bid = String(session.user.branchId);
            setFilterBranch(bid);
            setSvcBranch(bid);
        }
    }, [session, canSelectBranch]);

    useEffect(() => {
        if (canSelectBranch) {
            fetchBranches();
        }
    }, [canSelectBranch]);

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

    const fetchReport = useCallback(async () => {
        setIsLoading(true);
        try {
            const params = new URLSearchParams();
            if (filterBranch) params.append('branchId', String(filterBranch));
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
    }, [filterBranch, filterDateFrom, filterDateTo, searchQuery, filterStatus]);

    const fetchServiceReport = useCallback(async () => {
        setIsServiceLoading(true);
        try {
            const params = new URLSearchParams();
            if (svcBranch) params.append('branchId', String(svcBranch));
            if (svcDateFrom) params.append('dateFrom', svcDateFrom);
            if (svcDateTo) params.append('dateTo', svcDateTo);
            if (svcVisitType !== 'all') params.append('visitType', svcVisitType);
            if (svcStatus !== 'all') params.append('status', svcStatus);
            if (svcSlaResult !== 'all') params.append('slaResult', svcSlaResult);
            if (svcSearch) params.append('search', svcSearch);

            const res = await fetch(`/api/bookings/service-report?${params.toString()}`);
            const result = await res.json();

            if (result.success) {
                setServiceItems(result.data.items);
                setServiceSummary(result.data.summary);
                setSvcPage(1);
                setHasLoadedService(true);
            }
        } catch (error) {
            console.error('Failed to fetch service report:', error);
        } finally {
            setIsServiceLoading(false);
        }
    }, [svcBranch, svcDateFrom, svcDateTo, svcVisitType, svcStatus, svcSlaResult, svcSearch]);

    // Load initial tab data
    useEffect(() => {
        if (initialTab === 'service') {
            fetchServiceReport();
        } else {
            fetchReport();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Lazy-load the other tab on first switch
    const handleTabChange = (tab: ReportTab) => {
        setActiveTab(tab);
        if (tab === 'service' && !hasLoadedService && !isServiceLoading) {
            fetchServiceReport();
        } else if (tab === 'booking' && data.length === 0 && !isLoading) {
            fetchReport();
        }
    };

    // =========================================================================
    // Excel Export: Tab 1 (Booking Report)
    // =========================================================================
    const exportToExcel = () => {
        if (data.length === 0) return;

        const excelData = data.map((item) => {
            const dateStr = formatUtcDateSlash(item.BookingDate);

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
        ws['!cols'] = [
            { wch: 15 },
            { wch: 12 },
            { wch: 15 },
            { wch: 20 },
            { wch: 15 },
            { wch: 20 },
            { wch: 25 },
            { wch: 15 },
            { wch: 12 },
            { wch: 12 },
            { wch: 25 },
            { wch: 12 },
            { wch: 15 },
            { wch: 18 },
        ];

        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'รายงานการจอง');

        const fileName = `รายงานการจอง_${filterDateFrom}_ถึง_${filterDateTo}.xlsx`;
        XLSX.writeFile(wb, fileName);
    };

    // =========================================================================
    // Excel Export: Tab 2 (Service Attendance & SLA Report)
    // =========================================================================
    const exportServiceToExcel = () => {
        if (sortedServiceItems.length === 0) return;

        const excelData = sortedServiceItems.map((item) => ({
            'วันที่เข้ารับบริการ': formatUtcDateSlash(item.QueueDate),
            'เลขคิว': item.QueueLabel,
            'สาขา': item.BranchName,
            'รูปแบบการเข้าบริการ': item.VisitType === 'BOOKING' ? 'นัดหมายล่วงหน้า' : 'Walk-in',
            'เลขที่จอง': item.BookingNo || '-',
            'เลขที่ใบเคลม': item.ClaimNo || '-',
            'ประเภทโครงการ': item.BookingType,
            'ทะเบียนรถ': item.CarRegister,
            'รุ่นรถ': item.CarModel || '-',
            'ชื่อลูกค้า': item.CustomerName,
            'เบอร์โทร': item.CustomerPhone || '-',
            'ประเภทบริการ': item.ServiceName,
            'ระยะเช็ค (กม.)': item.Mileage ?? '-',
            'เวลานัดหมาย': item.AppointmentStartTime
                ? `${item.AppointmentStartTime} - ${item.AppointmentEndTime || ''}`
                : '-',
            'เวลา Check-in': formatBangkokTime(item.CheckInAt),
            'มาก่อนเวลานัด (นาที)': item.IsEarlyArrival ? item.EarlyArrivalMinutes : 0,
            'เวลาเริ่มนับ SLA': formatBangkokTime(item.SlaStartAt),
            'เงื่อนไขเริ่มนับ SLA': item.SlaStartReasonLabel,
            'เวลาเสร็จสิ้น': formatBangkokTime(item.DoneAt),
            'รอเรียกคิว (นาที)': item.StageMinutes.WAITING_CALL ?? '-',
            'รอเข้าซ่อม (นาที)': item.StageMinutes.WAITING_REPAIR ?? '-',
            'กำลังซ่อม (นาที)': item.StageMinutes.IN_REPAIR ?? '-',
            'รอชำระเงิน (นาที)': item.StageMinutes.WAITING_PAYMENT ?? '-',
            'เวลาจริงตั้งแต่ Check-in (นาที)': item.ActualTotalMinutes ?? '-',
            'เวลาที่ใช้ / คิด SLA (นาที)': item.SlaMinutes ?? '-',
            'เวลาที่ใช้ / คิด SLA (สรุป)': formatDurationMinutes(item.SlaMinutes),
            'เกณฑ์ SLA เป้าหมาย (นาที)': item.TargetSlaMinutes ?? '-',
            'ที่มาเกณฑ์ SLA': item.TargetSlaSourceLabel,
            'ส่วนต่าง SLA (นาที)': item.SlaDiffMinutes ?? '-',
            'ผลการประเมิน SLA': item.SlaStatusLabel,
            'สถานะคิว': item.StatusLabel,
        }));

        const ws = XLSX.utils.json_to_sheet(excelData);
        ws['!cols'] = [
            { wch: 15 }, // วันที่เข้ารับบริการ
            { wch: 10 }, // เลขคิว
            { wch: 20 }, // สาขา
            { wch: 16 }, // รูปแบบ
            { wch: 16 }, // เลขที่จอง
            { wch: 16 }, // เลขที่ใบเคลม
            { wch: 12 }, // ประเภทโครงการ
            { wch: 14 }, // ทะเบียนรถ
            { wch: 18 }, // รุ่นรถ
            { wch: 22 }, // ชื่อลูกค้า
            { wch: 14 }, // เบอร์โทร
            { wch: 24 }, // ประเภทบริการ
            { wch: 14 }, // ระยะเช็ค
            { wch: 15 }, // เวลานัดหมาย
            { wch: 13 }, // Check-in
            { wch: 18 }, // มาก่อนเวลานัด
            { wch: 15 }, // เริ่มนับ SLA
            { wch: 24 }, // เงื่อนไขเริ่มนับ SLA
            { wch: 13 }, // เสร็จสิ้น
            { wch: 15 }, // รอเรียกคิว
            { wch: 15 }, // รอเข้าซ่อม
            { wch: 15 }, // กำลังซ่อม
            { wch: 15 }, // รอชำระเงิน
            { wch: 24 }, // เวลาจริงรวม
            { wch: 16 }, // เวลาคิด SLA (นาที)
            { wch: 18 }, // เวลาคิด SLA (สรุป)
            { wch: 20 }, // เกณฑ์ SLA
            { wch: 20 }, // ที่มาเกณฑ์
            { wch: 16 }, // ส่วนต่าง
            { wch: 20 }, // ผล SLA
            { wch: 14 }, // สถานะคิว
        ];

        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'รายงานเข้าใช้บริการ_SLA');

        const fileName = `รายงานการเข้าใช้บริการ_SLA_${svcDateFrom}_ถึง_${svcDateTo}.xlsx`;
        XLSX.writeFile(wb, fileName);
    };

    // Sorting & Pagination for Tab 2
    const toggleServiceSort = (key: ServiceSortKey) => {
        setSvcSort((prev) =>
            prev.key === key
                ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' }
                : { key, dir: 'desc' }
        );
    };

    const sortedServiceItems = [...serviceItems].sort((a, b) => {
        const dir = svcSort.dir === 'asc' ? 1 : -1;
        if (svcSort.key === 'CheckInAt') {
            return (new Date(a.CheckInAt).getTime() - new Date(b.CheckInAt).getTime()) * dir;
        }
        const av = a[svcSort.key] ?? -999999;
        const bv = b[svcSort.key] ?? -999999;
        return (av - bv) * dir;
    });

    const totalSvcPages = Math.ceil(sortedServiceItems.length / ITEMS_PER_PAGE);
    const paginatedServiceItems = sortedServiceItems.slice(
        (svcPage - 1) * ITEMS_PER_PAGE,
        svcPage * ITEMS_PER_PAGE
    );

    const getSvcPageNumbers = () => {
        const pages: number[] = [];
        let start = Math.max(1, svcPage - 2);
        let end = Math.min(totalSvcPages, svcPage + 2);
        if (svcPage <= 3) end = Math.min(totalSvcPages, 5);
        if (svcPage >= totalSvcPages - 2) start = Math.max(1, totalSvcPages - 4);
        for (let i = start; i <= end; i++) pages.push(i);
        return pages;
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

    const renderQueueStatusBadge = (status: QueueStatus, label: string) => {
        const colorMap: Record<QueueStatus, string> = {
            WAITING_CALL: 'bg-amber-100 text-amber-800',
            WAITING_REPAIR: 'bg-sky-100 text-sky-800',
            IN_REPAIR: 'bg-indigo-100 text-indigo-800',
            WAITING_PAYMENT: 'bg-violet-100 text-violet-800',
            DONE: 'bg-emerald-100 text-emerald-800',
            CANCELLED: 'bg-gray-100 text-gray-600',
            NO_SHOW: 'bg-red-100 text-red-700',
        };
        return (
            <span className={cn('inline-block px-2 py-0.5 rounded-full text-xs font-medium', colorMap[status] || 'bg-gray-100 text-gray-700')}>
                {label}
            </span>
        );
    };

    const renderSlaBadge = (item: ServiceSlaReportItem) => {
        switch (item.SlaStatus) {
            case 'PASS':
                return (
                    <div className="space-y-0.5">
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800 border border-emerald-200">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            ผ่าน SLA
                        </span>
                        {item.SlaDiffMinutes != null && (
                            <div className="text-[11px] text-emerald-700">
                                {item.SlaDiffMinutes === 0
                                    ? 'พอดีเกณฑ์'
                                    : `เร็วกว่าเกณฑ์ ${Math.abs(item.SlaDiffMinutes)} นาที`}
                            </div>
                        )}
                    </div>
                );
            case 'OVER':
                return (
                    <div className="space-y-0.5">
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-red-100 text-red-800 border border-red-200">
                            <AlertTriangle className="w-3.5 h-3.5" />
                            เกิน SLA
                        </span>
                        {item.SlaDiffMinutes != null && item.SlaDiffMinutes > 0 && (
                            <div className="text-[11px] font-medium text-red-600">
                                +{formatDurationMinutes(item.SlaDiffMinutes)}
                            </div>
                        )}
                    </div>
                );
            case 'WAITING_APPOINTMENT':
                return (
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-sky-100 text-sky-800 border border-sky-200">
                        <Clock className="w-3.5 h-3.5" />
                        รอถึงเวลานัด
                    </span>
                );
            case 'IN_PROGRESS':
                return (
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-blue-50 text-blue-700 border border-blue-200">
                        กำลังดำเนินการ
                    </span>
                );
            case 'IN_PROGRESS_OVER':
                return (
                    <div className="space-y-0.5">
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-orange-100 text-orange-800 border border-orange-200">
                            <AlertTriangle className="w-3.5 h-3.5" />
                            กำลังทำ (เกิน SLA)
                        </span>
                        {item.SlaDiffMinutes != null && item.SlaDiffMinutes > 0 && (
                            <div className="text-[11px] font-medium text-orange-700">
                                +{formatDurationMinutes(item.SlaDiffMinutes)}
                            </div>
                        )}
                    </div>
                );
            case 'NO_SLA':
                return (
                    <span className="inline-block px-2.5 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-600 border border-gray-200">
                        {item.IsOtherService ? 'ไม่กำหนด SLA' : 'ไม่ระบุเกณฑ์ SLA'}
                    </span>
                );
            default:
                return <span className="text-xs text-gray-400">-</span>;
        }
    };

    return (
        <div className="min-h-screen bg-gray-50/50">
            <Header
                title={activeTab === 'booking' ? 'รายงานการจองเข้าใช้บริการ' : 'รายงานการเข้าใช้บริการและ SLA'}
                subtitle={
                    activeTab === 'booking'
                        ? 'ระบบรายงานสำหรับการจองคิวเช็คระยะและซ่อม'
                        : 'วิเคราะห์ระยะเวลาการเข้ารับบริการหน้าสาขา แยกตามขั้นตอนและเกณฑ์ SLA'
                }
            />

            <div className="p-6">
                <div className="max-w-7xl mx-auto space-y-6">
                    {/* Report Tabs */}
                    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-1.5 inline-flex flex-wrap gap-1">
                        <button
                            type="button"
                            onClick={() => handleTabChange('booking')}
                            className={cn(
                                'flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold transition-all',
                                activeTab === 'booking'
                                    ? 'bg-blue-600 text-white shadow-sm'
                                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                            )}
                        >
                            <Calendar className="w-4 h-4" />
                            รายงานการจอง
                        </button>
                        <button
                            type="button"
                            onClick={() => handleTabChange('service')}
                            className={cn(
                                'flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold transition-all',
                                activeTab === 'service'
                                    ? 'bg-blue-600 text-white shadow-sm'
                                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                            )}
                        >
                            <Timer className="w-4 h-4" />
                            รายงานการเข้าใช้บริการ (SLA)
                        </button>
                    </div>

                    {activeTab === 'booking' ? (
                        <>
                            {/* ==================== TAB 1: BOOKING REPORT ==================== */}
                            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
                                <div className="flex items-center gap-2 mb-4">
                                    <Filter className="w-5 h-5 text-gray-500" />
                                    <h2 className="font-semibold text-gray-900">ตัวกรองรายงานการจอง</h2>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
                                    {canSelectBranch && (
                                        <div>
                                            <label className="block text-xs font-medium text-gray-700 mb-1">สาขา</label>
                                            <select
                                                value={filterBranch}
                                                onChange={(e) => setFilterBranch(e.target.value)}
                                                className="w-full text-sm text-gray-900 rounded-lg border-gray-300 focus:border-blue-500 focus:ring-blue-500"
                                            >
                                                <option value="all">ทุกสาขา</option>
                                                {branches.map((b) => (
                                                    <option key={b.BranchID} value={b.BranchID}>{b.BranchName}</option>
                                                ))}
                                            </select>
                                        </div>
                                    )}

                                    <div className="lg:col-span-2">
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
                                                data.map((item) => (
                                                    <tr key={item.BookingID} className="hover:bg-blue-50/30 transition-colors">
                                                        <td className="px-4 py-3">
                                                            <div className="font-medium text-gray-900">{item.BookingNo}</div>
                                                            <div className="text-[10px] text-gray-500 font-mono mt-0.5">{item.BookingType}</div>
                                                        </td>
                                                        <td className="px-4 py-3">
                                                            <div className="text-gray-900">{formatUtcDateSlash(item.BookingDate)}</div>
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
                                                            {item.FlatRateDescription && item.Mileage > 0 && (
                                                                <div className="text-xs text-gray-500">{item.FlatRateDescription}</div>
                                                            )}
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
                        </>
                    ) : (
                        <>
                            {/* ==================== TAB 2: SERVICE ATTENDANCE & SLA REPORT ==================== */}

                            {/* SLA Calculation Info Banner */}
                            <div className="bg-blue-50/80 border border-blue-200 rounded-xl px-4 py-3 flex items-start gap-3 text-xs text-blue-900">
                                <Info className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
                                <div className="space-y-0.5 leading-relaxed">
                                    <p className="font-semibold">หลักเกณฑ์การคำนวณระยะเวลาและ SLA การเข้าใช้บริการ</p>
                                    <p>
                                        • <b>ลูกค้ามีนัดหมายและมาก่อนเวลา:</b> เริ่มนับเวลา SLA จาก <b>เวลานัดหมาย</b> (ยกเว้นพนักงานรับเข้าบริการก่อนเวลานัด จะนับจากเวลารับงานจริง)
                                        {' · '}
                                        <b>มาหลังเวลานัด หรือ Walk-in:</b> เริ่มนับจากเวลา <b>Check-in</b> จนถึงสถานะ <b>เสร็จสิ้น</b>
                                    </p>
                                    <p>
                                        • <b>เกณฑ์เวลาเป้าหมาย (Target SLA):</b> อิงจากเวลาประเมินของใบจอง หรือตาราง Flat Rate ตามประเภทบริการ/รุ่นรถ/ระยะเช็ค (กรณี Walk-in ดึงจาก Flat Rate ของบริการ หรือระยะเช็คจากใบงานเคลมของวันนั้น)
                                        {' · '}
                                        หากเป็นบริการ <b>อื่นๆ</b> หรือไม่พบเกณฑ์ Flat Rate จะแสดงเฉพาะระยะเวลาที่ใช้โดยไม่ตัดสินผ่าน/เกิน SLA
                                    </p>
                                </div>
                            </div>

                            {/* KPI Summary Cards */}
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                                <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 border-l-4 border-l-blue-500">
                                    <div className="flex items-center justify-between">
                                        <span className="text-xs font-medium text-gray-500">ผู้เข้าใช้บริการทั้งหมด</span>
                                        <Users className="w-4 h-4 text-blue-500" />
                                    </div>
                                    <div className="mt-2 flex items-baseline gap-2">
                                        <span className="text-2xl font-bold text-gray-900">
                                            {serviceSummary.totalQueues.toLocaleString()}
                                        </span>
                                        <span className="text-xs text-gray-500">คิว</span>
                                    </div>
                                    <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-gray-600">
                                        <span>นัดหมาย: <b>{serviceSummary.bookingCount}</b></span>
                                        <span>Walk-in: <b>{serviceSummary.walkInCount}</b></span>
                                        <span>เสร็จสิ้น: <b>{serviceSummary.completedCount}</b></span>
                                    </div>
                                </div>

                                <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 border-l-4 border-l-emerald-500">
                                    <div className="flex items-center justify-between">
                                        <span className="text-xs font-medium text-gray-500">อัตราผ่านเกณฑ์ SLA (งานเสร็จสิ้น)</span>
                                        <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                                    </div>
                                    <div className="mt-2 flex items-baseline gap-2">
                                        <span className={cn(
                                            'text-2xl font-bold',
                                            serviceSummary.slaEvaluatedCount === 0
                                                ? 'text-gray-900'
                                                : serviceSummary.slaPassRate >= 80
                                                    ? 'text-emerald-600'
                                                    : serviceSummary.slaPassRate >= 60
                                                        ? 'text-amber-600'
                                                        : 'text-red-600'
                                        )}>
                                            {serviceSummary.slaEvaluatedCount > 0 ? `${serviceSummary.slaPassRate}%` : '-'}
                                        </span>
                                    </div>
                                    <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                                        <span className="text-emerald-700 font-medium">
                                            ผ่าน {serviceSummary.slaPassCount}
                                        </span>
                                        <span className="text-red-600 font-medium">
                                            เกินเกณฑ์ {serviceSummary.slaOverCount}
                                        </span>
                                        {serviceSummary.slaNoTargetCount > 0 && (
                                            <span className="text-gray-500">
                                                ไม่คิดเกณฑ์ SLA {serviceSummary.slaNoTargetCount}
                                            </span>
                                        )}
                                    </div>
                                </div>

                                <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 border-l-4 border-l-indigo-500">
                                    <div className="flex items-center justify-between">
                                        <span className="text-xs font-medium text-gray-500">เวลาให้บริการเฉลี่ย (คิด SLA)</span>
                                        <Timer className="w-4 h-4 text-indigo-500" />
                                    </div>
                                    <div className="mt-2">
                                        <span className="text-2xl font-bold text-gray-900">
                                            {serviceSummary.completedCount > 0
                                                ? formatDurationMinutes(serviceSummary.avgSlaMinutes)
                                                : '-'}
                                        </span>
                                    </div>
                                    <p className="mt-2 text-xs text-gray-500">
                                        เวลาจริงตั้งแต่ Check-in เฉลี่ย:{' '}
                                        <b className="text-gray-700">
                                            {serviceSummary.completedCount > 0
                                                ? formatDurationMinutes(serviceSummary.avgActualMinutes)
                                                : '-'}
                                        </b>
                                    </p>
                                </div>

                                <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 border-l-4 border-l-amber-500">
                                    <div className="flex items-center justify-between">
                                        <span className="text-xs font-medium text-gray-500">เวลาเฉลี่ยแยกช่วงงาน</span>
                                        <Clock className="w-4 h-4 text-amber-500" />
                                    </div>
                                    <div className="mt-2 space-y-1 text-sm">
                                        <div className="flex justify-between">
                                            <span className="text-gray-500 text-xs">รอก่อนเข้าซ่อม:</span>
                                            <span className="font-bold text-gray-900">
                                                {serviceSummary.completedCount > 0
                                                    ? formatDurationMinutes(serviceSummary.avgWaitBeforeRepairMinutes)
                                                    : '-'}
                                            </span>
                                        </div>
                                        <div className="flex justify-between">
                                            <span className="text-gray-500 text-xs">กำลังซ่อม:</span>
                                            <span className="font-bold text-gray-900">
                                                {serviceSummary.completedCount > 0
                                                    ? formatDurationMinutes(serviceSummary.avgRepairMinutes)
                                                    : '-'}
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Filter Card */}
                            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
                                <div className="flex items-center gap-2 mb-4">
                                    <Filter className="w-5 h-5 text-gray-500" />
                                    <h2 className="font-semibold text-gray-900">ตัวกรองรายงานการเข้าใช้บริการ</h2>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-4">
                                    {canSelectBranch && (
                                        <div>
                                            <label className="block text-xs font-medium text-gray-700 mb-1">สาขา</label>
                                            <select
                                                value={svcBranch}
                                                onChange={(e) => setSvcBranch(e.target.value)}
                                                className="w-full text-sm text-gray-900 rounded-lg border-gray-300 focus:border-blue-500 focus:ring-blue-500"
                                            >
                                                <option value="all">ทุกสาขา</option>
                                                {branches.map((b) => (
                                                    <option key={b.BranchID} value={b.BranchID}>{b.BranchName}</option>
                                                ))}
                                            </select>
                                        </div>
                                    )}

                                    <div className="lg:col-span-2">
                                        <label className="block text-xs font-medium text-gray-700 mb-1">ช่วงวันที่เข้ารับบริการ (จาก - ถึง)</label>
                                        <div className="flex items-center gap-2">
                                            <div className="relative flex-1">
                                                <div className="absolute inset-y-0 left-0 pl-2.5 flex items-center pointer-events-none">
                                                    <Calendar className="h-4 w-4 text-gray-400" />
                                                </div>
                                                <input
                                                    type="date"
                                                    value={svcDateFrom}
                                                    onChange={(e) => setSvcDateFrom(e.target.value)}
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
                                                    value={svcDateTo}
                                                    onChange={(e) => setSvcDateTo(e.target.value)}
                                                    className="w-full pl-9 text-sm text-gray-900 rounded-lg border-gray-300 focus:border-blue-500 focus:ring-blue-500"
                                                />
                                            </div>
                                        </div>
                                    </div>

                                    <div>
                                        <label className="block text-xs font-medium text-gray-700 mb-1">รูปแบบเข้าบริการ</label>
                                        <select
                                            value={svcVisitType}
                                            onChange={(e) => setSvcVisitType(e.target.value)}
                                            className="w-full text-sm text-gray-900 rounded-lg border-gray-300 focus:border-blue-500 focus:ring-blue-500"
                                        >
                                            <option value="all">ทั้งหมด (นัดหมาย + Walk-in)</option>
                                            <option value="BOOKING">นัดหมายล่วงหน้า</option>
                                            <option value="WALK_IN">Walk-in</option>
                                        </select>
                                    </div>

                                    <div>
                                        <label className="block text-xs font-medium text-gray-700 mb-1">สถานะคิว</label>
                                        <select
                                            value={svcStatus}
                                            onChange={(e) => setSvcStatus(e.target.value)}
                                            className="w-full text-sm text-gray-900 rounded-lg border-gray-300 focus:border-blue-500 focus:ring-blue-500"
                                        >
                                            <option value="all">ทุกสถานะ</option>
                                            <option value="DONE">เสร็จสิ้น</option>
                                            <option value="ACTIVE">กำลังดำเนินการ (ทั้งหมด)</option>
                                            <option value="WAITING_CALL">รอเรียกคิว</option>
                                            <option value="WAITING_REPAIR">รอเข้าซ่อม</option>
                                            <option value="IN_REPAIR">กำลังซ่อม</option>
                                            <option value="WAITING_PAYMENT">รอชำระเงิน</option>
                                            <option value="CANCELLED">ยกเลิก</option>
                                            <option value="NO_SHOW">ไม่พบลูกค้า</option>
                                        </select>
                                    </div>

                                    <div>
                                        <label className="block text-xs font-medium text-gray-700 mb-1">ผลการประเมิน SLA</label>
                                        <select
                                            value={svcSlaResult}
                                            onChange={(e) => setSvcSlaResult(e.target.value)}
                                            className="w-full text-sm text-gray-900 rounded-lg border-gray-300 focus:border-blue-500 focus:ring-blue-500"
                                        >
                                            <option value="all">ทั้งหมด</option>
                                            <option value="PASS">ผ่าน SLA</option>
                                            <option value="OVER">เกิน SLA</option>
                                            <option value="NO_SLA">ไม่ระบุเกณฑ์ SLA (อื่นๆ / ไม่พบ Flat Rate)</option>
                                        </select>
                                    </div>

                                    <div className={canSelectBranch ? 'lg:col-span-3' : 'lg:col-span-2'}>
                                        <label className="block text-xs font-medium text-gray-700 mb-1">ค้นหา</label>
                                        <div className="relative">
                                            <div className="absolute inset-y-0 left-0 pl-2.5 flex items-center pointer-events-none">
                                                <Search className="h-4 w-4 text-gray-400" />
                                            </div>
                                            <input
                                                type="text"
                                                placeholder="ทะเบียนรถ, ชื่อลูกค้า, เลขคิว, เลขที่จอง"
                                                value={svcSearch}
                                                onChange={(e) => setSvcSearch(e.target.value)}
                                                onKeyDown={(e) => e.key === 'Enter' && fetchServiceReport()}
                                                className="w-full pl-9 text-sm text-gray-900 rounded-lg border-gray-300 focus:border-blue-500 focus:ring-blue-500"
                                            />
                                        </div>
                                    </div>

                                    <div className={cn(
                                        'flex items-end justify-end gap-3',
                                        canSelectBranch ? 'lg:col-span-3' : 'lg:col-span-5'
                                    )}>
                                        <Button
                                            onClick={exportServiceToExcel}
                                            disabled={sortedServiceItems.length === 0 || isServiceLoading}
                                            variant="outline"
                                            className="flex items-center gap-2 border-green-600 text-green-700 hover:bg-green-50 hover:text-green-800"
                                        >
                                            <Download className="w-4 h-4" />
                                            Export Excel
                                        </Button>
                                        <Button
                                            onClick={fetchServiceReport}
                                            disabled={isServiceLoading}
                                            className="flex items-center gap-2"
                                        >
                                            {isServiceLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                                            ดึงข้อมูล
                                        </Button>
                                    </div>
                                </div>
                            </div>

                            {/* Results Table */}
                            <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                                <div className="px-5 py-4 border-b border-gray-100 flex flex-wrap justify-between items-center gap-2 bg-gray-50">
                                    <div>
                                        <h3 className="font-semibold text-gray-800">รายการเข้าใช้บริการและประเมิน SLA</h3>
                                        <p className="text-xs text-gray-500">คลิกที่แถวเพื่อดูไทม์ไลน์ประวัติการเปลี่ยนสถานะโดยละเอียด</p>
                                    </div>
                                    <span className="text-sm text-gray-500">พบ {sortedServiceItems.length} รายการ</span>
                                </div>

                                <div className="overflow-x-auto">
                                    <table className="w-full text-left border-collapse">
                                        <thead>
                                            <tr className="bg-gray-50 border-b border-gray-100 text-xs uppercase text-gray-500 font-semibold tracking-wider">
                                                <th className="px-4 py-3 whitespace-nowrap">คิว / รูปแบบ</th>
                                                <th className="px-4 py-3 whitespace-nowrap">สาขา</th>
                                                <th className="px-4 py-3 whitespace-nowrap">ลูกค้า / รถ</th>
                                                <th className="px-4 py-3 whitespace-nowrap">บริการ</th>
                                                <th
                                                    className="px-4 py-3 whitespace-nowrap cursor-pointer hover:bg-gray-100 select-none"
                                                    onClick={() => toggleServiceSort('CheckInAt')}
                                                >
                                                    เวลาเข้า - เสร็จ / เริ่มนับ SLA{' '}
                                                    {svcSort.key === 'CheckInAt' ? (svcSort.dir === 'asc' ? '↑' : '↓') : ''}
                                                </th>
                                                <th className="px-4 py-3 whitespace-nowrap">เวลาแยกขั้นตอน</th>
                                                <th
                                                    className="px-4 py-3 whitespace-nowrap cursor-pointer hover:bg-gray-100 select-none"
                                                    onClick={() => toggleServiceSort('SlaMinutes')}
                                                >
                                                    เวลาที่ใช้ / เกณฑ์ SLA{' '}
                                                    {svcSort.key === 'SlaMinutes' ? (svcSort.dir === 'asc' ? '↑' : '↓') : ''}
                                                </th>
                                                <th
                                                    className="px-4 py-3 whitespace-nowrap cursor-pointer hover:bg-gray-100 select-none"
                                                    onClick={() => toggleServiceSort('SlaDiffMinutes')}
                                                >
                                                    สถานะ / ผล SLA{' '}
                                                    {svcSort.key === 'SlaDiffMinutes' ? (svcSort.dir === 'asc' ? '↑' : '↓') : ''}
                                                </th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-gray-100 text-sm">
                                            {isServiceLoading ? (
                                                <tr>
                                                    <td colSpan={8} className="px-4 py-20 text-center text-gray-500">
                                                        <Loader2 className="w-8 h-8 animate-spin mx-auto mb-2 text-blue-500" />
                                                        <p>กำลังโหลดข้อมูลการเข้าใช้บริการ...</p>
                                                    </td>
                                                </tr>
                                            ) : paginatedServiceItems.length === 0 ? (
                                                <tr>
                                                    <td colSpan={8} className="px-4 py-20 text-center text-gray-500">
                                                        ไม่พบข้อมูลการเข้าใช้บริการในช่วงเวลาที่เลือก
                                                    </td>
                                                </tr>
                                            ) : (
                                                paginatedServiceItems.map((item) => (
                                                    <tr
                                                        key={item.QueueID}
                                                        onClick={() => setSelectedQueueItem(item)}
                                                        className="hover:bg-blue-50/40 transition-colors cursor-pointer"
                                                    >
                                                        {/* คิว / รูปแบบ */}
                                                        <td className="px-4 py-3 align-top">
                                                            <div className="flex items-center gap-2">
                                                                <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-blue-600 text-white font-bold text-xs">
                                                                    {item.QueueLabel}
                                                                </span>
                                                                <span className="text-xs text-gray-500">
                                                                    {formatUtcDateSlash(item.QueueDate)}
                                                                </span>
                                                            </div>
                                                            <div className="mt-1.5 flex flex-wrap items-center gap-1">
                                                                {item.VisitType === 'BOOKING' ? (
                                                                    <span className="inline-block px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200 text-[11px] font-medium">
                                                                        นัดหมาย {item.BookingNo}
                                                                    </span>
                                                                ) : (
                                                                    <span className="inline-block px-2 py-0.5 rounded bg-gray-100 text-gray-700 text-[11px] font-medium">
                                                                        Walk-in
                                                                    </span>
                                                                )}
                                                                <span className="text-[10px] text-gray-400 font-mono">
                                                                    {item.BookingType}
                                                                </span>
                                                            </div>
                                                        </td>

                                                        {/* สาขา */}
                                                        <td className="px-4 py-3 align-top text-gray-700 whitespace-nowrap">
                                                            {item.BranchName}
                                                        </td>

                                                        {/* ลูกค้า / รถ */}
                                                        <td className="px-4 py-3 align-top">
                                                            <div className="font-bold text-gray-900">{item.CarRegister}</div>
                                                            {item.CarModel && (
                                                                <div className="text-xs text-gray-500">{item.CarModel}</div>
                                                            )}
                                                            <div className="text-xs text-gray-700 mt-0.5">{item.CustomerName}</div>
                                                            {item.CustomerPhone && (
                                                                <div className="text-[11px] text-gray-400">{item.CustomerPhone}</div>
                                                            )}
                                                        </td>

                                                        {/* บริการ */}
                                                        <td className="px-4 py-3 align-top max-w-[190px]">
                                                            <div className="text-gray-900 font-medium">{item.ServiceName}</div>
                                                            {item.Mileage != null && (
                                                                <div className="text-xs text-gray-500">
                                                                    ระยะ: {item.Mileage.toLocaleString()} กม.
                                                                </div>
                                                            )}
                                                            {item.FlatRateDescription && (
                                                                <div className="text-[11px] text-gray-500 truncate" title={item.FlatRateDescription}>
                                                                    {item.FlatRateDescription}
                                                                </div>
                                                            )}
                                                        </td>

                                                        {/* เวลาเข้า - เสร็จ / เริ่มนับ SLA */}
                                                        <td className="px-4 py-3 align-top whitespace-nowrap text-xs space-y-1">
                                                            {item.AppointmentStartTime && (
                                                                <div className="text-gray-600">
                                                                    <span className="text-gray-400">เวลานัด:</span>{' '}
                                                                    <span className="font-medium text-gray-800">
                                                                        {item.AppointmentStartTime}
                                                                        {item.AppointmentEndTime ? ` - ${item.AppointmentEndTime}` : ''}
                                                                    </span>
                                                                </div>
                                                            )}
                                                            <div className="text-gray-600 flex items-center gap-1.5">
                                                                <span className="text-gray-400">Check-in:</span>
                                                                <span className="font-medium text-gray-900">
                                                                    {formatBangkokTime(item.CheckInAt)} น.
                                                                </span>
                                                                {item.IsEarlyArrival && (
                                                                    <span className="px-1.5 py-0.5 rounded bg-sky-50 text-sky-700 border border-sky-200 text-[10px] font-medium">
                                                                        ก่อนนัด {formatDurationMinutes(item.EarlyArrivalMinutes)}
                                                                    </span>
                                                                )}
                                                            </div>
                                                            <div className="text-blue-700 font-medium">
                                                                <span className="text-gray-400 font-normal">เริ่มนับ SLA:</span>{' '}
                                                                {formatBangkokTime(item.SlaStartAt)} น.{' '}
                                                                <span className="text-[10px] text-gray-500 font-normal">
                                                                    ({item.SlaStartReason === 'APPOINTMENT_TIME'
                                                                        ? 'เวลานัด'
                                                                        : item.SlaStartReason === 'EARLY_SERVICE_START'
                                                                            ? 'รับงานก่อนนัด'
                                                                            : 'Check-in'})
                                                                </span>
                                                            </div>
                                                            {item.DoneAt && (
                                                                <div className="text-emerald-700">
                                                                    <span className="text-gray-400">เสร็จสิ้น:</span>{' '}
                                                                    <span className="font-medium">{formatBangkokTime(item.DoneAt)} น.</span>
                                                                </div>
                                                            )}
                                                        </td>

                                                        {/* เวลาแยกขั้นตอน */}
                                                        <td className="px-4 py-3 align-top whitespace-nowrap text-xs">
                                                            <div className="grid grid-cols-[62px_auto] gap-x-2 gap-y-0.5">
                                                                <span className="text-gray-400">รอเรียก:</span>
                                                                <span className="text-gray-700 font-medium">
                                                                    {formatDurationMinutes(item.StageMinutes.WAITING_CALL)}
                                                                </span>
                                                                <span className="text-gray-400">รอซ่อม:</span>
                                                                <span className="text-gray-700 font-medium">
                                                                    {formatDurationMinutes(item.StageMinutes.WAITING_REPAIR)}
                                                                </span>
                                                                <span className="text-gray-400">กำลังซ่อม:</span>
                                                                <span className="text-gray-700 font-medium">
                                                                    {formatDurationMinutes(item.StageMinutes.IN_REPAIR)}
                                                                </span>
                                                                <span className="text-gray-400">รอชำระ:</span>
                                                                <span className="text-gray-700 font-medium">
                                                                    {formatDurationMinutes(item.StageMinutes.WAITING_PAYMENT)}
                                                                </span>
                                                            </div>
                                                        </td>

                                                        {/* เวลาที่ใช้ / เกณฑ์ SLA */}
                                                        <td className="px-4 py-3 align-top whitespace-nowrap">
                                                            <div className="font-bold text-gray-900">
                                                                {item.SlaMinutes != null
                                                                    ? formatDurationMinutes(item.SlaMinutes)
                                                                    : '-'}
                                                            </div>
                                                            {item.TargetSlaMinutes != null ? (
                                                                <>
                                                                    <div className="text-xs text-gray-500 mt-0.5">
                                                                        เกณฑ์: {formatDurationMinutes(item.TargetSlaMinutes)}
                                                                    </div>
                                                                    <div className="text-[10px] text-gray-400">
                                                                        {item.TargetSlaSourceLabel}
                                                                    </div>
                                                                </>
                                                            ) : (
                                                                <div className="text-[11px] text-gray-400 mt-0.5">
                                                                    {item.TargetSlaSourceLabel}
                                                                </div>
                                                            )}
                                                            {item.ActualTotalMinutes != null &&
                                                                item.SlaMinutes != null &&
                                                                item.ActualTotalMinutes !== item.SlaMinutes && (
                                                                    <div className="mt-1 text-[11px] text-gray-500">
                                                                        เวลาจริงรวม: {formatDurationMinutes(item.ActualTotalMinutes)}
                                                                    </div>
                                                                )}
                                                        </td>

                                                        {/* สถานะ / ผล SLA */}
                                                        <td className="px-4 py-3 align-top whitespace-nowrap space-y-1.5">
                                                            <div>{renderQueueStatusBadge(item.Status, item.StatusLabel)}</div>
                                                            <div>{renderSlaBadge(item)}</div>
                                                        </td>
                                                    </tr>
                                                ))
                                            )}
                                        </tbody>
                                    </table>
                                </div>

                                {/* Pagination */}
                                {!isServiceLoading && sortedServiceItems.length > 0 && totalSvcPages > 1 && (
                                    <div className="flex items-center justify-between px-5 py-4 border-t border-gray-100 bg-gray-50/50">
                                        <p className="text-xs text-gray-500">
                                            แสดง {(svcPage - 1) * ITEMS_PER_PAGE + 1} -{' '}
                                            {Math.min(svcPage * ITEMS_PER_PAGE, sortedServiceItems.length)} จาก{' '}
                                            {sortedServiceItems.length} รายการ
                                        </p>
                                        <div className="flex gap-1.5">
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                onClick={() => setSvcPage((p) => Math.max(1, p - 1))}
                                                disabled={svcPage === 1}
                                            >
                                                <ChevronLeft className="w-4 h-4" />
                                            </Button>
                                            {getSvcPageNumbers().map((num) => (
                                                <Button
                                                    key={num}
                                                    variant={num === svcPage ? 'primary' : 'outline'}
                                                    size="sm"
                                                    onClick={() => setSvcPage(num)}
                                                    className={num === svcPage ? 'bg-blue-600 text-white hover:bg-blue-700' : ''}
                                                >
                                                    {num}
                                                </Button>
                                            ))}
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                onClick={() => setSvcPage((p) => Math.min(totalSvcPages, p + 1))}
                                                disabled={svcPage === totalSvcPages}
                                            >
                                                <ChevronRight className="w-4 h-4" />
                                            </Button>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </>
                    )}
                </div>
            </div>

            {/* Detail Modal for Queue SLA & Timeline */}
            <Modal
                isOpen={!!selectedQueueItem}
                onClose={() => setSelectedQueueItem(null)}
                title={selectedQueueItem ? `รายละเอียดการเข้าใช้บริการ คิว ${selectedQueueItem.QueueLabel}` : ''}
                size="2xl"
            >
                {selectedQueueItem && (
                    <div className="space-y-5">
                        {/* Header Badges */}
                        <div className="flex flex-wrap items-center gap-2">
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-blue-600 text-white text-xs font-bold">
                                <Ticket className="w-3.5 h-3.5" />
                                {selectedQueueItem.QueueLabel}
                            </span>
                            {renderQueueStatusBadge(selectedQueueItem.Status, selectedQueueItem.StatusLabel)}
                            {selectedQueueItem.VisitType === 'BOOKING' ? (
                                <span className="px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 text-xs font-medium">
                                    นัดหมายล่วงหน้า ({selectedQueueItem.BookingNo})
                                </span>
                            ) : (
                                <span className="px-2.5 py-1 rounded-full bg-gray-100 text-gray-700 text-xs font-medium">
                                    Walk-in
                                </span>
                            )}
                            {renderSlaBadge(selectedQueueItem)}
                        </div>

                        {/* Customer & Vehicle Info */}
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 bg-gray-50 rounded-xl p-4 text-sm">
                            <div>
                                <p className="text-xs text-gray-500">สาขา</p>
                                <p className="font-semibold text-gray-900">{selectedQueueItem.BranchName}</p>
                            </div>
                            <div>
                                <p className="text-xs text-gray-500">ทะเบียนรถ / รุ่น</p>
                                <p className="font-bold text-gray-900">
                                    {selectedQueueItem.CarRegister}
                                    {selectedQueueItem.CarModel ? ` · ${selectedQueueItem.CarModel}` : ''}
                                </p>
                            </div>
                            <div>
                                <p className="text-xs text-gray-500">ลูกค้า</p>
                                <p className="font-semibold text-gray-900">
                                    {selectedQueueItem.CustomerName}
                                    {selectedQueueItem.CustomerPhone ? ` (${selectedQueueItem.CustomerPhone})` : ''}
                                </p>
                            </div>
                            <div className="col-span-2 sm:col-span-3">
                                <p className="text-xs text-gray-500">บริการ</p>
                                <p className="font-medium text-gray-900">
                                    {selectedQueueItem.ServiceName}
                                    {selectedQueueItem.Mileage != null
                                        ? ` · ระยะ ${selectedQueueItem.Mileage.toLocaleString()} กม.`
                                        : ''}
                                    {selectedQueueItem.FlatRateDescription
                                        ? ` (${selectedQueueItem.FlatRateDescription})`
                                        : ''}
                                </p>
                            </div>
                        </div>

                        {/* SLA Calculation Summary Box */}
                        <div className="rounded-xl border border-blue-100 bg-blue-50/50 p-4 space-y-3">
                            <h4 className="text-sm font-semibold text-blue-900">สรุปการคำนวณเวลา SLA</h4>
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
                                <div>
                                    <p className="text-xs text-gray-500">เวลานัดหมาย</p>
                                    <p className="font-semibold text-gray-900">
                                        {selectedQueueItem.AppointmentStartTime
                                            ? `${selectedQueueItem.AppointmentStartTime} - ${selectedQueueItem.AppointmentEndTime || ''}`
                                            : 'ไม่มีนัด (Walk-in)'}
                                    </p>
                                </div>
                                <div>
                                    <p className="text-xs text-gray-500">เวลา Check-in</p>
                                    <p className="font-semibold text-gray-900">
                                        {formatBangkokTime(selectedQueueItem.CheckInAt)} น.
                                    </p>
                                    {selectedQueueItem.IsEarlyArrival && (
                                        <p className="text-[11px] text-sky-700">
                                            มาก่อนนัด {formatDurationMinutes(selectedQueueItem.EarlyArrivalMinutes)}
                                        </p>
                                    )}
                                </div>
                                <div>
                                    <p className="text-xs text-gray-500">เริ่มนับเวลา SLA</p>
                                    <p className="font-bold text-blue-700">
                                        {formatBangkokTime(selectedQueueItem.SlaStartAt)} น.
                                    </p>
                                    <p className="text-[11px] text-gray-500">{selectedQueueItem.SlaStartReasonLabel}</p>
                                </div>
                                <div>
                                    <p className="text-xs text-gray-500">เวลาเสร็จสิ้น</p>
                                    <p className="font-semibold text-gray-900">
                                        {selectedQueueItem.DoneAt
                                            ? `${formatBangkokTime(selectedQueueItem.DoneAt)} น.`
                                            : '-'}
                                    </p>
                                </div>
                            </div>

                            <div className="pt-2 border-t border-blue-100 grid grid-cols-3 gap-3 text-sm">
                                <div>
                                    <p className="text-xs text-gray-500">เวลาที่ใช้ / คิด SLA</p>
                                    <p className="text-base font-bold text-gray-900">
                                        {formatDurationMinutes(selectedQueueItem.SlaMinutes)}
                                    </p>
                                </div>
                                <div>
                                    <p className="text-xs text-gray-500">เกณฑ์ SLA เป้าหมาย</p>
                                    <p className="text-base font-bold text-gray-900">
                                        {selectedQueueItem.TargetSlaMinutes != null
                                            ? formatDurationMinutes(selectedQueueItem.TargetSlaMinutes)
                                            : 'ไม่กำหนดเกณฑ์'}
                                    </p>
                                    <p className="text-[11px] text-gray-500">{selectedQueueItem.TargetSlaSourceLabel}</p>
                                </div>
                                <div>
                                    <p className="text-xs text-gray-500">เวลาจริงตั้งแต่ Check-in</p>
                                    <p className="text-base font-semibold text-gray-700">
                                        {formatDurationMinutes(selectedQueueItem.ActualTotalMinutes)}
                                    </p>
                                </div>
                            </div>
                        </div>

                        {/* 4 Stage Cards */}
                        <div>
                            <h4 className="text-sm font-semibold text-gray-800 mb-2">ระยะเวลาในแต่ละขั้นตอน</h4>
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-center">
                                <div className="rounded-lg border border-amber-200 bg-amber-50/60 p-2.5">
                                    <p className="text-xs text-amber-800">รอเรียกคิว</p>
                                    <p className="mt-1 font-bold text-gray-900 text-sm">
                                        {formatDurationMinutes(selectedQueueItem.StageMinutes.WAITING_CALL)}
                                    </p>
                                </div>
                                <div className="rounded-lg border border-sky-200 bg-sky-50/60 p-2.5">
                                    <p className="text-xs text-sky-800">รอเข้าซ่อม</p>
                                    <p className="mt-1 font-bold text-gray-900 text-sm">
                                        {formatDurationMinutes(selectedQueueItem.StageMinutes.WAITING_REPAIR)}
                                    </p>
                                </div>
                                <div className="rounded-lg border border-indigo-200 bg-indigo-50/60 p-2.5">
                                    <p className="text-xs text-indigo-800">กำลังซ่อม</p>
                                    <p className="mt-1 font-bold text-gray-900 text-sm">
                                        {formatDurationMinutes(selectedQueueItem.StageMinutes.IN_REPAIR)}
                                    </p>
                                </div>
                                <div className="rounded-lg border border-violet-200 bg-violet-50/60 p-2.5">
                                    <p className="text-xs text-violet-800">รอชำระเงิน</p>
                                    <p className="mt-1 font-bold text-gray-900 text-sm">
                                        {formatDurationMinutes(selectedQueueItem.StageMinutes.WAITING_PAYMENT)}
                                    </p>
                                </div>
                            </div>
                        </div>

                        {/* Timeline Logs */}
                        <div>
                            <h4 className="text-sm font-semibold text-gray-800 mb-2">ประวัติการเปลี่ยนสถานะ</h4>
                            <ol className="max-h-56 overflow-y-auto border-l-2 border-gray-200 pl-4 space-y-2.5 text-sm">
                                {selectedQueueItem.Timeline.length === 0 ? (
                                    <li className="text-gray-400 text-xs">ไม่มีประวัติบันทึกสถานะ</li>
                                ) : (
                                    selectedQueueItem.Timeline.map((step) => (
                                        <li key={step.logId}>
                                            <p className="font-medium text-gray-800">
                                                {step.fromStatus && step.fromStatus !== step.toStatus
                                                    ? `${QUEUE_STATUS_LABEL[step.fromStatus as QueueStatus] ?? step.fromStatus} → `
                                                    : ''}
                                                {QUEUE_STATUS_LABEL[step.toStatus as QueueStatus] ?? step.toStatus}
                                                {step.spentMinutes != null && step.fromStatus && step.fromStatus !== step.toStatus && (
                                                    <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
                                                        ใช้เวลา {formatDurationMinutes(step.spentMinutes)}
                                                    </span>
                                                )}
                                            </p>
                                            <p className="text-xs text-gray-500">
                                                {formatBangkokTime(step.at)} น. · {step.actionByName || '-'}
                                                {step.note ? ` · ${step.note}` : ''}
                                            </p>
                                        </li>
                                    ))
                                )}
                            </ol>
                        </div>
                    </div>
                )}
            </Modal>
        </div>
    );
}

export default function BookingReportPage() {
    return (
        <Suspense
            fallback={
                <div className="min-h-screen flex items-center justify-center bg-gray-50/50">
                    <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
                </div>
            }
        >
            <ReportsPageContent />
        </Suspense>
    );
}
