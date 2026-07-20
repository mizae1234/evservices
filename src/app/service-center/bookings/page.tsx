// Booking List & Creation Page
// Handles displaying bookings and modal for creating bookings with slot capacity checks

'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
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
import { Branch } from '@/types';
import { Plus, Settings, Check, X, ClipboardCopy, Search, Calendar, Clock, Pencil } from 'lucide-react';

interface Booking {
    BookingID: number;
    BookingNo: string;
    BookingDate: string;
    StartTime: string;
    EndTime: string;
    CustomerName: string;
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
    BayID?: number | null;
    Logs?: any[];
}

interface SlotAvailability {
    StartTime: string;
    EndTime: string;
    MaxQueue: number;
    OriginalMaxQueue?: number;
    BookedCount: number;
    IsAvailable: boolean;
    IsOverridden?: boolean;
    IsSlotClosed?: boolean;
    OverrideReason?: string | null;
}

export default function BookingsPage() {
    const router = useRouter();
    const { data: session } = useSession();
    const [bookings, setBookings] = useState<Booking[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [branches, setBranches] = useState<Branch[]>([]);

    // Filters
    const [filterDate, setFilterDate] = useState<string>(new Date().toISOString().split('T')[0]);
    const [filterBranch, setFilterBranch] = useState<string>('');
    const [filterStatus] = useState<string>('');
    const [searchQuery, setSearchQuery] = useState<string>('');

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

    const canManageOverride = session?.user?.role === 'ADMIN' || session?.user?.role === 'SERVICE_CENTER';

    // Slot Override Modal state
    const [isOverrideModalOpen, setIsOverrideModalOpen] = useState(false);
    const [overrideSlot, setOverrideSlot] = useState<SlotAvailability | null>(null);
    const [overrideIsOpen, setOverrideIsOpen] = useState(true);
    const [overrideMaxQueue, setOverrideMaxQueue] = useState('');
    const [overrideReason, setOverrideReason] = useState('');
    const [isSavingOverride, setIsSavingOverride] = useState(false);
    const [overrideSlotBookedCount, setOverrideSlotBookedCount] = useState(0);

    // Overdue and Reschedule states
    const [showOverdueOnly, setShowOverdueOnly] = useState(false);
    const [overdueCount, setOverdueCount] = useState(0);

    const [selectedBookingForReschedule, setSelectedBookingForReschedule] = useState<Booking | null>(null);
    const [isRescheduleModalOpen, setIsRescheduleModalOpen] = useState(false);
    const [rescheduleDate, setRescheduleDate] = useState('');
    const [rescheduleSlot, setRescheduleSlot] = useState<{ StartTime: string; EndTime: string } | null>(null);
    const [rescheduleReason, setRescheduleReason] = useState('');
    const [rescheduleSlots, setRescheduleSlots] = useState<SlotAvailability[]>([]);
    const [isLoadingRescheduleSlots, setIsLoadingRescheduleSlots] = useState(false);
    const [isRescheduleBranchClosed, setIsRescheduleBranchClosed] = useState(false);
    const [rescheduleBranchClosedReason, setRescheduleBranchClosedReason] = useState('');
    const [isSavingReschedule, setIsSavingReschedule] = useState(false);
    
    // Booking Detail Modal state
    const [selectedBookingForDetail, setSelectedBookingForDetail] = useState<any | null>(null);
    const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
    const [isLoadingDetail, setIsLoadingDetail] = useState(false);
    const [newNoteText, setNewNoteText] = useState('');
    const [isSavingNote, setIsSavingNote] = useState(false);

    const handleViewDetail = async (bookingId: number) => {
        setIsLoadingDetail(true);
        setIsDetailModalOpen(true);
        setSelectedBookingForDetail(null);
        try {
            const res = await fetch(`/api/bookings/${bookingId}`);
            const data = await res.json();
            if (data.success) {
                setSelectedBookingForDetail(data.data);
            }
        } catch (err) {
            console.error('Error loading booking detail:', err);
        } finally {
            setIsLoadingDetail(false);
        }
    };

    const handleSaveNote = async () => {
        if (!selectedBookingForDetail || !newNoteText.trim()) return;
        setIsSavingNote(true);
        try {
            const res = await fetch(`/api/bookings/${selectedBookingForDetail.BookingID}/logs`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ content: newNoteText }),
            });
            const data = await res.json();
            if (data.success) {
                setSelectedBookingForDetail((prev: any) => {
                    if (!prev) return null;
                    return {
                        ...prev,
                        Logs: [data.data, ...(prev.Logs || [])]
                    };
                });
                setNewNoteText('');
            } else {
                alert(data.error || 'Failed to save note');
            }
        } catch (err) {
            console.error('Error saving note:', err);
            alert('Failed to connect to server');
        } finally {
            setIsSavingNote(false);
        }
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
        setOverrideIsOpen(slot.IsSlotClosed ? false : true);
        setOverrideMaxQueue(
            slot.IsOverridden && !slot.IsSlotClosed
                ? (slot.MaxQueue).toString()
                : ''
        );
        setOverrideReason(slot.OverrideReason || '');
        setOverrideSlotBookedCount(slot.BookedCount);
        setIsOverrideModalOpen(true);
    };

    const handleSaveOverride = async () => {
        if (!overrideSlot || !filterBranch || !filterDate) return;

        setIsSavingOverride(true);
        try {
            const res = await fetch('/api/bookings/slot-overrides', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    branchId: filterBranch,
                    date: filterDate,
                    startTime: overrideSlot.StartTime,
                    endTime: overrideSlot.EndTime,
                    isOpen: overrideIsOpen,
                    maxQueueOverride: overrideIsOpen && overrideMaxQueue
                        ? parseInt(overrideMaxQueue)
                        : null,
                    reason: overrideReason || null,
                }),
            });
            const data = await res.json();
            if (data.success) {
                setIsOverrideModalOpen(false);
                fetchDailySlots();
                fetchCalendarData();
            } else {
                alert(data.error || 'บันทึกไม่สำเร็จ');
            }
        } catch (err) {
            console.error('Error saving override:', err);
            alert('เกิดข้อผิดพลาด');
        } finally {
            setIsSavingOverride(false);
        }
    };

    const handleRemoveOverride = async (slot: SlotAvailability) => {
        if (!filterBranch || !filterDate) return;
        if (!confirm(`ต้องการรีเซ็ตสล็อต ${slot.StartTime}-${slot.EndTime} กลับค่า default ใช่หรือไม่?`)) return;

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
                        alert(delData.error || 'ลบไม่สำเร็จ');
                    }
                }
            }
        } catch (err) {
            console.error('Error removing override:', err);
            alert('เกิดข้อผิดพลาด');
        }
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

    // Fetch reschedule slots when date/booking changes
    useEffect(() => {
        const fetchRescheduleSlots = async () => {
            if (!selectedBookingForReschedule || !rescheduleDate) {
                setRescheduleSlots([]);
                return;
            }
            setIsLoadingRescheduleSlots(true);
            setIsRescheduleBranchClosed(false);
            setRescheduleBranchClosedReason('');
            try {
                const branchId = selectedBookingForReschedule.BranchID;
                const res = await fetch(`/api/bookings/slots?branchId=${branchId}&date=${rescheduleDate}`, { cache: 'no-store' });
                const data = await res.json();
                if (data.success) {
                    if (data.isClosed) {
                        setIsRescheduleBranchClosed(true);
                        setRescheduleBranchClosedReason(data.reason || 'สาขาปิดทำการ');
                        setRescheduleSlots([]);
                    } else {
                        setRescheduleSlots(data.data || []);
                    }
                } else {
                    setRescheduleSlots([]);
                }
            } catch (err) {
                console.error('Error fetching reschedule slots:', err);
                setRescheduleSlots([]);
            } finally {
                setIsLoadingRescheduleSlots(false);
            }
        };

        if (isRescheduleModalOpen) {
            fetchRescheduleSlots();
        }
    }, [isRescheduleModalOpen, rescheduleDate, selectedBookingForReschedule]);

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

    const fetchBookings = async () => {
        setIsLoading(true);
        try {
            const params = new URLSearchParams();
            params.set('page', pagination.page.toString());
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
    const handleStatusUpdate = async (bookingId: number, status: number) => {
        let reason = '';
        if (status === 2) {
            const userInput = prompt('กรุณาระบุเหตุผลในการยกเลิกคิว (เช่น ลูกค้าแจ้งยกเลิก, ข้อมูลไม่ถูกต้อง):');
            if (userInput === null) return; // User cancelled the prompt
            reason = userInput.trim() || 'ไม่ได้ระบุเหตุผล';
        } else {
            const confirmMsg = status === 1 ? 'ยืนยันอนุมัติคิวนี้ใช่หรือไม่?' 
                : 'ยืนยันปิดงานคิว Retail นี้ใช่หรือไม่?';
            if (!confirm(confirmMsg)) return;
        }

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
                alert(data.error || 'ดำเนินการล้มเหลว');
            }
        } catch (err) {
            console.error('Error updating status:', err);
            alert('เกิดข้อผิดพลาดในการทำรายการ');
        }
    };

    const handleOpenReschedule = (booking: Booking) => {
        if (booking.BayID) {
            const bookingDateStr = new Date(booking.BookingDate).toISOString().split('T')[0];
            router.push(`/service-center/bookings/bay-calendar?branchId=${booking.BranchID}&date=${bookingDateStr}&bookingId=${booking.BookingID}`);
            return;
        }
        setSelectedBookingForReschedule(booking);
        const originalDateStr = toDateInputString(booking.BookingDate);
        const todayStr = new Date().toISOString().split('T')[0];
        setRescheduleDate(originalDateStr < todayStr ? todayStr : originalDateStr);
        setRescheduleSlot({ StartTime: booking.StartTime, EndTime: booking.EndTime });
        setRescheduleReason('');
        setIsRescheduleModalOpen(true);
    };

    const handleSaveReschedule = async () => {
        if (!selectedBookingForReschedule || !rescheduleDate || !rescheduleSlot) return;
        if (!rescheduleReason.trim()) {
            alert('กรุณากรอกเหตุผลในการเลื่อนคิว');
            return;
        }

        setIsSavingReschedule(true);
        try {
            const res = await fetch(`/api/bookings/${selectedBookingForReschedule.BookingID}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    BookingDate: rescheduleDate,
                    StartTime: rescheduleSlot.StartTime,
                    EndTime: rescheduleSlot.EndTime,
                    RescheduleReason: rescheduleReason.trim(),
                }),
            });
            const data = await res.json();
            if (data.success) {
                setIsRescheduleModalOpen(false);
                fetchBookings();
                fetchDailySlots();
                fetchCalendarData();
                fetchOverdueCount();
                alert('เลื่อนคิวสำเร็จ');
            } else {
                alert(data.error || 'เลื่อนคิวไม่สำเร็จ');
            }
        } catch (err) {
            console.error('Error rescheduling booking:', err);
            alert('เกิดข้อผิดพลาดในการเลื่อนคิว');
        } finally {
            setIsSavingReschedule(false);
        }
    };

    const getStatusText = (status: number) => {
        switch (status) {
            case 0: return 'รออนุมัติ';
            case 1: return 'อนุมัติแล้ว';
            case 2: return 'ยกเลิก';
            case 3: return 'เปิดใบเคลมแล้ว';
            case 4: return 'ปิดงานแล้ว';
            default: return 'ไม่ระบุ';
        }
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
                                onClick={fetchBookings}
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
                                                    <td className="px-6 py-4">{booking.CustomerName}</td>
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

            {/* Reschedule Modal */}
            <Modal
                isOpen={isRescheduleModalOpen}
                onClose={() => setIsRescheduleModalOpen(false)}
                title="เลื่อนนัดหมาย (Reschedule)"
                size="md"
            >
                {selectedBookingForReschedule && (
                    <div className="space-y-4">
                        <div>
                            <p className="text-xs text-gray-500 font-semibold uppercase">รายละเอียดคิวเดิม</p>
                            <div className="mt-1 p-3 bg-gray-50 rounded-lg text-sm text-gray-700">
                                <div><strong>เลขที่จอง:</strong> {selectedBookingForReschedule.BookingNo}</div>
                                <div><strong>ลูกค้า:</strong> {selectedBookingForReschedule.CustomerName} ({selectedBookingForReschedule.CarRegister})</div>
                                <div><strong>คิวเดิม:</strong> {formatDate(selectedBookingForReschedule.BookingDate)} ({selectedBookingForReschedule.StartTime} - {selectedBookingForReschedule.EndTime} น.)</div>
                                <div><strong>สาขา:</strong> {selectedBookingForReschedule.Branch.BranchName}</div>
                            </div>
                        </div>

                        {/* Date selection */}
                        <div>
                            <label className="block text-xs font-bold text-gray-700 mb-1">เลือกวันที่จองใหม่ *</label>
                            <input
                                type="date"
                                min={new Date().toISOString().split('T')[0]}
                                value={rescheduleDate}
                                onChange={(e) => {
                                    setRescheduleDate(e.target.value);
                                    setRescheduleSlot(null);
                                }}
                                className="w-full border border-gray-300 rounded-lg p-2 text-sm text-gray-900 focus:ring-blue-500 focus:border-blue-500"
                            />
                        </div>

                        {/* Slots selection */}
                        <div>
                            <label className="block text-xs font-bold text-gray-700 mb-1">เลือกสล็อตเวลาใหม่ *</label>
                            {isLoadingRescheduleSlots ? (
                                <div className="text-sm text-gray-400 py-3 flex items-center justify-center">
                                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600 mr-2"></div>
                                    กำลังโหลดเวลาว่าง...
                                </div>
                            ) : isRescheduleBranchClosed ? (
                                <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-xs font-medium rounded-lg">
                                    🔴 สาขาปิดบริการ: {rescheduleBranchClosedReason}
                                </div>
                            ) : rescheduleSlots.length === 0 ? (
                                <div className="text-sm text-gray-400 py-3 text-center">
                                    ไม่มีการตั้งค่าเวลาคิวในวันที่เลือก
                                </div>
                            ) : (
                                <div className="grid grid-cols-2 gap-2">
                                    {rescheduleSlots.map((slot) => {
                                        const isSameSlot = toDateInputString(selectedBookingForReschedule.BookingDate) === rescheduleDate && 
                                                           selectedBookingForReschedule.StartTime === slot.StartTime && 
                                                           selectedBookingForReschedule.EndTime === slot.EndTime;
                                        
                                        const isFull = !slot.IsAvailable && !isSameSlot;
                                        const isSelected = rescheduleSlot?.StartTime === slot.StartTime && rescheduleSlot?.EndTime === slot.EndTime;

                                        return (
                                            <button
                                                key={slot.StartTime}
                                                type="button"
                                                disabled={isFull}
                                                onClick={() => setRescheduleSlot({ StartTime: slot.StartTime, EndTime: slot.EndTime })}
                                                className={`p-2.5 rounded-lg border text-xs text-left transition-all ${
                                                    isSelected
                                                        ? 'bg-blue-600 text-white border-blue-600 font-bold'
                                                        : isFull
                                                            ? 'bg-gray-50 border-gray-100 text-gray-300 cursor-not-allowed'
                                                            : 'bg-white border-gray-200 text-gray-700 hover:border-blue-300 hover:bg-blue-50/10'
                                                }`}
                                            >
                                                <div className="font-semibold">{slot.StartTime} - {slot.EndTime} น.</div>
                                                <div className={`mt-0.5 text-[10px] ${isSelected ? 'text-blue-100' : isFull ? 'text-gray-300' : 'text-gray-500'}`}>
                                                    {isSameSlot ? 'คิวเดิมของคุณ' : `จองแล้ว ${slot.BookedCount}/${slot.MaxQueue}`}
                                                </div>
                                            </button>
                                        );
                                    })}
                                </div>
                            )}
                        </div>

                        {/* Reschedule Reason */}
                        <div>
                            <label className="block text-xs font-bold text-gray-700 mb-1">ระบุเหตุผลการเลื่อนคิว *</label>
                            <textarea
                                placeholder="เช่น ลูกค้าขอเลื่อนเนื่องจากติดธุระด่วน / ปรับเวลานัดใหม่..."
                                value={rescheduleReason}
                                onChange={(e) => setRescheduleReason(e.target.value)}
                                className="w-full border border-gray-300 rounded-lg p-2 text-sm text-gray-900 placeholder-gray-500 h-20 focus:ring-blue-500 focus:border-blue-500"
                                required
                            />
                        </div>

                        {/* Action buttons */}
                        <div className="flex justify-end gap-3 pt-3 border-t border-gray-100">
                            <Button
                                variant="outline"
                                onClick={() => setIsRescheduleModalOpen(false)}
                                disabled={isSavingReschedule}
                            >
                                ยกเลิก
                            </Button>
                            <Button
                                onClick={handleSaveReschedule}
                                disabled={isSavingReschedule || !rescheduleDate || !rescheduleSlot || !rescheduleReason.trim()}
                                className="bg-blue-600 hover:bg-blue-700 text-white"
                            >
                                {isSavingReschedule ? 'กำลังบันทึก...' : 'บันทึกการเลื่อนคิว'}
                            </Button>
                        </div>
                    </div>
                )}
            </Modal>

            {/* Booking Detail Modal */}
            <Modal
                isOpen={isDetailModalOpen}
                onClose={() => setIsDetailModalOpen(false)}
                title="รายละเอียดการจองคิว"
            >
                {isLoadingDetail ? (
                    <div className="py-12 text-center text-gray-500">
                        <div className="animate-spin inline-block w-6 h-6 border-2 border-current border-t-transparent text-blue-600 rounded-full mb-2" />
                        <div className="text-xs">กำลังโหลดรายละเอียด...</div>
                    </div>
                ) : selectedBookingForDetail && (
                    <div className="space-y-4">
                        {/* Status Header */}
                        <div className="flex items-center justify-between pb-3 border-b border-gray-100">
                            <div>
                                <span className="text-xs font-bold text-gray-400 block uppercase tracking-wider">เลขที่การจอง</span>
                                <span className="text-lg font-bold text-blue-600">{selectedBookingForDetail.BookingNo}</span>
                            </div>
                            <div>
                                <span className="text-xs font-bold text-gray-400 block uppercase tracking-wider text-right">สถานะคิว</span>
                                <span className={`inline-block px-2.5 py-1 rounded-full text-xs font-bold ${
                                    selectedBookingForDetail.Status === 1 ? 'bg-green-100 text-green-800' :
                                    selectedBookingForDetail.Status === 2 ? 'bg-red-100 text-red-800' :
                                    selectedBookingForDetail.Status === 3 ? 'bg-blue-100 text-blue-800' :
                                    selectedBookingForDetail.Status === 4 ? 'bg-emerald-100 text-emerald-800' :
                                    'bg-yellow-100 text-yellow-800'
                                }`}>
                                    {selectedBookingForDetail.Status === 1 ? 'อนุมัติแล้ว' :
                                     selectedBookingForDetail.Status === 2 ? 'ยกเลิก' :
                                     selectedBookingForDetail.Status === 3 ? 'เปิดใบเคลมแล้ว' :
                                     selectedBookingForDetail.Status === 4 ? 'ปิดงานแล้ว' :
                                     'รอดำเนินการ'}
                                </span>
                            </div>
                        </div>

                        {/* Customer & Vehicle Info */}
                        <div className="grid grid-cols-2 gap-4 bg-gray-50 p-4 rounded-xl">
                            <div>
                                <span className="text-[10px] text-gray-400 block uppercase font-semibold">ชื่อลูกค้า</span>
                                <span className="font-semibold text-gray-900">{selectedBookingForDetail.CustomerName}</span>
                            </div>
                            <div>
                                <span className="text-[10px] text-gray-400 block uppercase font-semibold">สาขาที่จอง</span>
                                <span className="font-semibold text-gray-900">{selectedBookingForDetail.Branch?.BranchName || 'ไม่ระบุ'}</span>
                            </div>
                            <div>
                                <span className="text-[10px] text-gray-400 block uppercase font-semibold">ทะเบียนรถยนต์</span>
                                <span className="font-semibold text-gray-900">{selectedBookingForDetail.CarRegister}</span>
                            </div>
                            <div>
                                <span className="text-[10px] text-gray-400 block uppercase font-semibold">รุ่นรถยนต์</span>
                                <span className="font-semibold text-gray-900">{selectedBookingForDetail.CarModel || '-'}</span>
                            </div>
                            <div className="col-span-2">
                                <span className="text-[10px] text-gray-400 block uppercase font-semibold">เลขตัวถัง (VIN)</span>
                                <span className="font-mono text-xs font-semibold text-gray-900">{selectedBookingForDetail.VinNo || '-'}</span>
                            </div>
                        </div>

                        {/* Booking Schedule & Mileage */}
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <span className="text-[10px] text-gray-400 block uppercase font-semibold">วันที่นัดหมาย</span>
                                <span className="font-semibold text-gray-900">
                                    {formatDate(selectedBookingForDetail.BookingDate)}
                                </span>
                            </div>
                            <div>
                                <span className="text-[10px] text-gray-400 block uppercase font-semibold">เวลานัดหมาย</span>
                                <span className="font-semibold text-gray-900">
                                    {selectedBookingForDetail.StartTime} - {selectedBookingForDetail.EndTime} น.
                                </span>
                            </div>
                            <div>
                                <span className="text-[10px] text-gray-400 block uppercase font-semibold">ประเภทงาน</span>
                                <span className={`font-semibold ${
                                    selectedBookingForDetail.ProjectType === 'ซ่อมทั่วไป' || selectedBookingForDetail.Mileage === 0
                                        ? 'text-amber-600'
                                        : 'text-blue-600'
                                }`}>
                                    {selectedBookingForDetail.ProjectType === 'ซ่อมทั่วไป' || selectedBookingForDetail.Mileage === 0
                                        ? '🔧 ซ่อมทั่วไป'
                                        : `📅 ตรวจเช็คระยะ (${selectedBookingForDetail.Mileage.toLocaleString()} กม.)`}
                                </span>
                            </div>
                            <div>
                                <span className="text-[10px] text-gray-400 block uppercase font-semibold">เลขไมล์ปัจจุบัน</span>
                                <span className="font-semibold text-gray-900">
                                    {selectedBookingForDetail.LastMileage.toLocaleString()} กม.
                                </span>
                            </div>
                        </div>

                        {/* Claim/Issue Details */}
                        <div>
                            <span className="text-[10px] text-gray-400 block uppercase font-semibold mb-1">รายละเอียดอาการชำรุด</span>
                            <div className="bg-white border border-gray-200 p-3 rounded-lg text-sm text-gray-700 whitespace-pre-wrap max-h-24 overflow-y-auto leading-relaxed">
                                {selectedBookingForDetail.ClaimDetail || 'ไม่มีรายละเอียดเพิ่มเติม'}
                            </div>
                        </div>

                        {/* Timeline logs */}
                        <div className="space-y-1 pt-2 border-t border-gray-100">
                            <span className="text-[10px] text-gray-400 block uppercase font-semibold">บันทึกประวัติการเลื่อนคิวและโน้ตช่วยจำ</span>
                            <div className="bg-white border border-gray-200 rounded-xl p-3 max-h-40 overflow-y-auto space-y-2 leading-relaxed">
                                {(!selectedBookingForDetail.Logs || selectedBookingForDetail.Logs.length === 0) ? (
                                    <div className="text-xs text-gray-400 text-center py-4">ไม่มีประวัติการบันทึกคิวนี้</div>
                                ) : (
                                    selectedBookingForDetail.Logs.map((log: any) => {
                                        let icon = '⚙️';
                                        let bgColor = 'bg-gray-50 border-gray-200 text-gray-800';
                                        let title = 'บันทึกระบบ';
                                        if (log.LogType === 'RESCHEDULE') {
                                            icon = '📅';
                                            bgColor = 'bg-blue-50/50 border-blue-200 text-blue-950';
                                            title = 'เลื่อนนัดหมาย';
                                        } else if (log.LogType === 'CANCEL') {
                                            icon = '❌';
                                            bgColor = 'bg-red-50/50 border-red-200 text-red-950';
                                            title = 'ยกเลิกคิว';
                                        } else if (log.LogType === 'NOTE') {
                                            icon = '📝';
                                            bgColor = 'bg-amber-50/50 border-amber-200 text-amber-950';
                                            title = 'โน้ตเจ้าหน้าที่ (CS Note)';
                                        }
                                        
                                        return (
                                            <div key={log.LogID} className={`p-2 rounded-lg border text-xs ${bgColor}`}>
                                                <div className="flex items-center justify-between font-bold mb-1">
                                                    <span className="flex items-center gap-1">
                                                        <span>{icon}</span>
                                                        <span>{title}</span>
                                                    </span>
                                                    <span className="text-[10px] font-normal text-gray-400">
                                                        โดย: {log.CreateBy} | {new Date(log.CreateDate).toLocaleString('th-TH', { hour: '2-digit', minute: '2-digit', day: 'numeric', month: 'short', year: '2-digit' })} น.
                                                    </span>
                                                </div>
                                                <div className="whitespace-pre-wrap font-medium">{log.Content}</div>
                                            </div>
                                        );
                                    })
                                )}
                            </div>
                        </div>

                        {/* Write new note */}
                        {(selectedBookingForDetail.Status === 0 || selectedBookingForDetail.Status === 1) && (
                            <div className="pt-2 border-t border-gray-100">
                                <label className="block text-[10px] text-gray-400 uppercase font-semibold mb-1">เขียนบันทึกช่วยจำ / โน้ตใหม่</label>
                                <div className="flex gap-2">
                                    <textarea
                                        placeholder="เช่น ลูกค้าแจ้งความต้องการพิเศษ / โน้ตเตือนผู้เกี่ยวข้อง..."
                                        value={newNoteText}
                                        onChange={(e) => setNewNoteText(e.target.value)}
                                        className="flex-1 border border-gray-300 rounded-lg p-2 text-xs text-gray-900 placeholder-gray-400 h-10 focus:ring-blue-500 focus:border-blue-500 resize-none"
                                    />
                                    <Button
                                        type="button"
                                        size="sm"
                                        disabled={isSavingNote || !newNoteText.trim()}
                                        onClick={handleSaveNote}
                                        className="bg-blue-600 hover:bg-blue-700 text-white h-10 self-end text-xs px-3"
                                    >
                                        {isSavingNote ? 'กำลังบันทึก...' : 'บันทึกโน้ต'}
                                    </Button>
                                </div>
                            </div>
                        )}

                        {/* Close button */}
                        <div className="flex justify-end gap-3 pt-3 border-t border-gray-100">
                            {(selectedBookingForDetail.Status === 0 || selectedBookingForDetail.Status === 1) && (
                                <Button
                                    onClick={() => {
                                        setIsDetailModalOpen(false);
                                        router.push(`/service-center/bookings/${selectedBookingForDetail.BookingID}/edit`);
                                    }}
                                    className="bg-blue-600 hover:bg-blue-700 text-white flex items-center gap-1.5"
                                >
                                    <Pencil className="w-4 h-4" />
                                    แก้ไขข้อมูลคิว
                                </Button>
                            )}
                            <Button
                                onClick={() => setIsDetailModalOpen(false)}
                                variant="outline"
                            >
                                ปิดหน้าต่าง
                            </Button>
                        </div>
                    </div>
                )}
            </Modal>

            {/* Slot Override Modal */}
            <Modal
                isOpen={isOverrideModalOpen}
                onClose={() => setIsOverrideModalOpen(false)}
                title={`ปรับสล็อต ${overrideSlot?.StartTime || ''} - ${overrideSlot?.EndTime || ''} น.`}
            >
                <div className="space-y-4 p-1">
                    <div className="bg-blue-50 border border-blue-100 rounded-lg p-3 text-xs text-blue-800">
                        <strong>ปรับโควตาสล็อตชั่วคราว</strong> สำหรับวันที่ <strong>{formatDate(filterDate)}</strong> เท่านั้น
                        <br />ค่า default ของสล็อตนี้: <strong>{overrideSlot?.OriginalMaxQueue ?? overrideSlot?.MaxQueue ?? '-'} คิว</strong>
                    </div>

                    {/* Toggle: Open / Close */}
                    <div>
                        <label className="block text-sm font-semibold text-gray-700 mb-2">สถานะสล็อต</label>
                        <div className="flex gap-3">
                            <button
                                type="button"
                                onClick={() => setOverrideIsOpen(true)}
                                className={`flex-1 py-2.5 rounded-lg border text-sm font-bold transition-all ${
                                    overrideIsOpen
                                        ? 'bg-green-50 border-green-300 text-green-700 ring-2 ring-green-200'
                                        : 'bg-gray-50 border-gray-200 text-gray-400 hover:bg-gray-100'
                                }`}
                            >
                                ✅ เปิดรับคิว
                            </button>
                            <button
                                type="button"
                                onClick={() => setOverrideIsOpen(false)}
                                className={`flex-1 py-2.5 rounded-lg border text-sm font-bold transition-all ${
                                    !overrideIsOpen
                                        ? 'bg-red-50 border-red-300 text-red-700 ring-2 ring-red-200'
                                        : 'bg-gray-50 border-gray-200 text-gray-400 hover:bg-gray-100'
                                }`}
                            >
                                🚫 ปิดรับคิว
                            </button>
                        </div>
                    </div>

                    {/* Warning: existing bookings when closing */}
                    {!overrideIsOpen && overrideSlotBookedCount > 0 && (
                        <div className="bg-amber-50 border border-amber-300 rounded-lg p-3 text-xs text-amber-800 flex items-start gap-2">
                            <span className="text-base mt-[-2px]">⚠️</span>
                            <div>
                                <strong>สล็อตนี้มีคิวจองอยู่แล้ว {overrideSlotBookedCount} คิว</strong>
                                <br />การปิดสล็อตจะไม่ยกเลิกคิวที่จองไว้แล้ว แต่จะ<strong>ไม่รับคิวใหม่</strong>เพิ่ม
                                <br />หากต้องการย้ายคิว สามารถ Reschedule ได้จากรายการจองด้านล่าง
                            </div>
                        </div>
                    )}

                    {/* Warning: reducing quota below booked count */}
                    {overrideIsOpen && overrideMaxQueue && parseInt(overrideMaxQueue) < overrideSlotBookedCount && overrideSlotBookedCount > 0 && (
                        <div className="bg-amber-50 border border-amber-300 rounded-lg p-3 text-xs text-amber-800 flex items-start gap-2">
                            <span className="text-base mt-[-2px]">⚠️</span>
                            <div>
                                <strong>โควตาที่ตั้ง ({overrideMaxQueue}) น้อยกว่าคิวที่จองอยู่แล้ว ({overrideSlotBookedCount} คิว)</strong>
                                <br />คิวที่จองไว้แล้วจะยังคงอยู่ แต่สล็อตจะแสดงสถานะ "เต็ม" ไม่รับคิวใหม่
                            </div>
                        </div>
                    )}

                    {/* MaxQueue Override (only when open) */}
                    {overrideIsOpen && (
                        <div>
                            <label className="block text-sm font-semibold text-gray-700 mb-1">จำนวนโควตาที่ต้องการ (เว้นว่างหาก = ค่า default)</label>
                            <Input
                                type="number"
                                value={overrideMaxQueue}
                                onChange={(e) => setOverrideMaxQueue(e.target.value)}
                                placeholder={`ค่า default: ${overrideSlot?.OriginalMaxQueue ?? overrideSlot?.MaxQueue ?? '-'} คิว`}
                                min="0"
                                max="99"
                            />
                            <p className="text-xs text-gray-400 mt-1">เว้นว่างเพื่อใช้ค่า default ({overrideSlot?.OriginalMaxQueue ?? overrideSlot?.MaxQueue ?? '-'} คิว)</p>
                        </div>
                    )}

                    {/* Reason */}
                    <div>
                        <label className="block text-sm font-semibold text-gray-700 mb-1">เหตุผลการปรับ (ไม่บังคับ)</label>
                        <Input
                            value={overrideReason}
                            onChange={(e) => setOverrideReason(e.target.value)}
                            placeholder="เช่น คนงานน้อย / เครื่องมือไม่พอ / ปรับตามงานจริง"
                        />
                    </div>

                    {/* Preview */}
                    <div className="bg-gray-50 border border-gray-100 rounded-lg p-3 text-xs text-gray-600">
                        <strong>ผลลัพธ์:</strong>{' '}
                        {!overrideIsOpen ? (
                            <span className="text-red-600 font-bold">สล็อตนี้จะถูกปิดรับคิวในวันที่เลือก</span>
                        ) : overrideMaxQueue ? (
                            <span className="text-orange-600 font-bold">สล็อตนี้จะรับคิวสูงสุด {overrideMaxQueue} คิว (แทน {overrideSlot?.OriginalMaxQueue ?? overrideSlot?.MaxQueue} คิว)</span>
                        ) : (
                            <span className="text-green-600 font-bold">สล็อตนี้จะใช้ค่า default ({overrideSlot?.OriginalMaxQueue ?? overrideSlot?.MaxQueue} คิว)</span>
                        )}
                    </div>

                    {/* Actions */}
                    <div className="flex justify-end gap-2 pt-2 border-t border-gray-100">
                        <Button variant="outline" onClick={() => setIsOverrideModalOpen(false)}>
                            ยกเลิก
                        </Button>
                        <Button onClick={handleSaveOverride} isLoading={isSavingOverride}>
                            💾 บันทึกการปรับ
                        </Button>
                    </div>
                </div>
            </Modal>
        </>
    );
}
