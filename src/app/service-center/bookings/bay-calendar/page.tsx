'use client';

import React, { useState, useEffect, useCallback, Suspense } from 'react';
import { useSession } from 'next-auth/react';
import { useSearchParams } from 'next/navigation';
import { Header } from '@/components/layouts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Select';
import { Badge } from '@/components/ui/Badge';
import { LoadingPage } from '@/components/ui/Loading';
import { ChevronLeft, ChevronRight, Calendar, Plus, Settings, Check, X as XIcon, Clock, MapPin } from 'lucide-react';
import BayBookingModal from '@/components/bookings/BayBookingModal';
import { MileageWarning } from '@/components/bookings/MileageWarning';
import { ActionConfirmModal, defaultActionModal } from '@/components/bookings/modals/ActionConfirmModal';
import type { ActionModalState } from '@/components/bookings/modals/ActionConfirmModal';
import { RescheduleConflictAlert } from '@/components/bookings/RescheduleConflictAlert';
import { checkBayConflict, findAlternativeSlotsInBay, findAlternativeAvailableBays } from '@/lib/bay-booking-utils';
import { isCSRole, getAllowedBookingType } from '@/lib/permissions';
import { getBangkokDateString } from '@/lib/utils';

// --- Types ---
interface BayBooking {
    BookingID: number;
    BookingNo: string;
    StartTime: string;
    EndTime: string;
    StartMinutes: number;
    EndMinutes: number;
    CustomerName: string;
    CarRegister: string;
    CarModel: string;
    ServiceType: { Code: string; Name: string } | null;
    Status: number;
    DurationMinutes: number | null;
    BayID?: number | null;
    BookingDate: string;
    Mileage?: number;
    LastMileage?: number;
    ClaimDetail?: string | null;
    CustomerPhone?: string | null;
    isMasked?: boolean;
}

interface AvailableSlot {
    StartTime: string;
    EndTime: string;
    DurationMinutes: number;
}

interface BayData {
    BayID: number;
    BayName: string;
    SortOrder: number;
    Bookings: BayBooking[];
    AvailableSlots: AvailableSlot[];
    TotalBookedMinutes: number;
    TotalAvailableMinutes: number;
}

interface BranchOption {
    BranchID: number;
    BranchName: string;
}

// --- Constants ---
const STATUS_CONFIG: Record<number, { label: string; color: string; bgColor: string; borderColor: string }> = {
    0: { label: 'รออนุมัติ', color: 'text-amber-700', bgColor: 'bg-amber-50', borderColor: 'border-amber-300' },
    1: { label: 'อนุมัติ', color: 'text-emerald-700', bgColor: 'bg-emerald-50', borderColor: 'border-emerald-300' },
    2: { label: 'ปฏิเสธ', color: 'text-red-700', bgColor: 'bg-red-50', borderColor: 'border-red-300' },
    3: { label: 'สร้าง Claim', color: 'text-blue-700', bgColor: 'bg-blue-50', borderColor: 'border-blue-300' },
    4: { label: 'ยกเลิก', color: 'text-gray-500', bgColor: 'bg-gray-50', borderColor: 'border-gray-300' },
};

const SLOT_WIDTH = 80; // px per 30-min slot
const BAY_LABEL_WIDTH = 120; // px for bay name column

function timeToMinutes(t: string): number {
    const [h, m] = t.split(':').map(Number);
    return h * 60 + m;
}

function minutesToTime(m: number): string {
    const h = Math.floor(m / 60);
    const min = m % 60;
    return `${h.toString().padStart(2, '0')}:${min.toString().padStart(2, '0')}`;
}

function formatThaiDate(dateStr: string): string {
    const [y, m, d] = dateStr.split('-').map(Number);
    const date = new Date(y, m - 1, d);
    const thaiMonths = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
    const thaiDays = ['อา.', 'จ.', 'อ.', 'พ.', 'พฤ.', 'ศ.', 'ส.'];
    return `${thaiDays[date.getDay()]} ${d} ${thaiMonths[m - 1]} ${y + 543}`;
}

