// Booking List & Creation Page
// Handles displaying bookings and modal for creating bookings with slot capacity checks

'use client';

import { useEffect, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useSession } from 'next-auth/react';
import {
    Card,
    CardContent,
    Button,
    Input,
    Select,
    Badge,
    LoadingPage,
    Modal,
} from '@/components/ui';
import { Header } from '@/components/layouts';
import { formatDate } from '@/lib/utils';
import { Branch, SlotAvailability } from '@/types';
import { Plus, Settings, Check, X, ClipboardCopy, Search, Calendar, Clock, Pencil, PhoneCall, Timer } from 'lucide-react';
import { CSStatusModal } from '@/components/bookings/modals/CSStatusModal';
import { RescheduleModal } from '@/components/bookings/modals/RescheduleModal';
import { BookingDetailModal } from '@/components/bookings/modals/BookingDetailModal';
import { SlotOverrideModal } from '@/components/bookings/modals/SlotOverrideModal';
import { DurationExtensionModal } from '@/components/bookings/modals/DurationExtensionModal';
import { ActionConfirmModal, defaultActionModal } from '@/components/bookings/modals/ActionConfirmModal';
import type { ActionModalState } from '@/components/bookings/modals/ActionConfirmModal';

interface Booking {
    BookingID: number;
    BookingNo: string;
    BookingDate: string;
    StartTime: string;
    EndTime: string;
    CustomerName: string;
    CustomerPhone: string | null;
    CarModel: string;
    CarRegister: string;
    VinNo: string | null;
    ProjectType: string | null;
    InventoryItemID: number | null;
    LastMileage: number;
    Mileage: number;
    ClaimDetail: string | null;
    Status: number; // 0=Pending, 1=Approved, 2=Cancelled, 3=Claimed
    ClaimID: number | null;
    Branch: { BranchName: string };
    BranchID: number;
    BookingType: string;
    CSStatus: string;
    BayID?: number | null;
    Logs?: any[];
}

