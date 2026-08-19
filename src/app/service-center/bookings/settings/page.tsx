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
import { isCSRole } from '@/lib/permissions';



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



const DAYS_OF_WEEK_NAMES = ['อาทิตย์', 'จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์', 'เสาร์'];

export default function BookingSettingsPage() {
    const router = useRouter();
    const { data: session } = useSession();
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [branches, setBranches] = useState<Branch[]>([]);
    const [selectedBranch, setSelectedBranch] = useState('');
    const [workingDays, setWorkingDays] = useState<WorkingDaySetting[]>([]);
    const [holidays, setHolidays] = useState<HolidaySetting[]>([]);
    const [operatingHours, setOperatingHours] = useState({ openTime: '08:30', closeTime: '17:30' });
    
    // Holiday Form State
    const [holidayInput, setHolidayInput] = useState({ date: '', description: '' });
    const [isAddingHoliday, setIsAddingHoliday] = useState(false);

    const [error, setError] = useState<string | null>(null);
    const [successMessage, setSuccessMessage] = useState<string | null>(null);

    const isAdmin = session?.user?.role === 'ADMIN';

    useEffect(() => {
        if (session?.user) {
            if (isCSRole(session.user.role)) {
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
                setWorkingDays(data.data.workingDays || []);
                if (data.data.operatingHours) {
                    setOperatingHours(data.data.operatingHours);
                }
            } else {
                setError(data.error || 'โหลดข้อมูลล้มเหลว');
            }

            // Load holidays
            await fetchHolidays(branchId);



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



    const handleBranchChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const val = e.target.value;
        setSelectedBranch(val);
        setIsLoading(true);
        fetchBranchSettings(val);
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


        setIsSaving(true);
        setError(null);
        setSuccessMessage(null);

        try {
            const res = await fetch('/api/bookings/settings', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    branchId: selectedBranch,
                    workingDays: workingDays,
                    operatingHours: operatingHours,
                }),
            });

            const data = await res.json();
            if (data.success) {
                setSuccessMessage('บันทึกวันทำการปกติประจำสัปดาห์เรียบร้อยแล้ว');
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
            <Header title="ตั้งค่าวันทำงานและวันหยุดสาขา" subtitle="กำหนดวันเปิดทำการและวันหยุดพิเศษรายสาขา" />

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
                        <CardTitle>1. วันเปิดทำการปกติประจำสัปดาห์</CardTitle>
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

                        {/* Operating Hours Setting */}
                        <div className="space-y-3 pt-4 border-t border-gray-100">
                            <h4 className="text-sm font-semibold text-gray-700">⏰ เวลาเปิด - ปิดทำการประจำสาขา (Operating Hours)</h4>
                            <div className="grid grid-cols-2 gap-4 max-w-md">
                                <div>
                                    <label className="block text-xs font-bold text-gray-600 mb-1">เวลาเปิดทำการ</label>
                                    <select
                                        value={operatingHours.openTime}
                                        onChange={(e) => setOperatingHours(prev => ({ ...prev, openTime: e.target.value }))}
                                        className="w-full border-2 border-gray-300 rounded-lg px-3 py-2 text-sm font-bold text-gray-900 bg-white"
                                    >
                                        <option value="07:30">07:30 น.</option>
                                        <option value="08:00">08:00 น.</option>
                                        <option value="08:30">08:30 น.</option>
                                        <option value="09:00">09:00 น.</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-gray-600 mb-1">เวลาปิดทำการ</label>
                                    <select
                                        value={operatingHours.closeTime}
                                        onChange={(e) => setOperatingHours(prev => ({ ...prev, closeTime: e.target.value }))}
                                        className="w-full border-2 border-gray-300 rounded-lg px-3 py-2 text-sm font-bold text-gray-900 bg-white"
                                    >
                                        <option value="16:30">16:30 น.</option>
                                        <option value="17:00">17:00 น.</option>
                                        <option value="17:30">17:30 น.</option>
                                        <option value="18:00">18:00 น.</option>
                                        <option value="18:30">18:30 น.</option>
                                    </select>
                                </div>
                            </div>
                        </div>

                        <div className="flex justify-end pt-4 border-t border-gray-100 mt-6">
                            <Button onClick={handleSaveGeneralSettings} isLoading={isSaving}>
                                <Save className="w-4 h-4 mr-2" />
                                บันทึกค่าระบบพื้นฐาน
                            </Button>
                        </div>
                    </CardContent>
                </Card>

                {/* Section 3: Special Holidays / Closures */}
                <Card>
                    <CardHeader>
                        <CardTitle>2. วันหยุดพิเศษ หรือ วันปิดทำการชั่วคราว (รายวัน)</CardTitle>
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