function BayCalendarPageInner() {
    const { data: session } = useSession();
    const searchParams = useSearchParams();
    const paramDate = searchParams.get('date');
    const paramBranchId = searchParams.get('branchId');
    const isCS = isCSRole(session?.user?.role);
    const isAdmin = session?.user?.role === 'ADMIN';
    const canSelectBranch = isAdmin || isCS;

    const [isLoading, setIsLoading] = useState(true);
    const [selectedDate, setSelectedDate] = useState(() => paramDate || getBangkokDateString());
    const [selectedBranch, setSelectedBranch] = useState(paramBranchId || '');
    const [branches, setBranches] = useState<BranchOption[]>([]);
    const [bays, setBays] = useState<BayData[]>([]);
    const [operatingHours, setOperatingHours] = useState({ openTime: '08:30', closeTime: '17:30' });
    const [isClosed, setIsClosed] = useState(false);
    const [closedReason, setClosedReason] = useState('');
    const [noBaysMessage, setNoBaysMessage] = useState('');

    const currentBranchName = branches.find(b => b.BranchID.toString() === selectedBranch)?.BranchName || session?.user?.branchName || '';

    // Booking detail modal
    const [selectedBooking, setSelectedBooking] = useState<BayBooking | null>(null);
    const [selectedBayName, setSelectedBayName] = useState('');
    const [isApproving, setIsApproving] = useState(false);

    // Reschedule & Logs states
    const [bookingLogs, setBookingLogs] = useState<any[]>([]);
    const [activeTab, setActiveTab] = useState<'detail' | 'logs'>('detail');
    const [isRescheduling, setIsRescheduling] = useState(false);
    const [rescheduleDate, setRescheduleDate] = useState('');
    const [rescheduleHour, setRescheduleHour] = useState('08');
    const [rescheduleMin, setRescheduleMin] = useState('00');
    const [customEndTime, setCustomEndTime] = useState('');
    const [rescheduleReason, setRescheduleReason] = useState('');
    const [rescheduleError, setRescheduleError] = useState('');
    const [rescheduleBayId, setRescheduleBayId] = useState('');
    const [rescheduleBays, setRescheduleBays] = useState<BayData[]>([]);
    const [isRescheduleDateClosed, setIsRescheduleDateClosed] = useState(false);
    const [rescheduleDateClosedReason, setRescheduleDateClosedReason] = useState('');
    const [isTogglingClosed, setIsTogglingClosed] = useState(false);

    // Booking modal state
    const [bookingModal, setBookingModal] = useState<{ bayId: number; bayName: string; startTime: string } | null>(null);

    // Action modal state (replaces native alert/confirm/prompt)
    const [actionModal, setActionModal] = useState<ActionModalState>(defaultActionModal);

    const showSuccessModal = (title: string, message: string, onDismiss?: () => void) => {
        setActionModal({ isOpen: true, title, message, type: 'success', reasonText: '', onConfirm: onDismiss });
    };
    const showErrorModal = (title: string, message: string) => {
        setActionModal({ isOpen: true, title, message, type: 'error', reasonText: '' });
    };
    const showConfirmModal = (title: string, message: string, onConfirm: () => void) => {
        setActionModal({ isOpen: true, title, message, type: 'confirm', reasonText: '', onConfirm });
    };
    const showPromptModal = (title: string, message: string, label: string, placeholder: string, onConfirm: (reason?: string) => void) => {
        setActionModal({ isOpen: true, title, message, type: 'prompt', reasonText: '', promptLabel: label, promptPlaceholder: placeholder, onConfirm });
    };

    // Load branches
    useEffect(() => {
        async function loadBranches() {
            try {
                const res = await fetch('/api/branches');
                const data = await res.json();
                if (data.success) {
                    setBranches(data.data);
                    // Only set default branch if not already set from query params
                    if (!selectedBranch) {
                        if (session?.user?.role === 'SERVICE_CENTER' && session?.user?.branchId) {
                            setSelectedBranch(session.user.branchId.toString());
                        } else if (data.data.length > 0) {
                            setSelectedBranch(data.data[0].BranchID.toString());
                        }
                    }
                }
            } catch (err) {
                console.error('Error loading branches:', err);
            }
        }
        loadBranches();
    }, [session]);

    // Load bay availability
    const loadBayAvailability = useCallback(async () => {
        if (!selectedBranch || !selectedDate) return;
        setIsLoading(true);
        try {
            const res = await fetch(`/api/bookings/bay-availability?branchId=${selectedBranch}&date=${selectedDate}`);
            const data = await res.json();
            if (data.success) {
                setIsClosed(data.isClosed || false);
                setClosedReason(data.reason || '');
                setBays(data.data || []);
                setNoBaysMessage(data.message || '');
                if (data.operatingHours) {
                    setOperatingHours(data.operatingHours);
                }
            }
        } catch (err) {
            console.error('Error loading bay availability:', err);
        } finally {
            setIsLoading(false);
        }
    }, [selectedBranch, selectedDate]);

    useEffect(() => {
        if (selectedBranch) {
            loadBayAvailability();
        }
    }, [selectedBranch, selectedDate, loadBayAvailability]);

    // Fetch bay availability for rescheduleDate
    useEffect(() => {
        if (!isRescheduling || !selectedBranch || !rescheduleDate) {
            setRescheduleBays([]);
            setIsRescheduleDateClosed(false);
            setRescheduleDateClosedReason('');
            return;
        }
        let active = true;
        async function loadRescheduleBays() {
            try {
                const res = await fetch(`/api/bookings/bay-availability?branchId=${selectedBranch}&date=${rescheduleDate}`);
                const data = await res.json();
                if (data.success && active) {
                    setRescheduleBays(data.data || []);
                    setIsRescheduleDateClosed(data.isClosed || false);
                    setRescheduleDateClosedReason(data.reason || '');
                }
            } catch (err) {
                console.error('Error loading reschedule bay availability:', err);
            }
        }
        loadRescheduleBays();
        return () => {
            active = false;
        };
    }, [isRescheduling, selectedBranch, rescheduleDate]);

    const paramBookingId = searchParams.get('bookingId');

    useEffect(() => {
        if (!paramBookingId) return;
        async function fetchAndOpenBooking() {
            try {
                const res = await fetch(`/api/bookings/${paramBookingId}`);
                const data = await res.json();
                if (data.success) {
                    const booking = data.data;
                    const bayName = booking.Bay?.BayName || 'ไม่ระบุช่องซ่อม';
                    setSelectedBooking(booking);
                    setSelectedBayName(bayName);
                    setActiveTab('detail');
                    setIsRescheduling(true);
                    setRescheduleDate(booking.BookingDate.split('T')[0]);
                    const sh = booking.StartTime.split(':')[0];
                    const sm = booking.StartTime.split(':')[1];
                    setRescheduleHour(sh);
                    setRescheduleMin(sm);
                    setCustomEndTime(booking.EndTime || computeDefaultEndTime(sh, sm, booking.DurationMinutes));
                    setRescheduleBayId(booking.BayID?.toString() || '');
                    setRescheduleReason('');
                    setRescheduleError('');
                    setBookingLogs(booking.Logs || []);
                }
            } catch (err) {
                console.error('Error fetching booking for reschedule redirect:', err);
            }
        }
        fetchAndOpenBooking();
    }, [paramBookingId, searchParams]);

    // Date navigation
    const goToDate = (offset: number) => {
        const [y, m, d] = selectedDate.split('-').map(Number);
        const nextDate = new Date(Date.UTC(y, m - 1, d + offset, 12, 0, 0));
        setSelectedDate(getBangkokDateString(nextDate));
    };

    const goToToday = () => {
        setSelectedDate(getBangkokDateString());
    };

    // Generate time slots for header
    const openMin = timeToMinutes(operatingHours.openTime);
    const closeMin = timeToMinutes(operatingHours.closeTime);
    const timeSlots: string[] = [];
    for (let m = openMin; m < closeMin; m += 30) {
        const h = Math.floor(m / 60);
        const min = m % 60;
        timeSlots.push(`${h.toString().padStart(2, '0')}:${min.toString().padStart(2, '0')}`);
    }
    const totalGridWidth = timeSlots.length * SLOT_WIDTH;

    const computeDefaultEndTime = (startH: string, startM: string, durationMins: number) => {
        const startMins = timeToMinutes(`${startH}:${startM}`);
        let endM = startMins + (durationMins || 120);
        const lunchStart = 12 * 60;
        if (startMins < lunchStart && endM > lunchStart) {
            endM += 60; // Add 60 mins for lunch break
        }
        return minutesToTime(endM);
    };

    // Handle booking click
    const handleBookingClick = async (booking: BayBooking, bayName: string) => {
        if (booking.isMasked || booking.CustomerName === 'จองแล้ว (คิวอื่น)') {
            return;
        }
        setSelectedBooking(booking);
        setSelectedBayName(bayName);
        setActiveTab('detail');
        setIsRescheduling(false);
        setRescheduleDate(selectedDate);
        const sh = booking.StartTime.split(':')[0];
        const sm = booking.StartTime.split(':')[1];
        setRescheduleHour(sh);
        setRescheduleMin(sm);
        setCustomEndTime(booking.EndTime || computeDefaultEndTime(sh, sm, booking.DurationMinutes || 0));
        setRescheduleBayId(booking.BayID?.toString() || '');
        setRescheduleReason('');
        setRescheduleError('');
        setBookingLogs([]);
        
        try {
            const res = await fetch(`/api/bookings/${booking.BookingID}`);
            const data = await res.json();
            if (data.success) {
                setSelectedBooking(data.data);
                setBookingLogs(data.data.Logs || []);
            }
        } catch (err) {
            console.error('Error loading booking logs:', err);
        }
    };

    const handleStartChange = (h: string, m: string) => {
        setRescheduleHour(h);
        setRescheduleMin(m);
        if (selectedBooking) {
            setCustomEndTime(computeDefaultEndTime(h, m, selectedBooking.DurationMinutes || 0));
        }
    };

    // Real-time Reschedule Conflict & Alternatives Calculation
    const rescheduleProposedStartTime = `${rescheduleHour}:${rescheduleMin}`;
    const rescheduleDuration = selectedBooking?.DurationMinutes || 120;
    const rescheduleProposedEndTime = customEndTime || computeDefaultEndTime(rescheduleHour, rescheduleMin, rescheduleDuration);
    const effectiveRescheduleBays: BayData[] = rescheduleBays.length > 0 ? rescheduleBays : bays;
    const currentRescheduleBay = effectiveRescheduleBays.find(b => b.BayID.toString() === rescheduleBayId);

    const rescheduleConflictResult = isRescheduling ? checkBayConflict({
        bay: currentRescheduleBay as any,
        startTime: rescheduleProposedStartTime,
        endTime: rescheduleProposedEndTime,
        excludeBookingId: selectedBooking?.BookingID,
    }) : { hasConflict: false };

    const rescheduleAlternativeSlots = isRescheduling && rescheduleConflictResult.hasConflict ? findAlternativeSlotsInBay({
        bay: currentRescheduleBay as any,
        durationMinutes: rescheduleDuration,
        excludeBookingId: selectedBooking?.BookingID,
        maxSlots: 4,
    }) : [];

    const rescheduleAlternativeBays = isRescheduling && rescheduleConflictResult.hasConflict ? findAlternativeAvailableBays({
        bays: effectiveRescheduleBays as any,
        currentBayId: rescheduleBayId,
        startTime: rescheduleProposedStartTime,
        endTime: rescheduleProposedEndTime,
        excludeBookingId: selectedBooking?.BookingID,
    }) : [];

    const handleSelectAlternativeSlot = (start: string) => {
        const [h, m] = start.split(':');
        handleStartChange(h, m);
    };

    const handleSelectAlternativeBay = (bayId: number) => {
        setRescheduleBayId(bayId.toString());
    };

    // Handle Save Reschedule
    const handleSaveReschedule = async () => {
        if (!selectedBooking) return;
        setRescheduleError('');

        if (!rescheduleDate) {
            setRescheduleError('กรุณาเลือกวันที่ใหม่');
            return;
        }
        if (!rescheduleReason.trim()) {
            setRescheduleError('กรุณาระบุเหตุผลการเลื่อนคิว');
            return;
        }

        if (rescheduleConflictResult.hasConflict) {
            setRescheduleError(rescheduleConflictResult.reason || 'ช่วงเวลาที่เลือกทับซ้อนกับคิวอื่น');
            return;
        }

        const startM = timeToMinutes(`${rescheduleHour}:${rescheduleMin}`);
        const lunchStart = 12 * 60;
        let endM = startM + rescheduleDuration;
        if (startM < lunchStart && endM > lunchStart) {
            endM += 60; // Add 60 mins for lunch break
        }
        const defaultEndTime = minutesToTime(endM);
        const finalEndTime = customEndTime || defaultEndTime;

        if (finalEndTime <= `${rescheduleHour}:${rescheduleMin}`) {
            setRescheduleError('เวลาเลิกงานใหม่ต้องมากกว่าเวลาเริ่มต้น');
            return;
        }

        setIsApproving(true);
        try {
            const res = await fetch(`/api/bookings/${selectedBooking.BookingID}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    BookingDate: rescheduleDate,
                    StartTime: `${rescheduleHour}:${rescheduleMin}`,
                    EndTime: finalEndTime,
                    RescheduleReason: rescheduleReason.trim(),
                    BayID: rescheduleBayId ? parseInt(rescheduleBayId) : null,
                }),
            });
            const data = await res.json();
            if (data.success) {
                setSelectedBooking(null);
                loadBayAvailability();
            } else {
                setRescheduleError(data.error || 'เกิดข้อผิดพลาดในการเลื่อนคิว');
            }
        } catch (err) {
            console.error('Error rescheduling booking:', err);
            setRescheduleError('เกิดข้อผิดพลาดระบบ');
        } finally {
            setIsApproving(false);
        }
    };

    // Handle approve/reject
    const handleApprove = async () => {
        if (!selectedBooking) return;
        setIsApproving(true);
        try {
            const res = await fetch(`/api/bookings/${selectedBooking.BookingID}/approve`, { method: 'POST' });
            const data = await res.json();
            if (data.success) {
                setSelectedBooking(null);
                loadBayAvailability();
            } else {
                showErrorModal('เกิดข้อผิดพลาด', data.error || 'ไม่สามารถอนุมัติได้');
            }
        } catch {
            showErrorModal('เกิดข้อผิดพลาด', 'เกิดข้อผิดพลาดในการอนุมัติ');
        } finally {
            setIsApproving(false);
        }
    };

    const handleReject = () => {
        if (!selectedBooking) return;
        showPromptModal(
            'ปฏิเสธการจอง',
            `ต้องการปฏิเสธ ${selectedBooking.BookingNo} ใช่หรือไม่?`,
            'เหตุผลในการปฏิเสธ (ถ้ามี)',
            'ระบุเหตุผล...',
            async (reason) => {
                setIsApproving(true);
                try {
                    const res = await fetch(`/api/bookings/${selectedBooking.BookingID}/reject`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ reason }),
                    });
                    const data = await res.json();
                    if (data.success) {
                        setSelectedBooking(null);
                        loadBayAvailability();
                    } else {
                        showErrorModal('เกิดข้อผิดพลาด', data.error || 'ไม่สามารถปฏิเสธได้');
                    }
                } catch {
                    showErrorModal('เกิดข้อผิดพลาด', 'เกิดข้อผิดพลาดในการปฏิเสธ');
                } finally {
                    setIsApproving(false);
                }
            }
        );
    };

    // Navigate to full-page booking form
    const handleSlotClick = (bayId: number, bayName: string, startTime: string) => {
        const params = new URLSearchParams({
            bayId: bayId.toString(),
            bayName,
            branchId: selectedBranch,
            date: selectedDate,
            startTime,
        });
        window.location.href = `/service-center/bookings/bay-booking?${params.toString()}`;
    };

    const handleBookingDragStart = (e: React.DragEvent, booking: BayBooking) => {
        e.dataTransfer.setData('text/plain', booking.BookingID.toString());
        e.dataTransfer.setData('bookingDuration', (booking.DurationMinutes || 120).toString());
        e.dataTransfer.effectAllowed = 'move';
    };

    const handleTimelineDrop = async (e: React.DragEvent, targetBayId: number, targetBayName: string) => {
        e.preventDefault();
        const bookingIdStr = e.dataTransfer.getData('text/plain');
        if (!bookingIdStr) return;
        const bookingId = parseInt(bookingIdStr);

        let foundBooking: BayBooking | null = null;
        for (const b of bays) {
            const found = b.Bookings.find(bk => bk.BookingID === bookingId);
            if (found) {
                foundBooking = found;
                break;
            }
        }
        if (!foundBooking) return;

        const rect = e.currentTarget.getBoundingClientRect();
        const clickX = e.clientX - rect.left;
        const totalWidth = rect.width;
        const totalMinutes = closeMin - openMin;

        const clickMinutes = (clickX / totalWidth) * totalMinutes;
        const absoluteMinutes = openMin + clickMinutes;

        // Round to nearest 30 mins
        const roundedMinutes = Math.round(absoluteMinutes / 30) * 30;
        
        // Boundary check
        const duration = foundBooking.DurationMinutes || 120;
        const finalStartMinutes = Math.max(openMin, Math.min(roundedMinutes, closeMin - duration));
        
        const newStartTime = minutesToTime(finalStartMinutes);
        const newHour = newStartTime.split(':')[0];
        const newMin = newStartTime.split(':')[1];

        setSelectedBooking(foundBooking);
        setSelectedBayName(targetBayName);
        setRescheduleBayId(targetBayId.toString());
        setRescheduleDate(selectedDate);
        setRescheduleHour(newHour);
        setRescheduleMin(newMin);
        setIsRescheduling(true);
        setActiveTab('detail');
        setRescheduleReason('');
        setRescheduleError('');
        setBookingLogs([]);
        
        try {
            const res = await fetch(`/api/bookings/${bookingId}`);
            const data = await res.json();
            if (data.success) {
                setSelectedBooking(data.data);
                setBookingLogs(data.data.Logs || []);
            }
        } catch (err) {
            console.error('Error loading booking logs during drag-drop:', err);
        }
    };

    const handleToggleBranchClosed = () => {
        if (!selectedBranch) return;
        if (isClosed) {
            // Open branch - directly execute
            showConfirmModal('เปิดรับคิว', 'ต้องการเปิดรับคิวตามปกติใช่หรือไม่?', async () => {
                setIsTogglingClosed(true);
                try {
                    const resList = await fetch(`/api/bookings/holidays?branchId=${selectedBranch}`);
                    const dataList = await resList.json();
                    if (dataList.success) {
                        const targetDateStr = selectedDate;
                        const foundHoliday = dataList.data.find((h: any) => h.HolidayDate.startsWith(targetDateStr));
                        if (foundHoliday) {
                            const resDel = await fetch(`/api/bookings/holidays?holidayId=${foundHoliday.HolidayID}`, {
                                method: 'DELETE',
                            });
                            const dataDel = await resDel.json();
                            if (dataDel.success) {
                                showSuccessModal('สำเร็จ', 'เปิดรับคิวตามปกติเรียบร้อยแล้ว');
                                loadBayAvailability();
                            } else {
                                showErrorModal('เกิดข้อผิดพลาด', dataDel.error || 'เกิดข้อผิดพลาดในการเปิดรับคิว');
                            }
                        } else {
                            showErrorModal('ไม่สามารถดำเนินการได้', 'ไม่สามารถเปิดรับคิวในวันหยุดประจำสัปดาห์ได้ (กรุณาแก้ไขการตั้งค่าวันทำงานสาขา)');
                        }
                    }
                } catch (err) {
                    console.error('Error toggling branch closed status:', err);
                    showErrorModal('เกิดข้อผิดพลาด', 'เกิดข้อผิดพลาดในการทำรายการ');
                } finally {
                    setIsTogglingClosed(false);
                }
            });
        } else {
            // Close branch - need reason
            showPromptModal(
                '🔒 ปิดรับคิววันนี้',
                'กรุณาระบุเหตุผลในการปิดรับคิว',
                'เหตุผล',
                'เช่น พนักงานลา หรือ ปิดทำการชั่วคราว',
                async (reason) => {
                    setIsTogglingClosed(true);
                    try {
                        const finalReason = (reason || '').trim() || 'ปิดรับคิวประจำวัน';
                        const resPost = await fetch('/api/bookings/holidays', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                branchId: selectedBranch,
                                date: selectedDate,
                                description: finalReason,
                            }),
                        });
                        const dataPost = await resPost.json();
                        if (dataPost.success) {
                            showSuccessModal('สำเร็จ', 'ปิดรับคิวสำหรับวันนี้เรียบร้อยแล้ว');
                            loadBayAvailability();
                        } else {
                            showErrorModal('เกิดข้อผิดพลาด', dataPost.error || 'เกิดข้อผิดพลาดในการปิดรับคิว');
                        }
                    } catch (err) {
                        console.error('Error toggling branch closed status:', err);
                        showErrorModal('เกิดข้อผิดพลาด', 'เกิดข้อผิดพลาดในการทำรายการ');
                    } finally {
                        setIsTogglingClosed(false);
                    }
                }
            );
        }
    };

    const handleToggleBayClose = (bayId: number, bayName: string, isBlocked: boolean, blockBookingId?: number) => {
        if (!selectedBranch) return;
        if (isBlocked && blockBookingId) {
            showConfirmModal(
                'เปิดให้บริการ',
                `ต้องการเปิดให้บริการ ${bayName} ตามปกติใช่หรือไม่?`,
                async () => {
                    try {
                        const res = await fetch(`/api/bookings/${blockBookingId}`, {
                            method: 'PUT',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ status: 2 }),
                        });
                        const data = await res.json();
                        if (data.success) {
                            showSuccessModal('สำเร็จ', `เปิดให้บริการ ${bayName} ตามปกติเรียบร้อยแล้ว`);
                            loadBayAvailability();
                        } else {
                            showErrorModal('เกิดข้อผิดพลาด', data.error || 'เกิดข้อผิดพลาดในการเปิดช่องซ่อม');
                        }
                    } catch (err) {
                        console.error('Error toggling bay close status:', err);
                        showErrorModal('เกิดข้อผิดพลาด', 'เกิดข้อผิดพลาดในการทำรายการ');
                    }
                }
            );
        } else {
            showPromptModal(
                `🔒 ปิด ${bayName} วันนี้`,
                `กรุณาระบุสาเหตุที่ปิด ${bayName}`,
                'สาเหตุ',
                'เช่น ช่างลา, ปรับปรุงเครื่องมือ',
                async (reason) => {
                    try {
                        const finalReason = (reason || '').trim() || 'งดให้บริการช่องซ่อมชั่วคราว';
                        const res = await fetch('/api/bookings', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                BookingDate: selectedDate,
                                StartTime: '08:00',
                                EndTime: '17:30',
                                CustomerName: '[ปิดช่องซ่อมชั่วคราว]',
                                CarRegister: 'BLOCK',
                                CarModel: finalReason,
                                BranchID: selectedBranch,
                                BayID: bayId,
                                ServiceTypeID: null,
                                DurationMinutes: 570,
                                LastMileage: 0,
                                ClaimDetail: finalReason,
                            }),
                        });
                        const data = await res.json();
                        if (data.success) {
                            showSuccessModal('สำเร็จ', `ปิดบริการ ${bayName} เรียบร้อยแล้ว`);
                            loadBayAvailability();
                        } else {
                            showErrorModal('เกิดข้อผิดพลาด', data.error || 'เกิดข้อผิดพลาดในการปิดช่องซ่อม');
                        }
                    } catch (err) {
                        console.error('Error toggling bay close status:', err);
                        showErrorModal('เกิดข้อผิดพลาด', 'เกิดข้อผิดพลาดในการทำรายการ');
                    }
                }
            );
        }
    };

    if (isLoading && !bays.length) {
        return <LoadingPage />;
    }

    return (
        <>
            <Header title="Bay Calendar" subtitle="ตารางจอง Service Bay" />

            <div className="p-4 lg:p-6 space-y-4">
                {/* Controls Bar */}
                <Card>
                    <CardContent className="p-4">
                        <div className="flex flex-wrap items-center gap-3">
                            {/* Branch Selector (Admin & all CS roles) / Branch Display (Service Center) */}
                            {canSelectBranch ? (
                                <div className="w-64">
                                    <Select
                                        value={selectedBranch}
                                        onChange={(e) => setSelectedBranch(e.target.value)}
                                        options={branches.map(b => ({ value: b.BranchID.toString(), label: `สาขา${b.BranchName}` }))}
                                        placeholder="เลือกสาขา"
                                    />
                                </div>
                            ) : (
                                <div className="flex items-center gap-1.5 px-3.5 py-2 bg-blue-50 border border-blue-200 text-blue-800 rounded-lg text-sm font-semibold">
                                    <MapPin className="w-4 h-4 text-blue-600 shrink-0" />
                                    <span>สาขา{currentBranchName}</span>
                                </div>
                            )}

                            {/* Date Navigation */}
                            <div className="flex items-center gap-1 bg-gray-100 rounded-lg px-2 py-1">
                                <button onClick={() => goToDate(-1)} className="p-1.5 hover:bg-gray-300 rounded transition-colors text-gray-700">
                                    <ChevronLeft className="w-5 h-5" />
                                </button>
                                <button
                                    onClick={goToToday}
                                    className="px-3 py-1 text-sm font-semibold text-blue-700 hover:bg-blue-100 rounded transition-colors"
                                >
                                    วันนี้
                                </button>
                                <button onClick={() => goToDate(1)} className="p-1.5 hover:bg-gray-300 rounded transition-colors text-gray-700">
                                    <ChevronRight className="w-5 h-5" />
                                </button>
                            </div>

                            <div className="flex items-center gap-2">
                                <Calendar className="w-5 h-5 text-gray-600" />
                                <input
                                    type="date"
                                    value={selectedDate}
                                    onChange={(e) => setSelectedDate(e.target.value)}
                                    className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm text-gray-800 font-medium focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                />
                                <span className="text-sm font-semibold text-gray-900">
                                    {formatThaiDate(selectedDate)}
                                </span>
                            </div>

                            <div className="flex-1" />

                            {/* Add booking button - all roles */}
                            <Button
                                size="sm"
                                className="bg-blue-600 hover:bg-blue-700 text-white font-bold"
                                onClick={() => {
                                    if (bays.length > 0) {
                                        handleSlotClick(bays[0].BayID, bays[0].BayName, operatingHours.openTime);
                                    }
                                }}
                            >
                                <Plus className="w-4 h-4 mr-1" />
                                เพิ่มคิว
                            </Button>

                            {/* Quick Actions - ADMIN/SERVICE_CENTER only */}
                            {(isAdmin || session?.user?.role === 'SERVICE_CENTER') && (
                                <div className="flex items-center gap-2">
                                    <Button
                                        variant={isClosed ? "outline" : "danger"}
                                        size="sm"
                                        onClick={handleToggleBranchClosed}
                                        disabled={isTogglingClosed}
                                        className={isClosed ? "border-emerald-500 text-emerald-700 hover:bg-emerald-50 bg-white font-bold" : "bg-red-600 hover:bg-red-700 text-white font-bold"}
                                    >
                                        {isTogglingClosed ? (
                                            "กำลังบันทึก..."
                                        ) : isClosed ? (
                                            "🔓 เปิดรับคิวปกติ"
                                        ) : (
                                            "🔒 ปิดรับคิววันนี้"
                                        )}
                                    </Button>
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => window.location.href = '/service-center/bookings/settings'}
                                    >
                                        <Settings className="w-4 h-4 mr-1" />
                                        ตั้งค่า
                                    </Button>
                                </div>
                            )}
                        </div>
                    </CardContent>
                </Card>

                {/* Status Legend */}
                <div className="flex flex-wrap items-center gap-4 text-xs">
                    {Object.entries(STATUS_CONFIG).map(([status, config]) => (
                        <div key={status} className="flex items-center gap-1.5">
                            <div className={`w-3.5 h-3.5 rounded ${config.bgColor} border ${config.borderColor}`} />
                            <span className="text-gray-800 font-medium">{config.label}</span>
                        </div>
                    ))}
                    <div className="flex items-center gap-1.5">
                        <div className="w-3.5 h-3.5 rounded bg-white border border-dashed border-gray-400" />
                        <span className="text-gray-800 font-medium">ว่าง (คลิกเพื่อจอง)</span>
                    </div>
                </div>

                {isClosed && (
                    <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700 font-bold flex items-center gap-2 mb-2">
                        <span>🔴</span>
                        <span>ปิดรับคิวเพิ่มเติมสำหรับวันนี้เนื่องจาก: <strong>{closedReason}</strong> (ยังคงจัดการคิวเดิมที่ค้างอยู่ได้ แต่จะไม่เปิดให้จองคิวใหม่เพิ่ม)</span>
                    </div>
                )}

                {/* Bay Calendar Grid */}
                {noBaysMessage && bays.length === 0 ? (
                    <Card>
                        <CardContent className="p-12 text-center">
                            <div className="text-6xl mb-4">🔧</div>
                            <h3 className="text-lg font-semibold text-gray-700 mb-2">{noBaysMessage}</h3>
                            <p className="text-gray-500 mb-4">กรุณาตั้งค่า Service Bay ที่หน้าตั้งค่าก่อน</p>
                            <Button onClick={() => window.location.href = '/service-center/bookings/settings'}>
                                <Settings className="w-4 h-4 mr-1" />
                                ไปหน้าตั้งค่า
                            </Button>
                        </CardContent>
                    </Card>
                ) : (
                    <Card>
                        <CardHeader className="py-3 px-4 bg-white border-b border-gray-100">
                            <CardTitle className="flex flex-wrap items-center justify-between gap-2">
                                <div className="flex items-center gap-2">
                                    <Clock className="w-5 h-5 text-blue-600" />
                                    <span className="font-bold text-gray-900">{formatThaiDate(selectedDate)}</span>
                                    <span className="text-sm font-normal text-gray-500">
                                        ({operatingHours.openTime} - {operatingHours.closeTime})
                                    </span>
                                </div>
                                {currentBranchName && (
                                    <div className="flex items-center gap-1.5 text-sm font-bold text-blue-700 bg-blue-50 border border-blue-200 px-3 py-1 rounded-full">
                                        <MapPin className="w-4 h-4 text-blue-600" />
                                        สาขา{currentBranchName}
                                    </div>
                                )}
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="p-0">
                            <div className="overflow-x-auto">
                                <div style={{ minWidth: BAY_LABEL_WIDTH + totalGridWidth + 20 }}>
                                    {/* Time Header */}
                                    <div className="flex border-b border-gray-200 bg-gray-50 sticky top-0 z-10">
                                        <div className="shrink-0 border-r border-gray-200 px-3 py-2 font-semibold text-xs text-gray-500 uppercase"
                                            style={{ width: BAY_LABEL_WIDTH }}
                                        >
                                            Bay
                                        </div>
                                        <div className="flex">
                                            {timeSlots.map((time, i) => (
                                                <div
                                                    key={time}
                                                    className={`shrink-0 text-center text-xs font-medium text-gray-500 py-2 border-r border-gray-100 ${i % 2 === 0 ? 'bg-gray-50' : 'bg-white'}`}
                                                    style={{ width: SLOT_WIDTH }}
                                                >
                                                    {time}
                                                </div>
                                            ))}
                                        </div>
                                    </div>

                                    {/* Bay Rows */}
                                    {bays.map((bay) => (
                                        <BayRow
                                            key={bay.BayID}
                                            bay={bay}
                                            timeSlots={timeSlots}
                                            openMin={openMin}
                                            closeMin={closeMin}
                                            onBookingClick={(b) => handleBookingClick(b, bay.BayName)}
                                            onSlotClick={(startTime) => handleSlotClick(bay.BayID, bay.BayName, startTime)}
                                            onBookingDragStart={handleBookingDragStart}
                                            onTimelineDrop={handleTimelineDrop}
                                            onToggleBayClose={isCSRole(session?.user?.role) ? undefined : handleToggleBayClose}
                                            isClosed={isClosed}
                                        />
                                    ))}
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                )}
            </div>

            {/* Booking Detail Modal */}
            {selectedBooking && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setSelectedBooking(null)}>
                    <div className="bg-white rounded-xl shadow-2xl w-full max-w-md mx-4 overflow-hidden" onClick={(e) => e.stopPropagation()}>
                        <div className={`px-6 py-4 ${selectedBooking.CustomerName === '[ปิดช่องซ่อมชั่วคราว]' ? 'bg-red-50' : STATUS_CONFIG[selectedBooking.Status]?.bgColor || 'bg-gray-50'}`}>
                            <div className="flex items-center justify-between">
                                <div>
                                    <h3 className="font-bold text-gray-900">{selectedBooking.CustomerName === '[ปิดช่องซ่อมชั่วคราว]' ? 'ระบบล็อกช่องซ่อม' : selectedBooking.BookingNo}</h3>
                                    <p className="text-sm text-gray-600 font-semibold">{selectedBayName}</p>
                                </div>
                                <Badge variant={selectedBooking.CustomerName === '[ปิดช่องซ่อมชั่วคราว]' ? 'danger' : selectedBooking.Status === 1 ? 'success' : selectedBooking.Status === 0 ? 'warning' : 'default'}>
                                    {selectedBooking.CustomerName === '[ปิดช่องซ่อมชั่วคราว]' ? 'งดให้บริการ' : STATUS_CONFIG[selectedBooking.Status]?.label || 'Unknown'}
                                </Badge>
                            </div>
                        </div>
                        {/* Tab switcher */}
                        {!isRescheduling && selectedBooking.CustomerName !== '[ปิดช่องซ่อมชั่วคราว]' && (
                            <div className="flex border-b border-gray-100 bg-gray-50/50">
                                <button
                                    onClick={() => setActiveTab('detail')}
                                    className={`flex-1 py-3 text-center text-sm font-bold border-b-2 transition-all ${
                                        activeTab === 'detail'
                                            ? 'border-blue-600 text-blue-600'
                                            : 'border-transparent text-gray-400 hover:text-gray-600'
                                    }`}
                                >
                                    ข้อมูลทั่วไป
                                </button>
                                <button
                                    onClick={() => setActiveTab('logs')}
                                    className={`flex-1 py-3 text-center text-sm font-bold border-b-2 transition-all ${
                                        activeTab === 'logs'
                                            ? 'border-blue-600 text-blue-600'
                                            : 'border-transparent text-gray-400 hover:text-gray-600'
                                    }`}
                                >
                                    ประวัติ ({bookingLogs.length})
                                </button>
                            </div>
                        )}

                        <div className="px-6 py-5">
                            {isRescheduling ? (
                                <div className="space-y-4">
                                    <h4 className="font-bold text-gray-900 text-sm">เลื่อนคิวนัดหมาย</h4>
                                    {rescheduleError && (
                                        <div className="p-2.5 bg-red-50 border border-red-200 text-red-700 text-xs font-semibold rounded-lg">
                                            {rescheduleError}
                                        </div>
                                    )}
                                    <div className="space-y-3">
                                        <div>
                                            <label className="block text-xs font-bold text-gray-700 mb-1">วันที่ใหม่ *</label>
                                            <input
                                                type="date"
                                                value={rescheduleDate}
                                                onChange={(e) => setRescheduleDate(e.target.value)}
                                                className="w-full border-2 border-gray-300 rounded-lg px-3 py-2 text-sm font-semibold text-gray-900 bg-white"
                                            />
                                            {isRescheduleDateClosed && (
                                                <div className="p-2 bg-amber-50 border border-amber-200 text-amber-700 text-xs font-semibold rounded-lg mt-1">
                                                    ⚠️ สาขาปิดทำการในวันที่เลือก: {rescheduleDateClosedReason}
                                                </div>
                                            )}
                                        </div>
                                        <div>
                                            <label className="block text-xs font-bold text-gray-700 mb-1">เวลาเริ่มใหม่ *</label>
                                            <div className="flex items-center gap-1">
                                                <select
                                                    value={rescheduleHour}
                                                    onChange={(e) => handleStartChange(e.target.value, rescheduleMin)}
                                                    className="flex-1 border-2 border-gray-300 rounded-lg px-3 py-2 text-sm font-bold text-gray-900 bg-white"
                                                >
                                                    {Array.from({ length: 11 }, (_, i) => {
                                                        const h = (i + 8).toString().padStart(2, '0');
                                                        return <option key={h} value={h}>{h}</option>;
                                                    })}
                                                </select>
                                                <span className="text-lg font-bold text-gray-900">:</span>
                                                <select
                                                    value={rescheduleMin}
                                                    onChange={(e) => handleStartChange(rescheduleHour, e.target.value)}
                                                    className="flex-1 border-2 border-gray-300 rounded-lg px-3 py-2 text-sm font-bold text-gray-900 bg-white"
                                                >
                                                    <option value="00">00</option>
                                                    <option value="30">30</option>
                                                </select>
                                            </div>
                                        </div>

                                        {/* EndTime adjustment for Branch / Admin users (HIDE from all CS roles) */}
                                        {!isCS && (
                                            <div className="bg-purple-50 border border-purple-200 rounded-xl p-3 space-y-2">
                                                <div className="flex items-center justify-between text-xs font-bold text-purple-900">
                                                    <span>⏱️ เวลาเลิกงาน / เวลาเสร็จ (EndTime)</span>
                                                    <span className="text-[10px] text-purple-700 bg-purple-100 px-2 py-0.5 rounded font-medium">
                                                        คำนวณให้อัตโนมัติ ปรับเพิ่มได้
                                                    </span>
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    <input
                                                        type="time"
                                                        value={customEndTime}
                                                        onChange={(e) => setCustomEndTime(e.target.value)}
                                                        className="border border-purple-300 rounded-lg px-3 py-1.5 text-sm font-bold text-purple-900 bg-white w-full focus:ring-2 focus:ring-purple-500"
                                                    />
                                                </div>
                                                <div className="grid grid-cols-6 gap-1.5 pt-1">
                                                    {[
                                                        { label: '-1h', mins: -60 },
                                                        { label: '-30m', mins: -30 },
                                                        { label: '+30m', mins: 30 },
                                                        { label: '+1h', mins: 60 },
                                                        { label: '+1.5h', mins: 90 },
                                                        { label: '+2h', mins: 120 },
                                                    ].map((btn) => (
                                                        <button
                                                            key={btn.label}
                                                            type="button"
                                                            onClick={() => {
                                                                const currentEnd = customEndTime || selectedBooking?.EndTime || computeDefaultEndTime(rescheduleHour, rescheduleMin, selectedBooking?.DurationMinutes || 0);
                                                                const [h, m] = currentEnd.split(':').map(Number);
                                                                const totalMins = h * 60 + m + btn.mins;
                                                                const startMins = timeToMinutes(`${rescheduleHour}:${rescheduleMin}`);
                                                                // Prevent end time from going before start time + 30 min
                                                                const clampedMins = Math.max(totalMins, startMins + 30);
                                                                const newH = String(Math.floor(clampedMins / 60)).padStart(2, '0');
                                                                const newM = String(clampedMins % 60).padStart(2, '0');
                                                                setCustomEndTime(`${newH}:${newM}`);
                                                            }}
                                                            className={`py-1 px-1 bg-white border rounded text-xs font-bold transition-colors ${
                                                                btn.mins < 0
                                                                    ? 'hover:bg-red-100 border-red-300 text-red-700'
                                                                    : 'hover:bg-purple-100 border-purple-300 text-purple-800'
                                                            }`}
                                                        >
                                                            {btn.label}
                                                        </button>
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                        <div>
                                            <label className="block text-xs font-bold text-gray-700 mb-1">ช่องซ่อม *</label>
                                            <select
                                                value={rescheduleBayId}
                                                onChange={(e) => setRescheduleBayId(e.target.value)}
                                                className="w-full border-2 border-gray-300 rounded-lg px-3 py-2 text-sm font-bold text-gray-900 bg-white"
                                                disabled={isRescheduleDateClosed}
                                            >
                                                {(effectiveRescheduleBays.length === 0) && selectedBooking.BayID && (
                                                    <option value={selectedBooking.BayID.toString()}>{selectedBayName}</option>
                                                )}
                                                {effectiveRescheduleBays.map(b => {
                                                    const isBayBlocked = b.Bookings?.some(bk => bk.CustomerName === '[ปิดช่องซ่อมชั่วคราว]' && bk.CarRegister === 'BLOCK');
                                                    const bayConflict = checkBayConflict({
                                                        bay: b as any,
                                                        startTime: rescheduleProposedStartTime,
                                                        endTime: rescheduleProposedEndTime,
                                                        excludeBookingId: selectedBooking?.BookingID,
                                                    });

                                                    let statusLabel = '';
                                                    if (isBayBlocked) statusLabel = ' (🚫 งดให้บริการชั่วคราว)';
                                                    else if (bayConflict.hasConflict) statusLabel = ' (⚠️ มีคิวทับซ้อนในเวลานี้)';
                                                    else statusLabel = ' (✅ ว่าง)';

                                                    return (
                                                        <option
                                                            key={b.BayID}
                                                            value={b.BayID.toString()}
                                                            disabled={isBayBlocked}
                                                            className={isBayBlocked || bayConflict.hasConflict ? "text-amber-800 font-semibold" : "text-gray-900 font-bold"}
                                                        >
                                                            {b.BayName}{statusLabel}
                                                        </option>
                                                    );
                                                })}
                                            </select>
                                        </div>

                                        {/* Real-time Conflict & Alternative Slots Component */}
                                        <RescheduleConflictAlert
                                            conflictResult={rescheduleConflictResult}
                                            alternativeSlots={rescheduleAlternativeSlots}
                                            alternativeBays={rescheduleAlternativeBays}
                                            currentBayName={currentRescheduleBay?.BayName}
                                            onSelectAlternativeSlot={handleSelectAlternativeSlot}
                                            onSelectAlternativeBay={handleSelectAlternativeBay}
                                            hasValidTime={!!(rescheduleDate && rescheduleHour && rescheduleMin)}
                                        />

                                        <div>
                                            <label className="block text-xs font-bold text-gray-700 mb-1">เหตุผลการเลื่อน *</label>
                                            <textarea
                                                placeholder="กรุณาระบุเหตุผลการเลื่อนคิว..."
                                                value={rescheduleReason}
                                                onChange={(e) => setRescheduleReason(e.target.value)}
                                                rows={2}
                                                className="w-full border-2 border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 bg-white font-medium focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                            />
                                        </div>

                                        {/* Warning: ไมล์อาจเกินระยะเช็ค */}
                                        {rescheduleDate && selectedBooking && (
                                            <MileageWarning
                                                lastMileage={selectedBooking.LastMileage || 0}
                                                targetMileage={selectedBooking.Mileage || 0}
                                                bookingDate={rescheduleDate}
                                            />
                                        )}
                                    </div>
                                    <div className="flex gap-2 justify-end pt-3">
                                        <Button variant="outline" size="sm" onClick={() => setIsRescheduling(false)}>
                                            ยกเลิก
                                        </Button>
                                        <Button
                                            size="sm"
                                            onClick={handleSaveReschedule}
                                            disabled={isApproving || rescheduleConflictResult.hasConflict || isRescheduleDateClosed || !rescheduleReason.trim()}
                                        >
                                            บันทึก
                                        </Button>
                                    </div>
                                </div>
                            ) : activeTab === 'detail' ? (
                                <div className="space-y-4">
                                    {selectedBooking.CustomerName === '[ปิดช่องซ่อมชั่วคราว]' ? (
                                        <div className="text-center py-4 space-y-3">
                                            <div className="text-5xl">🚫</div>
                                            <h4 className="font-bold text-gray-800 text-base">งดให้บริการช่องซ่อมนี้ชั่วคราว</h4>
                                            <div className="bg-red-50 text-red-750 px-4 py-3 rounded-lg border border-red-200 text-sm font-semibold max-w-sm mx-auto">
                                                สาเหตุ: {selectedBooking.CarModel}
                                            </div>
                                            <p className="text-xs text-gray-500 font-bold">
                                                ประจำวันที่ {formatThaiDate(selectedDate)} ({selectedBooking.StartTime} - {selectedBooking.EndTime} น.)
                                            </p>
                                        </div>
                                    ) : (
                                        <>
                                            <div className="grid grid-cols-2 gap-4 text-sm">
                                                <div>
                                                    <span className="text-gray-700 font-bold text-xs">เวลา</span>
                                                    <p className="font-bold text-gray-900 text-base mt-0.5">{selectedBooking.StartTime} - {selectedBooking.EndTime} น.</p>
                                                </div>
                                                <div>
                                                    <span className="text-gray-700 font-bold text-xs">ระยะเวลา</span>
                                                    <p className="font-bold text-gray-900 text-base mt-0.5">{selectedBooking.DurationMinutes ? `${selectedBooking.DurationMinutes} นาที` : '-'}</p>
                                                </div>
                                                <div>
                                                    <span className="text-gray-700 font-bold text-xs">ลูกค้า</span>
                                                    <p className="font-bold text-gray-900 text-base mt-0.5">{selectedBooking.CustomerName}</p>
                                                </div>
                                                <div>
                                                    <span className="text-gray-700 font-bold text-xs">ทะเบียน</span>
                                                    <p className="font-bold text-gray-900 text-base mt-0.5">{selectedBooking.CarRegister}</p>
                                                </div>
                                                <div>
                                                    <span className="text-gray-700 font-bold text-xs">เบอร์โทร</span>
                                                    <p className="font-bold text-gray-900 text-base mt-0.5">
                                                        {selectedBooking.CustomerPhone ? (
                                                            <a href={`tel:${selectedBooking.CustomerPhone}`} className="text-blue-600 hover:underline">{selectedBooking.CustomerPhone}</a>
                                                        ) : (
                                                            <span className="text-gray-400">-</span>
                                                        )}
                                                    </p>
                                                </div>
                                                <div>
                                                    <span className="text-gray-700 font-bold text-xs">วันที่จอง</span>
                                                    <p className="font-bold text-gray-900 text-base mt-0.5">{selectedBooking.BookingDate ? formatThaiDate(typeof selectedBooking.BookingDate === 'string' ? selectedBooking.BookingDate.split('T')[0] : new Date(selectedBooking.BookingDate).toISOString().split('T')[0]) : '-'}</p>
                                                </div>
                                                <div className="col-span-2">
                                                    <span className="text-gray-700 font-bold text-xs">รุ่นรถ</span>
                                                    <p className="font-bold text-gray-900 text-base mt-0.5">{selectedBooking.CarModel || '-'}</p>
                                                </div>
                                                {selectedBooking.ServiceType && (
                                                    <div className="col-span-2">
                                                        <span className="text-gray-700 font-bold text-xs">ประเภทบริการ</span>
                                                        <p className="font-bold text-gray-900 text-base mt-0.5">{selectedBooking.ServiceType.Name}</p>
                                                    </div>
                                                )}
                                                {(selectedBooking.Mileage != null && selectedBooking.Mileage > 0) && (
                                                    <div className="col-span-2">
                                                        <span className="text-gray-700 font-bold text-xs">เช็คระยะ (กม.)</span>
                                                        <p className="font-bold text-blue-700 text-base mt-0.5">
                                                            {selectedBooking.Mileage.toLocaleString()} กม.
                                                            {selectedBooking.LastMileage != null && selectedBooking.LastMileage > 0 && (
                                                                <span className="text-gray-500 text-xs font-medium ml-2">(ล่าสุด {selectedBooking.LastMileage.toLocaleString()} กม.)</span>
                                                            )}
                                                        </p>
                                                    </div>
                                                )}
                                            </div>
                                            {selectedBooking.ClaimDetail && (
                                                <div className="mt-3 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                                                    <span className="text-blue-800 font-bold text-xs block mb-1">📝 รายละเอียด / หมายเหตุ</span>
                                                    <p className="text-sm text-blue-900 font-medium whitespace-pre-wrap">{selectedBooking.ClaimDetail}</p>
                                                </div>
                                            )}
                                            {(selectedBooking.Status === 0 || selectedBooking.Status === 1) && (
                                                <div className="pt-2">
                                                    <Button
                                                        variant="outline"
                                                        size="sm"
                                                        className="w-full text-blue-600 border-blue-200 hover:bg-blue-50 font-bold"
                                                        onClick={() => {
                                                            if (selectedBooking) {
                                                                setCustomEndTime(selectedBooking.EndTime || computeDefaultEndTime(rescheduleHour, rescheduleMin, selectedBooking.DurationMinutes || 0));
                                                            }
                                                            setIsRescheduling(true);
                                                        }}
                                                    >
                                                        <Clock className="w-4 h-4 mr-1.5" />
                                                        เลื่อนคิวนัดหมาย/ปรับเพิ่มเวลา
                                                    </Button>
                                                </div>
                                            )}
                                        </>
                                    )}
                                </div>
                            ) : (
                                <div className="space-y-4 max-h-[300px] overflow-y-auto pr-1">
                                    {bookingLogs.length === 0 ? (
                                        <p className="text-sm text-gray-400 text-center py-8">ไม่มีประวัติการบันทึก</p>
                                    ) : (
                                        <div className="relative border-l border-gray-200 ml-3 pl-4 space-y-4">
                                            {bookingLogs.map((log) => (
                                                <div key={log.LogID} className="relative">
                                                    <span className="absolute -left-[22px] top-1.5 flex h-3 w-3 items-center justify-center rounded-full bg-white ring-2 ring-gray-300">
                                                        <span className={`h-1.5 w-1.5 rounded-full ${
                                                            log.LogType === 'RESCHEDULE' ? 'bg-amber-500' :
                                                            log.LogType === 'CANCEL' ? 'bg-red-500' :
                                                            log.LogType === 'APPROVE' ? 'bg-emerald-500' :
                                                            log.LogType === 'REJECT' ? 'bg-rose-500' : 'bg-blue-500'
                                                        }`} />
                                                    </span>
                                                    <div className="flex flex-col">
                                                        <div className="flex items-center justify-between text-[10px] text-gray-400">
                                                            <span className="font-bold text-gray-600">{log.CreateBy}</span>
                                                            <span>{new Date(log.CreateDate).toLocaleString('th-TH', { hour12: false })} น.</span>
                                                        </div>
                                                        <span className="mt-1 text-xs font-bold text-gray-800 leading-relaxed bg-gray-50 p-2 rounded-lg border border-gray-100 block">
                                                            {log.Content}
                                                        </span>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>

                        {!isRescheduling && (
                            <div className="px-6 py-4 border-t border-gray-100 flex items-center gap-2 justify-end">
                                {selectedBooking.CustomerName === '[ปิดช่องซ่อมชั่วคราว]' ? (
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        className="text-emerald-600 border-emerald-250 hover:bg-emerald-50 font-bold"
                                        onClick={() => {
                                            showConfirmModal(
                                                'เปิดให้บริการ',
                                                `ต้องการเปิดให้บริการ ${selectedBayName} ตามปกติใช่หรือไม่?`,
                                                async () => {
                                                    try {
                                                        const res = await fetch(`/api/bookings/${selectedBooking.BookingID}`, {
                                                            method: 'PUT',
                                                            headers: { 'Content-Type': 'application/json' },
                                                            body: JSON.stringify({ status: 2 }),
                                                        });
                                                        const data = await res.json();
                                                        if (data.success) {
                                                            showSuccessModal('สำเร็จ', `เปิดให้บริการ ${selectedBayName} ตามปกติเรียบร้อยแล้ว`);
                                                            setSelectedBooking(null);
                                                            loadBayAvailability();
                                                        } else {
                                                            showErrorModal('เกิดข้อผิดพลาด', data.error || 'เกิดข้อผิดพลาดในการเปิดช่องซ่อม');
                                                        }
                                                    } catch (err) {
                                                        console.error('Error opening bay:', err);
                                                        showErrorModal('เกิดข้อผิดพลาด', 'เกิดข้อผิดพลาดในระบบ');
                                                    }
                                                }
                                            );
                                        }}
                                    >
                                        🔓 เปิดให้บริการตามปกติ
                                    </Button>
                                ) : selectedBooking.Status === 0 && activeTab === 'detail' && (isAdmin || session?.user?.role === 'SERVICE_CENTER') ? (
                                    <>
                                        <Button variant="outline" size="sm" onClick={handleReject} disabled={isApproving}>
                                            <XIcon className="w-4 h-4 mr-1" />
                                            ปฏิเสธ
                                        </Button>
                                        <Button size="sm" onClick={handleApprove} disabled={isApproving}>
                                            <Check className="w-4 h-4 mr-1" />
                                            อนุมัติ
                                        </Button>
                                    </>
                                ) : null}
                                <Button variant="ghost" size="sm" onClick={() => setSelectedBooking(null)}>
                                    ปิด
                                </Button>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Bay Booking Modal */}
            {bookingModal && (
                <BayBookingModal
                    isOpen={!!bookingModal}
                    onClose={() => setBookingModal(null)}
                    onSuccess={() => { setBookingModal(null); loadBayAvailability(); }}
                    bayId={bookingModal.bayId}
                    bayName={bookingModal.bayName}
                    branchId={selectedBranch}
                    date={selectedDate}
                    startTime={bookingModal.startTime}
                    userRole={session?.user?.role}
                />
            )}

            {/* Action Confirm/Prompt/Error Modal */}
            <ActionConfirmModal state={actionModal} onStateChange={setActionModal} />
        </>
    );
}

// --- Bay Row Component ---
function BayRow({
    bay,
    timeSlots,
    openMin,
    closeMin,
    onBookingClick,
    onSlotClick,
    onBookingDragStart,
    onTimelineDrop,
    onToggleBayClose,
    isClosed = false,
}: {
    bay: BayData;
    timeSlots: string[];
    openMin: number;
    closeMin: number;
    onBookingClick: (b: BayBooking) => void;
    onSlotClick: (startTime: string) => void;
    onBookingDragStart: (e: React.DragEvent, b: BayBooking) => void;
    onTimelineDrop: (e: React.DragEvent, targetBayId: number, targetBayName: string) => void;
    onToggleBayClose?: (bayId: number, bayName: string, isBlocked: boolean, blockBookingId?: number) => void;
    isClosed?: boolean;
}) {
    const totalMinutes = closeMin - openMin;
    const blockBooking = bay.Bookings.find(b => b.CustomerName === '[ปิดช่องซ่อมชั่วคราว]' && b.CarRegister === 'BLOCK');
    const isBlocked = !!blockBooking;

    // Compute lanes for overlapping bookings (greedy algorithm)
    const laneMap = new Map<number, number>();
    const sortedBookings = [...bay.Bookings].sort((a, b) => a.StartMinutes - b.StartMinutes);
    const laneEnds: number[] = [];
    for (const bk of sortedBookings) {
        let assignedLane = -1;
        for (let i = 0; i < laneEnds.length; i++) {
            if (bk.StartMinutes >= laneEnds[i]) {
                laneEnds[i] = bk.EndMinutes;
                assignedLane = i;
                break;
            }
        }
        if (assignedLane === -1) {
            laneEnds.push(bk.EndMinutes);
            assignedLane = laneEnds.length - 1;
        }
        laneMap.set(bk.BookingID, assignedLane);
    }
    const totalLanes = Math.max(1, laneEnds.length);
    const LANE_HEIGHT = 58; // px per lane
    const rowMinHeight = totalLanes * LANE_HEIGHT + 8; // 8px padding

    return (
        <div className="flex border-b border-gray-100 hover:bg-gray-50/50 transition-colors group">
            {/* Bay Label */}
            <div className="shrink-0 border-r border-gray-200 px-3 py-3 flex items-center"
                style={{ width: BAY_LABEL_WIDTH }}
            >
                <div>
                    <p className="font-semibold text-sm text-gray-900">{bay.BayName}</p>
                    <p className="text-[10px] text-gray-400">
                        {bay.Bookings.length} จอง | ว่าง {Math.floor(bay.TotalAvailableMinutes / 60)}:{(bay.TotalAvailableMinutes % 60).toString().padStart(2, '0')} ชม.
                    </p>
                    {onToggleBayClose && (
                        <button
                            type="button"
                            onClick={() => onToggleBayClose(bay.BayID, bay.BayName, isBlocked, blockBooking?.BookingID)}
                            className={`text-[10px] font-bold mt-1.5 block hover:underline text-left transition-colors ${
                                isBlocked ? 'text-emerald-600 hover:text-emerald-700' : 'text-red-500 hover:text-red-600'
                            }`}
                        >
                            {isBlocked ? '🔓 เปิดช่องซ่อม' : '🔒 ปิดช่องซ่อมวันนี้'}
                        </button>
                    )}
                </div>
            </div>

            {/* Timeline */}
            <div 
                className="relative flex-1" 
                style={{ minHeight: rowMinHeight }}
                onDragOver={(e) => {
                    e.preventDefault();
                    e.dataTransfer.dropEffect = 'move';
                }}
                onDrop={(e) => onTimelineDrop(e, bay.BayID, bay.BayName)}
            >
                {/* Grid lines */}
                <div className="absolute inset-0 flex">
                    {timeSlots.map((_, i) => (
                        <div
                            key={i}
                            className={`shrink-0 border-r ${i % 2 === 0 ? 'border-gray-100' : 'border-gray-50'}`}
                            style={{ width: SLOT_WIDTH }}
                        />
                    ))}
                </div>

                {/* Clickable empty slots */}
                {!isClosed && bay.AvailableSlots.map((slot) => {
                    const startOff = timeToMinutes(slot.StartTime) - openMin;
                    const slotWidth = slot.DurationMinutes;
                    const left = (startOff / totalMinutes) * (timeSlots.length * SLOT_WIDTH);
                    const width = (slotWidth / totalMinutes) * (timeSlots.length * SLOT_WIDTH);

                    return (
                        <button
                            key={`${slot.StartTime}-${slot.EndTime}`}
                            className="absolute top-1 bottom-1 border border-dashed border-gray-200 rounded hover:border-blue-400 hover:bg-blue-50/50 transition-all cursor-pointer group/slot flex items-center justify-center"
                            style={{ left, width: Math.max(width, 30) }}
                            onClick={() => onSlotClick(slot.StartTime)}
                            title={`ว่าง ${slot.StartTime}-${slot.EndTime} (${slot.DurationMinutes} นาที) — คลิกเพื่อจอง`}
                        >
                            <Plus className="w-3.5 h-3.5 text-gray-300 group-hover/slot:text-blue-500 transition-colors" />
                        </button>
                    );
                })}

                {/* Booking blocks */}
                {bay.Bookings.map((booking) => {
                    const startOff = booking.StartMinutes - openMin;
                    const duration = booking.EndMinutes - booking.StartMinutes;
                    const left = (startOff / totalMinutes) * (timeSlots.length * SLOT_WIDTH);
                    const width = (duration / totalMinutes) * (timeSlots.length * SLOT_WIDTH);
                    
                    const isMasked = !!booking.isMasked || booking.CustomerName === 'จองแล้ว (คิวอื่น)';
                    const isSystemBlock = booking.CustomerName === '[ปิดช่องซ่อมชั่วคราว]';
                    const config = isMasked
                        ? { label: 'จองแล้ว', color: 'text-gray-500', bgColor: 'bg-gray-100/90', borderColor: 'border-gray-300' }
                        : isSystemBlock
                        ? { label: 'งดให้บริการ', color: 'text-red-700', bgColor: 'bg-red-50/70', borderColor: 'border-red-200' }
                        : (STATUS_CONFIG[booking.Status] || STATUS_CONFIG[0]);
                    const canDrag = !isMasked && !isSystemBlock && (booking.Status === 0 || booking.Status === 1);

                    const lane = laneMap.get(booking.BookingID) || 0;
                    const laneTop = 4 + lane * LANE_HEIGHT;
                    const laneHeight = LANE_HEIGHT - 6;

                    return (
                        <button
                            key={booking.BookingID}
                            draggable={canDrag}
                            onDragStart={(e) => onBookingDragStart(e, booking)}
                            className={`absolute ${config.bgColor} border ${config.borderColor} rounded-md px-2 flex items-center gap-1 overflow-hidden cursor-pointer hover:shadow-md transition-shadow text-left select-none ${canDrag ? 'active:cursor-grabbing' : isMasked ? 'cursor-not-allowed opacity-75' : 'cursor-default'}`}
                            style={{ left, width: Math.max(width, 40), top: laneTop, height: laneHeight }}
                            onClick={() => onBookingClick(booking)}
                            title={isMasked ? `จองแล้ว (คิวอื่น) ${booking.StartTime}-${booking.EndTime}` : isSystemBlock ? `ช่องซ่อมนี้ปิดบริการชั่วคราว: ${booking.CarModel}` : `${booking.BookingNo} | ${booking.CustomerName} | ${booking.StartTime}-${booking.EndTime}${canDrag ? ' (ลากขยับเพื่อเลื่อนคิว)' : ''}`}
                        >
                            <div className="min-w-0 flex-1">
                                <p className={`text-[11px] font-bold ${config.color} truncate`}>
                                    {isMasked ? '🔒 จองแล้ว (คิวอื่น)' : isSystemBlock ? '🚫 งดให้บริการชั่วคราว' : (booking.ServiceType?.Name || booking.CarModel)}
                                </p>
                                <p className="text-[10px] text-gray-500 truncate">
                                    {isMasked ? `${booking.StartTime} - ${booking.EndTime} น.` : isSystemBlock ? booking.CarModel : `${booking.CustomerName} • ${booking.CarRegister}`}
                                </p>
                                {!isMasked && !isSystemBlock && (booking.Mileage || booking.ClaimDetail) && (
                                    <p className="text-[9px] text-gray-400 truncate">
                                        {booking.Mileage ? `${booking.Mileage.toLocaleString()} กม.` : ''}
                                        {booking.Mileage && booking.ClaimDetail ? ' • ' : ''}
                                        {booking.ClaimDetail || ''}
                                    </p>
                                )}
                            </div>
                        </button>
                    );
                })}
            </div>
        </div>
    );
}

export default function BayCalendarPage() {
    return (
        <Suspense fallback={<div className="p-8 text-center text-gray-500">กำลังโหลด...</div>}>
            <BayCalendarPageInner />
        </Suspense>
    );
}
