'use client';

import { useEffect, useState } from 'react';
import { Card, Button } from '@/components/ui';
import { Calendar } from 'lucide-react';

interface CalendarDayStats {
    isClosed: boolean;
    reason: string;
    maxQueue: number;
    bookedCount: number;
    hasOverride?: boolean;
}

interface MonthlyCalendarProps {
    branchId: string;
    branchName: string;
    searchQuery: string;
    selectedDate: string;
    onSelectDate: (date: string) => void;
    onNewBooking: (date: string) => void;
    /** Called after calendar data is fetched — parent may need to know */
    refreshKey?: number;
}

const MONTH_NAMES_THAI = [
    'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
    'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'
];

export function MonthlyCalendar({
    branchId, branchName, searchQuery, selectedDate, onSelectDate, onNewBooking, refreshKey,
}: MonthlyCalendarProps) {
    const [year, setYear] = useState(new Date().getFullYear());
    const [month, setMonth] = useState(new Date().getMonth() + 1);
    const [data, setData] = useState<Record<string, CalendarDayStats>>({});
    const [isLoading, setIsLoading] = useState(false);

    const fetchCalendarData = async () => {
        setIsLoading(true);
        try {
            const res = await fetch(`/api/bookings/calendar?branchId=${branchId}&year=${year}&month=${month}&search=${encodeURIComponent(searchQuery)}`);
            const json = await res.json();
            if (json.success) {
                setData(json.data);
            } else {
                setData({});
            }
        } catch (err) {
            console.error('Error fetching calendar data:', err);
            setData({});
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchCalendarData();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [branchId, year, month, searchQuery, refreshKey]);

    const handlePrevMonth = () => {
        if (month === 1) {
            setMonth(12);
            setYear(prev => prev - 1);
        } else {
            setMonth(prev => prev - 1);
        }
    };

    const handleNextMonth = () => {
        if (month === 12) {
            setMonth(1);
            setYear(prev => prev + 1);
        } else {
            setMonth(prev => prev + 1);
        }
    };

    const renderCells = () => {
        const daysInMonth = new Date(year, month, 0).getDate();
        const firstDayIndex = new Date(year, month - 1, 1).getDay(); // 0 = Sun, 6 = Sat
        
        const cells = [];
        
        // Blank cells before the first day of the month
        for (let i = 0; i < firstDayIndex; i++) {
            cells.push(<div key={`empty-${i}`} className="bg-gray-50/50 border border-gray-100 rounded-xl h-24" />);
        }
        
        const todayStr = new Date().toISOString().split('T')[0];

        // Days in the month
        for (let day = 1; day <= daysInMonth; day++) {
            const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
            const stats = data[dateStr] || { isClosed: false, reason: '', maxQueue: 0, bookedCount: 0 };
            
            const isSelected = selectedDate === dateStr;
            const isToday = todayStr === dateStr;
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
                            onSelectDate(dateStr);
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
                                        e.stopPropagation();
                                        onNewBooking(dateStr);
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

    return (
        <Card className="bg-white border border-gray-100 shadow-sm rounded-xl p-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6 pb-4 border-b border-gray-100">
                <div>
                    <h3 className="text-sm font-semibold text-gray-800 flex items-center gap-1.5">
                        <Calendar className="w-4 h-4 text-blue-600 animate-pulse" />
                        ปฏิทินความจุคิวบริการรายเดือน: <span className="text-blue-600 font-bold">{branchName || 'ทุกสาขา'}</span>
                    </h3>
                    <p className="text-xs text-gray-400 mt-0.5">
                        ประจำเดือน {MONTH_NAMES_THAI[month - 1]} {year + 543} (คลิกเลือกวันที่บนปฏิทิน เพื่อตรวจสอบและจองคิวว่างด้านล่าง)
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <Button size="sm" variant="outline" onClick={handlePrevMonth}>
                        &larr; เดือนก่อนหน้า
                    </Button>
                    <div className="text-xs font-bold text-gray-700 px-3 py-1 bg-gray-50 border border-gray-100 rounded-lg">
                        {MONTH_NAMES_THAI[month - 1]} {year + 543}
                    </div>
                    <Button size="sm" variant="outline" onClick={handleNextMonth}>
                        เดือนถัดไป &rarr;
                    </Button>
                </div>
            </div>

            {isLoading ? (
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
                        {renderCells()}
                    </div>
                </div>
            )}
        </Card>
    );
}