function BookingsPageContent() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const { data: session } = useSession();
    const [bookings, setBookings] = useState<Booking[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [branches, setBranches] = useState<Branch[]>([]);

    // Filters
    const dateFromParam = searchParams.get('date');
    const searchFromParam = searchParams.get('search');
    const [filterDate, setFilterDate] = useState<string>(
        dateFromParam || new Date().toISOString().split('T')[0]
    );
    const [filterBranch, setFilterBranch] = useState<string>('');
    const [filterStatus] = useState<string>('');
    const [searchQuery, setSearchQuery] = useState<string>(searchFromParam || '');

    useEffect(() => {
        const dParam = searchParams.get('date');
        if (dParam) {
            setFilterDate(dParam);
            const parts = dParam.split('-');
            if (parts.length === 3) {
                const y = parseInt(parts[0]);
                const m = parseInt(parts[1]);
                if (y && m) {
                    setCalendarYear(y);
                    setCalendarMonth(m);
                }
            }
        }
        const sParam = searchParams.get('search');
        if (sParam) {
            setSearchQuery(sParam);
        }
    }, [searchParams]);

    // Pagination
    const [pagination, setPagination] = useState({
        total: 0,
        page: 1,
        pageSize: 10,
        totalPages: 0,
    });

    const isAdmin = session?.user?.role === 'ADMIN';
    const isCS = session?.user?.role === 'CS';
    const canSelectBranch = isAdmin || isCS;

    // Daily Slots timetable
    const [dailySlots, setDailySlots] = useState<SlotAvailability[]>([]);
    const [isLoadingDailySlots, setIsLoadingDailySlots] = useState(false);
    const [isBranchClosedDaily, setIsBranchClosedDaily] = useState(false);
    const [branchClosedReasonDaily, setBranchClosedReasonDaily] = useState('');

    // Monthly Calendar state
    const [calendarYear, setCalendarYear] = useState(new Date().getFullYear());
    const [calendarMonth, setCalendarMonth] = useState(new Date().getMonth() + 1);
    const [calendarData, setCalendarData] = useState<Record<string, {
        isClosed: boolean;
        reason: string;
        maxQueue: number;
        bookedCount: number;
        hasOverride?: boolean;
    }>>({});
    const [isLoadingCalendar, setIsLoadingCalendar] = useState(false);

    // CS Status Update Modal
    const [isCSModalOpen, setIsCSModalOpen] = useState(false);
    const [selectedCSBooking, setSelectedCSBooking] = useState<Booking | null>(null);

    // Custom Action Confirmation Modal (Replaces native confirm / prompt / alert)
    const [actionModal, setActionModal] = useState<ActionModalState>(defaultActionModal);

    const canManageOverride = session?.user?.role === 'ADMIN' || session?.user?.role === 'SERVICE_CENTER';

    // Slot Override Modal state
    const [isOverrideModalOpen, setIsOverrideModalOpen] = useState(false);
    const [overrideSlot, setOverrideSlot] = useState<SlotAvailability | null>(null);

    // Overdue and Reschedule states
    const [showOverdueOnly, setShowOverdueOnly] = useState(false);
    const [overdueCount, setOverdueCount] = useState(0);

    const [selectedBookingForReschedule, setSelectedBookingForReschedule] = useState<Booking | null>(null);
    const [isRescheduleModalOpen, setIsRescheduleModalOpen] = useState(false);
    
    // Booking Detail Modal state
    const [detailBookingId, setDetailBookingId] = useState<number | null>(null);
    const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);

    // Duration Extension Modal state
    const [isDurationModalOpen, setIsDurationModalOpen] = useState(false);
    const [selectedBookingForDuration, setSelectedBookingForDuration] = useState<Booking | null>(null);

    const handleOpenDurationModal = (booking: Booking) => {
        setSelectedBookingForDuration(booking);
        setIsDurationModalOpen(true);
    };

    const handleViewDetail = (bookingId: number) => {
        setDetailBookingId(bookingId);
        setIsDetailModalOpen(true);
    };

    const toDateInputString = (isoString: string) => {
        try {
            return new Date(isoString).toISOString().split('T')[0];
        } catch {
            return '';
        }
    };

    // Slot Override Handlers
    const handleOpenOverrideModal = (slot: SlotAvailability) => {
        setOverrideSlot(slot);
        setIsOverrideModalOpen(true);
    };

    const executeRemoveOverride = async (slot: SlotAvailability) => {
        try {
            // First get the override ID
            const res = await fetch(`/api/bookings/slot-overrides?branchId=${filterBranch}&date=${filterDate}`);
            const data = await res.json();
            if (data.success) {
                const override = data.data.find(
                    (o: any) => o.StartTime === slot.StartTime && o.EndTime === slot.EndTime
                );
                if (override) {
                    const delRes = await fetch(`/api/bookings/slot-overrides?overrideId=${override.OverrideID}`, {
                        method: 'DELETE',
                    });
                    const delData = await delRes.json();
                    if (delData.success) {
                        fetchDailySlots();
                        fetchCalendarData();
                    } else {
                        setActionModal({
                            isOpen: true,
                            title: 'ลบไม่สำเร็จ',
                            message: delData.error || 'ไม่สามารถรีเซ็ตสล็อตกลับค่าเริ่มต้นได้',
                            type: 'error',
                            reasonText: '',
                        });
                    }
                }
            }
        } catch (err) {
            console.error('Error removing override:', err);
            setActionModal({
                isOpen: true,
                title: 'เกิดข้อผิดพลาด',
                message: 'เกิดข้อผิดพลาดในการทำรายการ',
                type: 'error',
                reasonText: '',
            });
        }
    };

    const handleRemoveOverride = (slot: SlotAvailability) => {
        if (!filterBranch || !filterDate) return;
        setActionModal({
            isOpen: true,
            title: 'รีเซ็ตสล็อตเวลา',
            message: `คุณต้องการรีเซ็ตสล็อตเวลา ${slot.StartTime}-${slot.EndTime} น. กลับค่าเริ่มต้นใช่หรือไม่?`,
            type: 'confirm',
            reasonText: '',
            onConfirm: () => executeRemoveOverride(slot),
        });
    };

    const fetchCalendarData = async () => {
        setIsLoadingCalendar(true);
        try {
            const res = await fetch(`/api/bookings/calendar?branchId=${filterBranch}&year=${calendarYear}&month=${calendarMonth}&search=${encodeURIComponent(searchQuery)}`);
            const data = await res.json();
            if (data.success) {
                setCalendarData(data.data);
            } else {
                setCalendarData({});
            }
        } catch (err) {
            console.error('Error fetching calendar data:', err);
            setCalendarData({});
        } finally {
            setIsLoadingCalendar(false);
        }
    };

    useEffect(() => {
        if (session?.user) {
            fetchCalendarData();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [session, filterBranch, calendarYear, calendarMonth, searchQuery]);

    const handlePrevMonth = () => {
        if (calendarMonth === 1) {
            setCalendarMonth(12);
            setCalendarYear(prev => prev - 1);
        } else {
            setCalendarMonth(prev => prev - 1);
        }
    };

    const handleNextMonth = () => {
        if (calendarMonth === 12) {
            setCalendarMonth(1);
            setCalendarYear(prev => prev + 1);
        } else {
            setCalendarMonth(prev => prev + 1);
        }
    };

    const monthNamesThai = [
        'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
        'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'
    ];

    const renderCalendarCells = () => {
        const daysInMonth = new Date(calendarYear, calendarMonth, 0).getDate();
        const firstDayIndex = new Date(calendarYear, calendarMonth - 1, 1).getDay(); // 0 = Sun, 6 = Sat
        
        const cells = [];
        
        // Blank cells before the first day of the month
        for (let i = 0; i < firstDayIndex; i++) {
            cells.push(<div key={`empty-${i}`} className="bg-gray-50/50 border border-gray-100 rounded-xl h-24" />);
        }
        
        // Days in the month
        for (let day = 1; day <= daysInMonth; day++) {
            const dateStr = `${calendarYear}-${String(calendarMonth).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
            const stats = calendarData[dateStr] || { isClosed: false, reason: '', maxQueue: 0, bookedCount: 0 };
            
            const isSelected = filterDate === dateStr;
            const isToday = new Date().toISOString().split('T')[0] === dateStr;
            
            const todayStr = new Date().toISOString().split('T')[0];
            const isPast = dateStr < todayStr;

            let bgClass = 'bg-white border-gray-200 hover:bg-blue-50/20';
            let borderClass = 'border-gray-100';
            
            if (isPast) {
                bgClass = 'bg-gray-100/40 text-gray-400 cursor-not-allowed opacity-50';
                borderClass = 'border-gray-200';
            } else if (stats.isClosed) {
                bgClass = 'bg-red-50/20 text-gray-400 cursor-not-allowed opacity-60';
                borderClass = 'border-red-100';
            } else if (stats.maxQueue > 0) {
                const percent = (stats.bookedCount / stats.maxQueue) * 100;
                if (percent >= 100) {
                    bgClass = 'bg-red-100/60 hover:bg-red-200/50 text-red-900 border-red-300';
                    borderClass = 'border-red-300';
                } else if (percent >= 80) {
                    bgClass = 'bg-amber-50/60 hover:bg-amber-100/50 text-amber-800';
                    borderClass = 'border-amber-200';
                } else {
                    bgClass = 'bg-green-50/40 hover:bg-green-100/40 text-green-800';
                    borderClass = 'border-green-200';
                }
            }

            if (isSelected) {
                borderClass = 'border-blue-500 ring-2 ring-blue-500/20';
            }

            cells.push(
                <div
                    key={`day-${day}`}
                    onClick={() => {
                        if (!isPast) {
                            setFilterDate(dateStr);
                        }
                    }}
                    className={`p-2 border rounded-xl flex flex-col justify-between transition-all duration-200 h-24 text-left cursor-pointer ${bgClass} ${borderClass}`}
                >
                    <div className="flex items-center justify-between w-full">
                        <span className={`text-sm font-bold ${isToday ? 'bg-blue-600 text-white w-6 h-6 rounded-full flex items-center justify-center' : 'text-gray-700'}`}>
                            {day}
                        </span>
                        
                        <div className="flex items-center gap-1.5">
                            {stats.hasOverride && !isPast && <span className="w-2 h-2 rounded-full bg-orange-400 animate-pulse" title="มีการปรับโควตาชั่วคราว" />}
                            {isToday && <span className="text-[9px] bg-blue-100 text-blue-800 font-bold px-1 rounded">วันนี้</span>}
                            {!isPast && !stats.isClosed && (
                                <button
                                    type="button"
                                    title="จองคิวสำหรับวันนี้"
                                    onClick={(e) => {
                                        e.stopPropagation(); // Avoid triggering cell click selection
                                        handleNewBookingRedirect(dateStr);
                                    }}
                                    className="bg-blue-600 hover:bg-blue-700 text-white text-[12px] font-bold w-5 h-5 rounded-md flex items-center justify-center shadow-sm hover:scale-110 transition-all duration-200"
                                >
                                    +
                                </button>
                            )}
                        </div>
                    </div>

                    <div className="mt-2 w-full">
                        {isPast ? (
                            <span className="text-[10px] text-gray-400 block font-medium">
                                ผ่านมาแล้ว
                            </span>
                        ) : stats.isClosed ? (
                            <span className="text-[10px] font-bold text-red-500 block truncate" title={stats.reason}>
                                🚫 {stats.reason || 'ปิดทำการ'}
                            </span>
                        ) : stats.maxQueue > 0 ? (
                            <div>
                                {stats.bookedCount >= stats.maxQueue ? (
                                    <span className="text-[10px] font-extrabold text-red-600 block animate-pulse">
                                        🔴 คิวเต็มแล้ว
                                    </span>
                                ) : (
                                    <div className="text-[10px] font-semibold text-gray-600">
                                        จอง {stats.bookedCount}/{stats.maxQueue} คิว
                                    </div>
                                )}
                                <div className="w-full bg-gray-200 rounded-full h-1.5 mt-1 overflow-hidden">
                                    <div 
                                        className={`h-1.5 rounded-full ${
                                            (stats.bookedCount / stats.maxQueue) >= 1
                                                ? 'bg-red-500'
                                                : (stats.bookedCount / stats.maxQueue) >= 0.8
                                                    ? 'bg-amber-500'
                                                    : 'bg-green-500'
                                        }`}
                                        style={{ width: `${Math.min(100, (stats.bookedCount / stats.maxQueue) * 100)}%` }}
                                    />
                                </div>
                            </div>
                        ) : (
                            <span className={`text-[10px] block ${stats.bookedCount > 0 ? 'text-blue-600 font-bold' : 'text-gray-400'}`}>
                                {stats.bookedCount > 0 ? `จองแล้ว ${stats.bookedCount} คิว` : 'ไม่มีคิว'}
                            </span>
                        )}
                    </div>
                </div>
            );
        }
        
        return cells;
    };

    const fetchDailySlots = async () => {
        if (!filterBranch) {
            setDailySlots([]);
            setIsBranchClosedDaily(false);
            return;
        }

        setIsLoadingDailySlots(true);
        setIsBranchClosedDaily(false);
        setBranchClosedReasonDaily('');

        try {
            const res = await fetch(`/api/bookings/slots?branchId=${filterBranch}&date=${filterDate}`, { cache: 'no-store' });
            const data = await res.json();
            if (data.success) {
                if (data.isClosed) {
                    setIsBranchClosedDaily(true);
                    setBranchClosedReasonDaily(data.reason || 'สาขาปิดทำการ');
                    setDailySlots([]);
                } else {
                    setDailySlots(data.data || []);
                }
            } else {
                setDailySlots([]);
            }
        } catch (err) {
            console.error('Error fetching daily slots:', err);
            setDailySlots([]);
        } finally {
            setIsLoadingDailySlots(false);
        }
    };

    useEffect(() => {
        if (session?.user) {
            fetchDailySlots();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [session, filterBranch, filterDate]);

    // Reload Bookings
    useEffect(() => {
        if (session?.user) {
            fetchBookings();
            fetchOverdueCount();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [session, filterDate, filterBranch, filterStatus, pagination.page, showOverdueOnly, searchQuery]);

    useEffect(() => {
        if (session?.user) {
            fetchBranches();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [session]);



    const fetchOverdueCount = async () => {
        try {
            const params = new URLSearchParams();
            params.set('isOverdue', 'true');
            params.set('page', '1');
            params.set('pageSize', '1');
            
            // Branch restriction
            if (!canSelectBranch && session?.user?.branchId) {
                params.set('branchId', session.user.branchId.toString());
            } else if (filterBranch) {
                params.set('branchId', filterBranch);
            }

            const res = await fetch(`/api/bookings?${params.toString()}`);
            const data = await res.json();
            if (data.success) {
                setOverdueCount(data.total);
            }
        } catch (err) {
            console.error('Error loading overdue count:', err);
        }
    };

    const fetchBranches = async () => {
        try {
            const res = await fetch('/api/branches');
            const data = await res.json();
            if (data.success) {
                setBranches(data.data);
                // For SERVICE_CENTER, default branch is assigned in state
                if (!canSelectBranch && session?.user?.branchId) {
                    setFilterBranch(session.user.branchId.toString());
                }
            }
        } catch (err) {
            console.error('Error fetching branches:', err);
        }
    };

    const fetchBookings = async (page = 1) => {
        setIsLoading(true);
        try {
            const params = new URLSearchParams();
            params.set('page', page.toString());
            params.set('pageSize', pagination.pageSize.toString());
            
            if (showOverdueOnly) {
                params.set('isOverdue', 'true');
            } else {
                if (filterDate && !searchQuery) params.set('date', filterDate);
                if (filterStatus) params.set('status', filterStatus);
            }
            
            // Branch restriction
            if (!canSelectBranch && session?.user?.branchId) {
                params.set('branchId', session.user.branchId.toString());
            } else if (filterBranch) {
                params.set('branchId', filterBranch);
            }

            if (searchQuery) params.set('search', searchQuery);

            const res = await fetch(`/api/bookings?${params.toString()}`);
            const data = await res.json();

            if (data.success) {
                setBookings(data.data);
                setPagination(prev => ({
                    ...prev,
                    page,
                    total: data.total,
                    totalPages: data.totalPages,
                }));
            }
        } catch (err) {
            console.error('Error loading bookings:', err);
        } finally {
            setIsLoading(false);
        }
    };

    const handleNewBookingRedirect = (customDate?: string, startTime?: string, endTime?: string) => {
        const queryParams = new URLSearchParams();
        if (filterBranch) queryParams.set('branchId', filterBranch);
        queryParams.set('date', customDate || filterDate || new Date().toISOString().split('T')[0]);
        if (startTime) queryParams.set('startTime', startTime);
        if (endTime) queryParams.set('endTime', endTime);
        
        // Redirect to Bay Calendar for bay-based booking
        router.push(`/service-center/bookings/bay-calendar?${queryParams.toString()}`);
    };

    // Actions (Approve / Cancel)
    const executeStatusUpdate = async (bookingId: number, status: number, reason: string) => {
        try {
            const res = await fetch(`/api/bookings/${bookingId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ status, cancelReason: reason }),
            });
            const data = await res.json();
            if (data.success) {
                fetchBookings();
                fetchDailySlots();
                fetchCalendarData();
                fetchOverdueCount();
            } else {
                setActionModal({
                    isOpen: true,
                    title: 'เกิดข้อผิดพลาด',
                    message: data.error || 'ดำเนินการล้มเหลว',
                    type: 'error',
                    reasonText: '',
                });
            }
        } catch (err) {
            console.error('Error updating status:', err);
            setActionModal({
                isOpen: true,
                title: 'เกิดข้อผิดพลาด',
                message: 'เกิดข้อผิดพลาดในการทำรายการ',
                type: 'error',
                reasonText: '',
            });
        }
    };

    const handleStatusUpdate = (bookingId: number, status: number) => {
        if (status === 2) {
            // Cancel with reason
            setActionModal({
                isOpen: true,
                title: 'ยกเลิกการจองคิว',
                message: 'กรุณาระบุเหตุผลในการยกเลิกคิว (เช่น ลูกค้าแจ้งยกเลิก, ข้อมูลไม่ถูกต้อง)',
                type: 'cancel_reason',
                reasonText: '',
                onConfirm: (reason) => executeStatusUpdate(bookingId, 2, reason || 'ไม่ได้ระบุเหตุผล'),
            });
        } else {
            // Approve or Close job
            const title = status === 1 ? 'ยืนยันอนุมัติคิว' : 'ยืนยันปิดงาน Retail';
            const message = status === 1 ? 'คุณต้องการยืนยันอนุมัติคิวการจองนี้ใช่หรือไม่?' : 'คุณต้องการยืนยันปิดงานคิว Retail นี้ใช่หรือไม่?';
            setActionModal({
                isOpen: true,
                title,
                message,
                type: 'confirm',
                reasonText: '',
                onConfirm: () => executeStatusUpdate(bookingId, status, ''),
            });
        }
    };

    const handleOpenReschedule = (booking: Booking) => {
        if (booking.BayID) {
            const bookingDateStr = new Date(booking.BookingDate).toISOString().split('T')[0];
            router.push(`/service-center/bookings/bay-calendar?branchId=${booking.BranchID}&date=${bookingDateStr}&bookingId=${booking.BookingID}`);
            return;
        }
        setSelectedBookingForReschedule(booking);
        setIsRescheduleModalOpen(true);
    };

    const openCSModal = (booking: Booking) => {
        setSelectedCSBooking(booking);
        setIsCSModalOpen(true);
    };

    const handleSaveCSStatus = async (bookingId: number, csStatus: string, note: string) => {
        try {
            const res = await fetch(`/api/bookings/${bookingId}/cs-status`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ csStatus, note })
            });
            if (res.ok) {
                fetchBookings(pagination.page);
            } else {
                setActionModal({
                    isOpen: true,
                    title: 'อัปเดตไม่สำเร็จ',
                    message: 'ไม่สามารถบันทึกสถานะ CS ได้',
                    type: 'error',
                    reasonText: '',
                });
            }
        } catch (error) {
            console.error(error);
            setActionModal({
                isOpen: true,
                title: 'เกิดข้อผิดพลาด',
                message: 'เกิดข้อผิดพลาดในการเชื่อมต่อเซิร์ฟเวอร์',
                type: 'error',
                reasonText: '',
            });
        }
    };

    const getStatusText = (status: number) => {
        switch (status) {
            case 0: return 'รออนุมัติ';
            case 1: return 'อนุมัติแล้ว';
            case 2: return 'ยกเลิก';
            case 3: return 'เปิดใบเคลมแล้ว';
            case 4: return 'ปิดงาน';
            default: return 'ไม่ทราบ';
        }
    };

    const getCSStatusBadge = (csStatus: string) => {
        switch (csStatus) {
            case 'FOLLOW_UP': return <span className="mt-1 inline-block bg-orange-100 text-orange-700 px-2 py-0.5 rounded text-[10px] font-medium border border-orange-200">CS: ติดตามผล</span>;
            case 'CONFIRMED': return <span className="mt-1 inline-block bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded text-[10px] font-medium border border-emerald-200">CS: ยืนยันแล้ว</span>;
            case 'NO_ANSWER': return <span className="mt-1 inline-block bg-red-100 text-red-700 px-2 py-0.5 rounded text-[10px] font-medium border border-red-200">CS: โทรไม่รับสาย</span>;
            default: return null;
        }
    };

    const handleCSUpdateClick = (booking: Booking) => {
        setSelectedCSBooking(booking);
        setIsCSModalOpen(true);
    };

    const getStatusVariant = (status: number) => {
        switch (status) {
            case 0: return 'warning';
            case 1: return 'success';
            case 2: return 'danger';
            case 3: return 'info';
            case 4: return 'success';
            default: return 'neutral';
        }
    };

    const getCancelReason = (booking: Booking) => {
        if (!booking.Logs || booking.Logs.length === 0) return null;
        const cancelLog = booking.Logs.find(log => log.LogType === 'CANCEL' || log.LogType === 'REJECTED');
        if (!cancelLog) return null;
        const content = cancelLog.Content;
        if (content.includes('เนื่องจาก: ')) {
            return content.split('เนื่องจาก: ')[1];
        }
        if (content.includes('Reason: ')) {
            return content.split('Reason: ')[1];
        }
        if (content === 'ยกเลิกคิวนัดหมายเข้ารับบริการ') {
            return 'ไม่ได้ระบุเหตุผล';
        }
        return content;
    };


    const branchOptions = branches.map(b => ({
        value: b.BranchID.toString(),
        label: b.BranchName,
    }));

    return (
        <>
            <Header title="จัดการคิวคัดกรองเช็คระยะ" subtitle="ระบบจองคิวเข้าตรวจเช็คระยะของศูนย์บริการ EV" />

            <div className="mt-6 space-y-6">
                {/* Dashboard Controls */}
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div className="flex flex-wrap items-center gap-3">
                        {canSelectBranch && (
                            <div className="w-48">
                                <Select
                                    value={filterBranch}
                                    onChange={(e) => setFilterBranch(e.target.value)}
                                    options={[{ value: '', label: 'ทุกสาขา' }, ...branchOptions]}
                                />
                            </div>
                        )}

                        <div className="relative w-64">
                            <Input
                                placeholder="ค้นหา ทะเบียน/ชื่อลูกค้า..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="pr-10"
                            />
                            <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => fetchBookings()}
                                className="absolute right-1 top-1 h-8 w-8 p-0"
                            >
                                <Search className="h-4 w-4" />
                            </Button>
                        </div>
                    </div>

                    <div className="flex items-center gap-2">
                        {!isCS && (
                            <Button variant="outline" onClick={() => router.push('/service-center/bookings/settings')}>
                                <Settings className="w-4 h-4 mr-2" />
                                ตั้งค่าสล็อตคิว
                            </Button>
                        )}
                        <Button onClick={() => handleNewBookingRedirect()}>
                            <Plus className="w-4 h-4 mr-2" />
                            จองคิวใหม่
                        </Button>
                    </div>
                </div>

                {/* Tabs for Overdue Filter */}
                <div className="flex border-b border-gray-200">
                    <button
                        type="button"
                        onClick={() => setShowOverdueOnly(false)}
                        className={`py-2 px-4 text-sm font-semibold border-b-2 transition-all ${
                            !showOverdueOnly
                                ? 'border-blue-500 text-blue-600'
                                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                        }`}
                    >
                        📅 คิวปกติประจำวัน
                    </button>
                    <button
                        type="button"
                        onClick={() => {
                            setShowOverdueOnly(true);
                            setPagination(prev => ({ ...prev, page: 1 }));
                        }}
                        className={`py-2 px-4 text-sm font-semibold border-b-2 transition-all flex items-center gap-2 ${
                            showOverdueOnly
                                ? 'border-red-500 text-red-600'
                                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                        }`}
                    >
                        ⚠️ คิวตกค้าง (ยังไม่เปิดเคลม)
                        {overdueCount > 0 && (
                            <span className="bg-red-100 text-red-600 text-xs px-2 py-0.5 rounded-full font-bold animate-pulse">
                                {overdueCount}
                            </span>
                        )}
                    </button>
                </div>

                {/* Monthly Calendar View */}
                {!showOverdueOnly && (
                    <Card className="bg-white border border-gray-100 shadow-sm rounded-xl p-5">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6 pb-4 border-b border-gray-100">
                        <div>
                            <h3 className="text-sm font-semibold text-gray-800 flex items-center gap-1.5">
                                <Calendar className="w-4 h-4 text-blue-600 animate-pulse" />
                                ปฏิทินความจุคิวบริการรายเดือน: <span className="text-blue-600 font-bold">{branches.find(b => b.BranchID.toString() === filterBranch)?.BranchName || 'ทุกสาขา'}</span>
                            </h3>
                                <p className="text-xs text-gray-400 mt-0.5">
                                    ประจำเดือน {monthNamesThai[calendarMonth - 1]} {calendarYear + 543} (คลิกเลือกวันที่บนปฏิทิน เพื่อตรวจสอบและจองคิวว่างด้านล่าง)
                                </p>
                            </div>
                            <div className="flex items-center gap-2">
                                <Button size="sm" variant="outline" onClick={handlePrevMonth}>
                                    &larr; เดือนก่อนหน้า
                                </Button>
                                <div className="text-xs font-bold text-gray-700 px-3 py-1 bg-gray-50 border border-gray-100 rounded-lg">
                                    {monthNamesThai[calendarMonth - 1]} {calendarYear + 543}
                                </div>
                                <Button size="sm" variant="outline" onClick={handleNextMonth}>
                                    เดือนถัดไป &rarr;
                                </Button>
                            </div>
                        </div>

                        {isLoadingCalendar ? (
                            <div className="flex items-center justify-center py-12 text-sm text-gray-400">
                                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600 mr-2"></div>
                                กำลังโหลดปฏิทินความจุคิว...
                            </div>
                        ) : (
                            <div>
                                {/* Calendar Header (Days of week) */}
                                <div className="grid grid-cols-7 gap-2 text-center text-xs font-bold text-gray-400 uppercase mb-2">
                                    <div className="py-1 text-red-500">อา.</div>
                                    <div className="py-1 text-gray-600">จ.</div>
                                    <div className="py-1 text-gray-600">อ.</div>
                                    <div className="py-1 text-gray-600">พ.</div>
                                    <div className="py-1 text-gray-600">พฤ.</div>
                                    <div className="py-1 text-gray-600">ศ.</div>
                                    <div className="py-1 text-blue-600">ส.</div>
                                </div>

                                {/* Calendar Days Grid */}
                                <div className="grid grid-cols-7 gap-2">
                                    {renderCalendarCells()}
                                </div>
                            </div>
                        )}
                    </Card>
                )}



                {/* Booking List Table */}
                {isLoading ? (
                    <LoadingPage />
                ) : (
                    <Card>
                        <CardContent className="p-0">
                            <div className="overflow-x-auto">
                                <table className="w-full text-left border-collapse">
                                    <thead>
                                        <tr className="bg-gray-50 border-b border-gray-100 text-xs font-semibold text-gray-500 uppercase">
                                            <th className="px-6 py-4">เลขจอง</th>
                                            <th className="px-6 py-4">เวลา</th>
                                            <th className="px-6 py-4">สาขา</th>
                                            <th className="px-6 py-4">ทะเบียนรถ</th>
                                            <th className="px-6 py-4">ลูกค้า</th>
                                            <th className="px-6 py-4 text-right">ไมล์ล่าสุด / ระยะ</th>
                                            <th className="px-6 py-4">สถานะ</th>
                                            <th className="px-6 py-4 text-center">จัดการ</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-100 text-sm text-gray-700">
                                        {bookings.length === 0 ? (
                                            <tr>
                                                <td colSpan={8} className="px-6 py-8 text-center text-gray-400">
                                                    {searchQuery ? 'ไม่พบข้อมูลการจองคิวที่ตรงกับการค้นหา' : 'ไม่มีข้อมูลการจองคิวสำหรับวันนี้'}
                                                </td>
                                            </tr>
                                        ) : (
                                            bookings.map((booking) => (
                                                <tr key={booking.BookingID} className="hover:bg-gray-50/50">
                                                    <td className="px-6 py-4 font-semibold text-blue-600">
                                                        <button
                                                            type="button"
                                                            onClick={() => handleViewDetail(booking.BookingID)}
                                                            className="hover:underline font-bold text-left transition-colors hover:text-blue-800"
                                                        >
                                                            {booking.BookingNo}
                                                        </button>
                                                        {booking.BookingType === 'RETAIL' ? (
                                                            <span className="ml-1.5 text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700">RETAIL</span>
                                                        ) : booking.BookingType === 'LINEMAN' ? (
                                                            <span className="ml-1.5 text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-green-100 text-green-700">LINEMAN</span>
                                                        ) : (
                                                            <span className="ml-1.5 text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-700">EV7</span>
                                                        )}
                                                    </td>
                                                    <td className="px-6 py-4">
                                                        <div className="font-medium text-gray-900">
                                                            {formatDate(booking.BookingDate)}
                                                        </div>
                                                        <div className="text-xs text-gray-500">
                                                            {booking.StartTime} - {booking.EndTime} น.
                                                        </div>
                                                    </td>
                                                    <td className="px-6 py-4">{booking.Branch.BranchName}</td>
                                                    <td className="px-6 py-4">
                                                        <div className="font-medium text-gray-900">{booking.CarRegister}</div>
                                                        <div className="text-xs text-gray-500">{booking.CarModel}</div>
                                                    </td>
                                                    <td className="px-6 py-4">
                                                        <div>{booking.CustomerName}</div>
                                                        {booking.CustomerPhone && <div className="text-xs text-gray-500">📞 {booking.CustomerPhone}</div>}
                                                    </td>
                                                    <td className="px-6 py-4 text-right">
                                                        <div className="font-semibold text-gray-900">{booking.LastMileage.toLocaleString()} กม.</div>
                                                        {booking.ProjectType === 'ซ่อมทั่วไป' || booking.Mileage === 0 ? (
                                                            <div className="text-xs text-amber-600 font-medium">🔧 ซ่อมทั่วไป</div>
                                                        ) : (
                                                            <div className="text-xs text-blue-600 font-medium">ตรวจ {booking.Mileage.toLocaleString()} กม.</div>
                                                        )}
                                                    </td>
                                                    <td className="px-6 py-4">
                                                        <Badge variant={getStatusVariant(booking.Status) as 'default' | 'success' | 'warning' | 'danger' | 'info'}>
                                                            {getStatusText(booking.Status)}
                                                        </Badge>
                                                        <br />
                                                        {getCSStatusBadge(booking.CSStatus)}
                                                        {booking.Status === 2 && (() => {
                                                            const reason = getCancelReason(booking);
                                                            return reason ? (
                                                                <div className="text-xs text-red-600 font-semibold mt-1 max-w-[180px] break-words" title={reason}>
                                                                    เหตุผล: {reason}
                                                                </div>
                                                            ) : null;
                                                        })()}
                                                    </td>
                                                    <td className="px-6 py-4 text-center">
                                                        <div className="flex items-center justify-center gap-2">
                                                            {/* Approve button (Status 0 -> 1) - Only for Admin / Service Center */}
                                                            {booking.Status === 0 && !isCS && (
                                                                <Button
                                                                    size="sm"
                                                                    onClick={() => handleStatusUpdate(booking.BookingID, 1)}
                                                                    title="อนุมัติคิว"
                                                                    className="bg-green-600 hover:bg-green-700 text-white p-1"
                                                                >
                                                                    <Check className="w-4 h-4" />
                                                                </Button>
                                                            )}

                                                            {/* Reschedule button (Status 0 or 1) - For CS and Admin */}
                                                            {(booking.Status === 0 || booking.Status === 1) && (isCS || isAdmin) && (
                                                                <Button
                                                                    size="sm"
                                                                    onClick={() => handleOpenReschedule(booking)}
                                                                    title="เลื่อนคิว"
                                                                    variant="outline"
                                                                    className="border-blue-200 text-blue-600 hover:bg-blue-50 p-1"
                                                                >
                                                                    <Calendar className="w-4 h-4" />
                                                                </Button>
                                                            )}

                                                            {/* Extend Duration button (Status 0 or 1) - Only for Branch & Admin */}
                                                            {(booking.Status === 0 || booking.Status === 1) && !isCS && (
                                                                <Button
                                                                    size="sm"
                                                                    onClick={() => handleOpenDurationModal(booking)}
                                                                    title="ขยาย/ปรับเวลาซ่อม"
                                                                    variant="outline"
                                                                    className="border-purple-200 text-purple-600 hover:bg-purple-50 p-1"
                                                                >
                                                                    <Timer className="w-4 h-4" />
                                                                </Button>
                                                            )}

                                                            {/* CS Action Button */}
                                                            {isCS && booking.Status !== 2 && booking.Status !== 4 && (
                                                                <Button
                                                                    size="sm"
                                                                    onClick={() => handleCSUpdateClick(booking)}
                                                                    title="อัปเดตสถานะการโทร (CS)"
                                                                    className="bg-orange-100 text-orange-700 hover:bg-orange-200 p-1.5"
                                                                >
                                                                    <PhoneCall className="w-4 h-4" />
                                                                </Button>
                                                            )}

                                                            {/* Edit details button */}
                                                            {(booking.Status === 0 || booking.Status === 1) && (
                                                                <Button
                                                                    size="sm"
                                                                    onClick={() => router.push(`/service-center/bookings/${booking.BookingID}/edit`)}
                                                                    title="แก้ไขรายละเอียดคิว"
                                                                    variant="outline"
                                                                    className="border-gray-200 text-gray-600 hover:bg-gray-50 p-1"
                                                                >
                                                                    <Pencil className="w-4 h-4" />
                                                                </Button>
                                                            )}

                                                            {/* Cancel button (Status 0 or 1) - For CS, Admin, and Service Center */}
                                                            {(booking.Status === 0 || booking.Status === 1) && (
                                                                <Button
                                                                    size="sm"
                                                                    onClick={() => handleStatusUpdate(booking.BookingID, 2)}
                                                                    title="ยกเลิกคิว"
                                                                    variant="outline"
                                                                    className="border-red-200 text-red-600 hover:bg-red-50 p-1"
                                                                >
                                                                    <X className="w-4 h-4" />
                                                                </Button>
                                                            )}

                                                            {/* Open Claim button (EV7 only, Status 1) - Only for Admin / Service Center */}
                                                            {booking.Status === 1 && !isCS && booking.BookingType !== 'RETAIL' && (
                                                                <Button
                                                                    size="sm"
                                                                    onClick={() => router.push(`/service-center/claims/new?bookingId=${booking.BookingID}`)}
                                                                    className="flex items-center gap-1 bg-blue-600 hover:bg-blue-700 text-white px-2 py-1 text-xs"
                                                                >
                                                                    <ClipboardCopy className="w-3.5 h-3.5" />
                                                                    เปิดใบเคลม
                                                                </Button>
                                                            )}

                                                            {/* Close Job button (RETAIL only, Status 1) */}
                                                            {booking.Status === 1 && booking.BookingType === 'RETAIL' && (
                                                                <Button
                                                                    size="sm"
                                                                    onClick={() => handleStatusUpdate(booking.BookingID, 4)}
                                                                    className="flex items-center gap-1 bg-emerald-600 hover:bg-emerald-700 text-white px-2 py-1 text-xs"
                                                                >
                                                                    ✅ ปิดงาน
                                                                </Button>
                                                            )}

                                                            {/* View Claim button (Status 3) - All roles */}
                                                            {booking.Status === 3 && booking.ClaimID && (
                                                                <Button
                                                                    size="sm"
                                                                    variant="outline"
                                                                    onClick={() => router.push(`/service-center/claims/${booking.ClaimID}`)}
                                                                    className="text-xs px-2 py-1"
                                                                >
                                                                    ดูใบเคลม
                                                                </Button>
                                                            )}
                                                        </div>
                                                    </td>
                                                </tr>
                                            ))
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </CardContent>
                    </Card>
                )}
            </div>

            <RescheduleModal
                isOpen={isRescheduleModalOpen}
                onClose={() => setIsRescheduleModalOpen(false)}
                booking={selectedBookingForReschedule}
                onSuccess={() => {
                    fetchBookings(pagination.page);
                    fetchDailySlots();
                    fetchCalendarData();
                    fetchOverdueCount();
                }}
                onError={(message) => {
                    setActionModal({
                        isOpen: true,
                        title: 'เลื่อนคิวไม่สำเร็จ',
                        message: message,
                        type: 'error',
                        reasonText: '',
                    });
                }}
            />

            {/* Booking Detail Modal */}
            <BookingDetailModal
                isOpen={isDetailModalOpen}
                onClose={() => setIsDetailModalOpen(false)}
                bookingId={detailBookingId}
            />

            {/* Slot Override Modal */}
            <SlotOverrideModal
                isOpen={isOverrideModalOpen}
                onClose={() => setIsOverrideModalOpen(false)}
                slot={overrideSlot}
                filterBranch={filterBranch}
                filterDate={filterDate}
                onSaved={() => {
                    fetchDailySlots();
                    fetchCalendarData();
                }}
                onError={(title, message) => setActionModal({
                    isOpen: true, title, message, type: 'error', reasonText: '',
                })}
            />

            {/* Duration Extension Modal */}
            <DurationExtensionModal
                isOpen={isDurationModalOpen}
                onClose={() => setIsDurationModalOpen(false)}
                booking={selectedBookingForDuration}
                allBookings={bookings}
                onSaved={() => {
                    fetchBookings();
                    fetchDailySlots();
                    fetchCalendarData();
                    fetchOverdueCount();
                }}
            />

            {/* CS Call Center Update Modal */}
            <CSStatusModal
                isOpen={isCSModalOpen}
                onClose={() => setIsCSModalOpen(false)}
                booking={selectedCSBooking}
                onSave={handleSaveCSStatus}
            />

            {/* Action Confirmation & Alert Modal */}
            <ActionConfirmModal
                state={actionModal}
                onStateChange={setActionModal}
            />
        </>
    );
}

export default function BookingsPage() {
    return (
        <Suspense fallback={<LoadingPage />}>
            <BookingsPageContent />
        </Suspense>
    );
}
