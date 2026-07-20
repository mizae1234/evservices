// Booking settings page
// Allows setting slot capacities, custom time slots, weekly working days, and special holidays per branch

'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
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
import { formatDate } from '@/lib/utils';
import { Branch } from '@/types';
import { ArrowLeft, Save, Plus, Trash2, Calendar } from 'lucide-react';

interface SlotSetting {
    StartTime: string;
    EndTime: string;
    MaxQueue: number;
}

interface WorkingDaySetting {
    DayOfWeek: number;
    IsOpen: boolean;
}

interface HolidaySetting {
    HolidayID: number;
    BranchID: number;
    HolidayDate: string;
    Description: string | null;
}

interface SlotOverrideSetting {
    OverrideID: number;
    BranchID: number;
    OverrideDate: string;
    StartTime: string;
    EndTime: string;
    IsOpen: boolean;
    MaxQueueOverride: number | null;
    Reason: string | null;
    CreateDate: string;
}

const DAYS_OF_WEEK_NAMES = ['อาทิตย์', 'จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์', 'เสาร์'];

export default function BookingSettingsPage() {
    const router = useRouter();
    const { data: session } = useSession();
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [branches, setBranches] = useState<Branch[]>([]);
    const [selectedBranch, setSelectedBranch] = useState('');
    const [slots, setSlots] = useState<SlotSetting[]>([]);
    const [workingDays, setWorkingDays] = useState<WorkingDaySetting[]>([]);
    const [holidays, setHolidays] = useState<HolidaySetting[]>([]);
    const [slotOverrides, setSlotOverrides] = useState<SlotOverrideSetting[]>([]);
    
    // Holiday Form State
    const [holidayInput, setHolidayInput] = useState({ date: '', description: '' });
    const [isAddingHoliday, setIsAddingHoliday] = useState(false);

    const [error, setError] = useState<string | null>(null);
    const [successMessage, setSuccessMessage] = useState<string | null>(null);

    const isAdmin = session?.user?.role === 'ADMIN';

    useEffect(() => {
        if (session?.user) {
            if (session.user.role === 'CS') {
                router.push('/service-center/bookings');
                return;
            }
            fetchInitialData();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [session]);

    const fetchInitialData = async () => {
        setIsLoading(true);
        try {
            if (isAdmin) {
                // Fetch branches list for ADMIN
                const res = await fetch('/api/branches');
                const data = await res.json();
                if (data.success) {
                    setBranches(data.data);
                    // Default to first branch
                    if (data.data.length > 0) {
                        setSelectedBranch(data.data[0].BranchID.toString());
                        fetchBranchSettings(data.data[0].BranchID.toString());
                        return;
                    }
                }
            } else if (session?.user?.branchId) {
                // For SERVICE_CENTER, set default branch and fetch settings
                const branchId = session.user.branchId.toString();
                setSelectedBranch(branchId);
                fetchBranchSettings(branchId);
                return;
            }
            setIsLoading(false);
        } catch (err) {
            console.error('Error fetching branches:', err);
            setIsLoading(false);
        }
    };

    const fetchBranchSettings = async (branchId: string) => {
        try {
            // Load slots and working days
            const res = await fetch(`/api/bookings/settings?branchId=${branchId}`);
            const data = await res.json();
            if (data.success) {
                setSlots(data.data.slots || []);
                setWorkingDays(data.data.workingDays || []);
            } else {
                setError(data.error || 'โหลดข้อมูลล้มเหลว');
            }

            // Load holidays
            await fetchHolidays(branchId);

            // Load slot overrides
            await fetchSlotOverrides(branchId);

        } catch (err) {
            console.error('Error loading settings:', err);
            setError('โหลดข้อมูลล้มเหลว');
        } finally {
            setIsLoading(false);
        }
    };

    const fetchHolidays = async (branchId: string) => {
        try {
            const res = await fetch(`/api/bookings/holidays?branchId=${branchId}`);
            const data = await res.json();
            if (data.success) {
                setHolidays(data.data || []);
            }
        } catch (err) {
            console.error('Error loading holidays:', err);
        }
    };

    const fetchSlotOverrides = async (branchId: string) => {
        try {
            const res = await fetch(`/api/bookings/slot-overrides?branchId=${branchId}`);
            const data = await res.json();
            if (data.success) {
                setSlotOverrides(data.data || []);
            }
        } catch (err) {
            console.error('Error loading slot overrides:', err);
        }
    };

    const handleRemoveSlotOverride = async (overrideId: number) => {
        if (!confirm('ต้องการลบการปรับชั่วคราวนี้ใช่หรือไม่? สล็อตจะกลับไปใช้ค่า default')) return;

        setError(null);
        setSuccessMessage(null);

        try {
            const res = await fetch(`/api/bookings/slot-overrides?overrideId=${overrideId}`, {
                method: 'DELETE',
            });
            const data = await res.json();
            if (data.success) {
                fetchSlotOverrides(selectedBranch);
                setSuccessMessage('ลบการปรับชั่วคราวเรียบร้อยแล้ว สล็อตกลับไปใช้ค่า default');
            } else {
                setError(data.error || 'ลบล้มเหลว');
            }
        } catch (err) {
            console.error('Error removing slot override:', err);
            setError('เกิดข้อผิดพลาดในการทำรายการ');
        }
    };

    const handleBranchChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const val = e.target.value;
        setSelectedBranch(val);
        setIsLoading(true);
        fetchBranchSettings(val);
    };

    const handleSlotTimeChange = (index: number, field: 'StartTime' | 'EndTime', val: string) => {
        const newSlots = [...slots];
        newSlots[index][field] = val;
        setSlots(newSlots);
    };

    const handleCapacityChange = (index: number, val: string) => {
        const newSlots = [...slots];
        newSlots[index].MaxQueue = Math.max(0, parseInt(val) || 0);
        setSlots(newSlots);
    };

    const handleAddSlot = () => {
        setSlots(prev => [...prev, { StartTime: '08:30', EndTime: '10:30', MaxQueue: 2 }]);
    };

    const handleRemoveSlot = (index: number) => {
        setSlots(prev => prev.filter((_, i) => i !== index));
    };

    const handleWorkingDayToggle = (dayOfWeek: number) => {
        setWorkingDays(prev => prev.map(wd => 
            wd.DayOfWeek === dayOfWeek ? { ...wd, IsOpen: !wd.IsOpen } : wd
        ));
    };

    const handleAddHoliday = async () => {
        if (!holidayInput.date) {
            setError('กรุณาเลือกวันที่ต้องการระบุเป็นวันหยุดพิเศษ');
            return;
        }

        setIsAddingHoliday(true);
        setError(null);
        setSuccessMessage(null);

        try {
            const res = await fetch('/api/bookings/holidays', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    branchId: selectedBranch,
                    date: holidayInput.date,
                    description: holidayInput.description,
                }),
            });
            const data = await res.json();
            if (data.success) {
                setHolidayInput({ date: '', description: '' });
                fetchHolidays(selectedBranch);
                setSuccessMessage('เพิ่มวันหยุดพิเศษ/วันปิดทำการชั่วคราวเรียบร้อยแล้ว');
            } else {
                setError(data.error || 'ไม่สามารถเพิ่มวันหยุดพิเศษได้');
            }
        } catch (err) {
            console.error('Error adding holiday:', err);
            setError('เกิดข้อผิดพลาดในการทำรายการ');
        } finally {
            setIsAddingHoliday(false);
        }
    };

    const handleRemoveHoliday = async (holidayId: number) => {
        if (!confirm('ต้องการลบวันปิดทำการชั่วคราวนี้ใช่หรือไม่? ระบบจะกลับมารับคิวตามปกติ')) return;
        
        setError(null);
        setSuccessMessage(null);

        try {
            const res = await fetch(`/api/bookings/holidays?holidayId=${holidayId}`, {
                method: 'DELETE',
            });
            const data = await res.json();
            if (data.success) {
                fetchHolidays(selectedBranch);
                setSuccessMessage('ลบวันปิดทำการชั่วคราวเรียบร้อยแล้ว');
            } else {
                setError(data.error || 'ลบล้มเหลว');
            }
        } catch (err) {
            console.error('Error removing holiday:', err);
            setError('เกิดข้อผิดพลาดในการทำรายการ');
        }
    };

    const handleSaveGeneralSettings = async () => {
        // Validation: slots
        for (const slot of slots) {
            if (!slot.StartTime || !slot.EndTime) {
                setError('กรุณากรอกเวลาเริ่มต้นและเวลาสิ้นสุดให้ครบถ้วนในทุกสล็อต');
                return;
            }
            if (slot.StartTime >= slot.EndTime) {
                setError(`ช่วงเวลาไม่ถูกต้อง: เวลาเริ่มต้น ${slot.StartTime} ต้องก่อนเวลาสิ้นสุด ${slot.EndTime}`);
                return;
            }
        }

        setIsSaving(true);
        setError(null);
        setSuccessMessage(null);

        try {
            const res = await fetch('/api/bookings/settings', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    branchId: selectedBranch,
                    configs: slots,
                    workingDays: workingDays,
                }),
            });

            const data = await res.json();
            if (data.success) {
                setSuccessMessage('บันทึกวันทำการปกติประจำสัปดาห์และรอบสล็อตบริการเรียบร้อยแล้ว');
            } else {
                setError(data.error || 'เกิดข้อผิดพลาดในการบันทึก');
            }
        } catch (err) {
            console.error('Error saving settings:', err);
            setError('เกิดข้อผิดพลาดในการบันทึก');
        } finally {
            setIsSaving(false);
        }
    };

    if (isLoading) return <LoadingPage />;

    const branchOptions = branches.map((b) => ({
        value: b.BranchID.toString(),
        label: b.BranchName,
    }));

    return (
        <>
            <Header title="ตั้งค่ารอบสล็อตเวลาและวันหยุดสาขา" subtitle="กำหนดวันเปิดทำการ รอบการจองคิว และวันหยุดพิเศษรายสาขา" />

            <div className="mt-6 space-y-6 max-w-4xl">
                <Button
                    variant="ghost"
                    onClick={() => router.push('/service-center/bookings')}
                    className="mb-4"
                >
                    <ArrowLeft className="w-4 h-4 mr-2" />
                    กลับไปหน้ารายการคิว
                </Button>

                {error && (
                    <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
                        {error}
                    </div>
                )}

                {successMessage && (
                    <div className="p-4 bg-green-50 border border-green-200 rounded-lg text-green-700">
                        {successMessage}
                    </div>
                )}

                {isAdmin && (
                    <Card className="max-w-md">
                        <CardContent className="p-4">
                            <Select
                                label="เลือกสาขาที่ต้องการตั้งค่า"
                                value={selectedBranch}
                                onChange={handleBranchChange}
                                options={branchOptions}
                            />
                        </CardContent>
                    </Card>
                )}

                {/* Section 1: Weekly Working Days & Slot Capacities */}
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between pb-2">
                        <CardTitle>1. วันเปิดทำการปกติประจำสัปดาห์ และ สล็อตบริการ</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-6 pt-4">
                        {/* Weekly Checkboxes */}
                        <div className="space-y-3">
                            <h4 className="text-sm font-semibold text-gray-700">วันทำการของสาขา</h4>
                            <div className="flex flex-wrap gap-2.5">
                                {workingDays.map((wd) => (
                                    <label
                                        key={wd.DayOfWeek}
                                        className={`flex items-center gap-2 cursor-pointer px-4 py-2 rounded-lg border text-sm font-medium transition-all ${
                                            wd.IsOpen
                                                ? 'bg-blue-50/50 border-blue-200 text-blue-800'
                                                : 'bg-gray-50 border-gray-200 text-gray-400'
                                        }`}
                                    >
                                        <input
                                            type="checkbox"
                                            checked={wd.IsOpen}
                                            onChange={() => handleWorkingDayToggle(wd.DayOfWeek)}
                                            className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 h-4 w-4"
                                        />
                                        {DAYS_OF_WEEK_NAMES[wd.DayOfWeek]}
                                    </label>
                                ))}
                            </div>
                        </div>

                        {/* Slots */}
                        <div className="pt-4 border-t border-gray-100">
                            <div className="flex items-center justify-between mb-4">
                                <h4 className="text-sm font-semibold text-gray-700">รอบเวลาให้บริการและจำนวนโควตาจองคิว</h4>
                                <Button size="sm" variant="outline" onClick={handleAddSlot} className="flex items-center gap-1 text-xs">
                                    <Plus className="w-3.5 h-3.5" />
                                    เพิ่มช่วงเวลา
                                </Button>
                            </div>
                            
                            {slots.length === 0 ? (
                                <div className="text-center p-8 bg-gray-50 border border-gray-100 rounded-lg text-gray-400 text-sm">
                                    ไม่มีการตั้งค่าช่วงเวลา (กดปุ่ม &quot;เพิ่มช่วงเวลา&quot; เพื่อกำหนดเวลาและโควตาคิว)
                                </div>
                            ) : (
                                <div className="space-y-3">
                                    {slots.map((slot, index) => (
                                        <div key={index} className="flex flex-col sm:flex-row sm:items-center gap-3 p-3 bg-gray-50 rounded-lg border border-gray-100">
                                            <div className="flex-1 flex items-center gap-2">
                                                <span className="text-xs text-gray-500 font-semibold min-w-10">⏰ เริ่ม</span>
                                                <Input
                                                    type="time"
                                                    value={slot.StartTime}
                                                    onChange={(e) => handleSlotTimeChange(index, 'StartTime', e.target.value)}
                                                    className="w-full sm:w-32 bg-white"
                                                    required
                                                />
                                                <span className="text-xs text-gray-500 font-semibold">ถึง</span>
                                                <Input
                                                    type="time"
                                                    value={slot.EndTime}
                                                    onChange={(e) => handleSlotTimeChange(index, 'EndTime', e.target.value)}
                                                    className="w-full sm:w-32 bg-white"
                                                    required
                                                />
                                            </div>

                                            <div className="flex items-center gap-3 justify-end">
                                                <span className="text-xs text-gray-500 font-semibold">โควตา</span>
                                                <div className="w-24">
                                                    <Input
                                                        type="number"
                                                        value={slot.MaxQueue.toString()}
                                                        onChange={(e) => handleCapacityChange(index, e.target.value)}
                                                        placeholder="โควตา"
                                                        required
                                                        min="0"
                                                        className="bg-white text-right"
                                                    />
                                                </div>
                                                <span className="text-xs text-gray-500 font-semibold">คิว</span>

                                                <Button
                                                    variant="ghost"
                                                    onClick={() => handleRemoveSlot(index)}
                                                    className="text-red-500 hover:bg-red-50 hover:text-red-700 p-2 h-9 w-9"
                                                    title="ลบช่วงเวลานี้"
                                                >
                                                    <Trash2 className="w-4 h-4" />
                                                </Button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        <div className="flex justify-end pt-4 border-t border-gray-100">
                            <Button onClick={handleSaveGeneralSettings} isLoading={isSaving}>
                                <Save className="w-4 h-4 mr-2" />
                                บันทึกค่าระบบพื้นฐาน
                            </Button>
                        </div>
                    </CardContent>
                </Card>

                {/* Section 2: Slot Overrides */}
                <Card>
                    <CardHeader>
                        <CardTitle>2. รายการปรับโควตาสล็อตชั่วคราว (รายวัน)</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4 pt-4">
                        <p className="text-xs text-gray-500">แสดงรายการปรับโควตา/เปิดปิดสล็อตชั่วคราวทั้งหมด (สามารถเพิ่มจากหน้าจัดการคิวโดยกดไอคอน ✏️ ที่สล็อตบนตารางเวลาว่างประจำวัน)</p>
                        <div className="overflow-x-auto border border-gray-100 rounded-lg">
                            <table className="w-full text-left border-collapse">
                                <thead>
                                    <tr className="bg-gray-50 border-b border-gray-100 text-xs font-semibold text-gray-500 uppercase">
                                        <th className="px-4 py-3">วันที่</th>
                                        <th className="px-4 py-3">สล็อตเวลา</th>
                                        <th className="px-4 py-3">สถานะ</th>
                                        <th className="px-4 py-3">โควตาปรับ</th>
                                        <th className="px-4 py-3">เหตุผล</th>
                                        <th className="px-4 py-3 text-center">จัดการ</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100 text-sm text-gray-600">
                                    {slotOverrides.length === 0 ? (
                                        <tr>
                                            <td colSpan={6} className="px-4 py-6 text-center text-gray-400 text-xs">
                                                ยังไม่มีการปรับโควตาชั่วคราว
                                            </td>
                                        </tr>
                                    ) : (
                                        slotOverrides.map((o) => (
                                            <tr key={o.OverrideID} className="hover:bg-gray-50/50">
                                                <td className="px-4 py-3 font-semibold text-gray-700 flex items-center gap-1.5">
                                                    <Calendar className="w-3.5 h-3.5 text-gray-400" />
                                                    {formatDate(o.OverrideDate)}
                                                </td>
                                                <td className="px-4 py-3 font-medium">
                                                    {o.StartTime} - {o.EndTime} น.
                                                </td>
                                                <td className="px-4 py-3">
                                                    {o.IsOpen ? (
                                                        <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-orange-100 text-orange-700">🟠 ปรับโควตา</span>
                                                    ) : (
                                                        <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-red-100 text-red-700">🔴 ปิดชั่วคราว</span>
                                                    )}
                                                </td>
                                                <td className="px-4 py-3">
                                                    {o.IsOpen && o.MaxQueueOverride !== null ? (
                                                        <span className="font-bold text-orange-600">{o.MaxQueueOverride} คิว</span>
                                                    ) : o.IsOpen ? (
                                                        <span className="text-gray-400">ค่า default</span>
                                                    ) : (
                                                        <span className="text-red-400">-</span>
                                                    )}
                                                </td>
                                                <td className="px-4 py-3 text-xs">{o.Reason || '-'}</td>
                                                <td className="px-4 py-3 text-center">
                                                    <Button
                                                        variant="ghost"
                                                        size="sm"
                                                        onClick={() => handleRemoveSlotOverride(o.OverrideID)}
                                                        className="text-red-500 hover:bg-red-50 hover:text-red-700 p-1.5 h-8 w-8"
                                                        title="ลบการปรับชั่วคราว"
                                                    >
                                                        <Trash2 className="w-4 h-4" />
                                                    </Button>
                                                </td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </CardContent>
                </Card>

                {/* Section 3: Special Holidays / Closures */}
                <Card>
                    <CardHeader>
                        <CardTitle>3. วันหยุดพิเศษ หรือ วันปิดทำการชั่วคราว (รายวัน)</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-6 pt-4">
                        {/* Add Holiday Form */}
                        <div className="bg-gray-50 p-4 rounded-lg border border-gray-100 space-y-4">
                            <h4 className="text-sm font-semibold text-gray-700">เพิ่มวันปิดทำการใหม่</h4>
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
                                <Input
                                    label="วันที่ต้องการหยุด"
                                    type="date"
                                    value={holidayInput.date}
                                    onChange={(e) => setHolidayInput(prev => ({ ...prev, date: e.target.value }))}
                                />
                                <Input
                                    label="คำอธิบาย / เหตุผล"
                                    placeholder="เช่น วันหยุดปีใหม่ / ปิดปรับปรุงระบบน้ำไฟ"
                                    value={holidayInput.description}
                                    onChange={(e) => setHolidayInput(prev => ({ ...prev, description: e.target.value }))}
                                />
                                <Button onClick={handleAddHoliday} isLoading={isAddingHoliday} className="w-full">
                                    <Plus className="w-4 h-4 mr-2" />
                                    เพิ่มวันหยุดพิเศษ
                                </Button>
                            </div>
                        </div>

                        {/* Holidays list */}
                        <div className="pt-2">
                            <h4 className="text-sm font-semibold text-gray-700 mb-3">รายการวันหยุดของสาขาที่บันทึกไว้ (แสดงเฉพาะอนาคตและย้อนหลังไม่เกิน 30 วัน)</h4>
                            <div className="overflow-x-auto border border-gray-100 rounded-lg">
                                <table className="w-full text-left border-collapse">
                                    <thead>
                                        <tr className="bg-gray-50 border-b border-gray-100 text-xs font-semibold text-gray-500 uppercase">
                                            <th className="px-4 py-3">วันที่หยุด</th>
                                            <th className="px-4 py-3">เหตุผลการปิดทำการ</th>
                                            <th className="px-4 py-3 text-center">จัดการ</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-100 text-sm text-gray-600">
                                        {holidays.length === 0 ? (
                                            <tr>
                                                <td colSpan={3} className="px-4 py-6 text-center text-gray-400 text-xs">
                                                    ยังไม่มีการตั้งค่าวันหยุดพิเศษประจำสาขา
                                                </td>
                                            </tr>
                                        ) : (
                                            holidays.map((h) => (
                                                <tr key={h.HolidayID} className="hover:bg-gray-50/50">
                                                    <td className="px-4 py-3 font-semibold text-gray-700 flex items-center gap-1.5">
                                                        <Calendar className="w-3.5 h-3.5 text-gray-400" />
                                                        {formatDate(h.HolidayDate)}
                                                    </td>
                                                    <td className="px-4 py-3">{h.Description || '-'}</td>
                                                    <td className="px-4 py-3 text-center">
                                                        <Button
                                                            variant="ghost"
                                                            size="sm"
                                                            onClick={() => handleRemoveHoliday(h.HolidayID)}
                                                            className="text-red-500 hover:bg-red-50 hover:text-red-700 p-1.5 h-8 w-8"
                                                            title="ลบวันหยุด"
                                                        >
                                                            <Trash2 className="w-4 h-4" />
                                                        </Button>
                                                    </td>
                                                </tr>
                                            ))
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            </div>
        </>
    );
}
