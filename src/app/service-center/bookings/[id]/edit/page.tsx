'use client';

import React, { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { Card, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { ArrowLeft, Car } from 'lucide-react';

interface VehicleData {
    InventoryItemID: number;
    VinNo: string;
    RegisterNo: string;
    ProjectType: string;
    Model: string;
    CustomerName: string;
}

export default function EditBookingPage() {
    const { data: session } = useSession();
    const router = useRouter();
    const { id } = useParams();

    const [formData, setFormData] = useState({
        BookingNo: '',
        CustomerName: '',
        CustomerPhone: '',
        CarRegister: '',
        CarModel: '',
        VinNo: '',
        LastMileage: 0,
        ClaimDetail: '',
        // Read only fields
        BranchName: '',
        BookingDate: '',
        StartTime: '',
        EndTime: '',
        ProjectType: '',
        Mileage: 0,
    });

    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Vehicle lookup suggestions
    const [vehicleSuggestions, setVehicleSuggestions] = useState<VehicleData[]>([]);
    const [isSearchingVehicles, setIsSearchingVehicles] = useState(false);
    const [showSuggestions, setShowSuggestions] = useState(false);
    const [activeBookingWarning, setActiveBookingWarning] = useState<any | null>(null);

    // Fetch existing booking
    useEffect(() => {
        const fetchBooking = async () => {
            try {
                const res = await fetch(`/api/bookings/${id}`);
                const data = await res.json();
                if (data.success) {
                    const b = data.data;
                    setFormData({
                        BookingNo: b.BookingNo,
                        CustomerName: b.CustomerName,
                        CustomerPhone: b.CustomerPhone || '',
                        CarRegister: b.CarRegister,
                        CarModel: b.CarModel || '',
                        VinNo: b.VinNo || '',
                        LastMileage: b.LastMileage,
                        ClaimDetail: b.ClaimDetail || '',
                        BranchName: b.Branch?.BranchName || 'ไม่ระบุ',
                        BookingDate: b.BookingDate,
                        StartTime: b.StartTime,
                        EndTime: b.EndTime,
                        ProjectType: b.ProjectType || '',
                        Mileage: b.Mileage,
                    });
                } else {
                    setError(data.error || 'Failed to fetch booking details');
                }
            } catch (err) {
                console.error('Error fetching booking:', err);
                setError('Failed to load booking data');
            } finally {
                setIsLoading(false);
            }
        };

        if (id) {
            fetchBooking();
        }
    }, [id]);

    const checkActiveBooking = async (registerNo: string) => {
        if (!registerNo || registerNo.trim().length < 2) {
            setActiveBookingWarning(null);
            return;
        }
        try {
            const res = await fetch(`/api/bookings/check-active?registerNo=${encodeURIComponent(registerNo)}`);
            const data = await res.json();
            if (data.success && data.hasActiveBooking && data.booking.BookingNo !== formData.BookingNo) {
                setActiveBookingWarning(data.booking);
            } else {
                setActiveBookingWarning(null);
            }
        } catch (err) {
            console.error('Error checking active booking:', err);
            setActiveBookingWarning(null);
        }
    };

    // Auto-check active booking on CarRegister change
    useEffect(() => {
        const timer = setTimeout(() => {
            if (formData.CarRegister && formData.BookingNo) {
                checkActiveBooking(formData.CarRegister);
            } else {
                setActiveBookingWarning(null);
            }
        }, 500);
        return () => clearTimeout(timer);
    }, [formData.CarRegister, formData.BookingNo]);

    // Handle suggestions
    const searchVehicles = async (query: string) => {
        if (query.trim().length < 2) {
            setVehicleSuggestions([]);
            return;
        }
        setIsSearchingVehicles(true);
        try {
            const res = await fetch(`/api/vehicles/lookup?q=${encodeURIComponent(query)}`);
            const data = await res.json();
            if (data.success) {
                setVehicleSuggestions(data.data || []);
                setShowSuggestions(true);
            }
        } catch (e) {
            console.error('Error searching vehicles:', e);
        } finally {
            setIsSearchingVehicles(false);
        }
    };

    const handleCarRegisterChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const value = e.target.value;
        setFormData(prev => ({ ...prev, CarRegister: value }));
        searchVehicles(value);
    };

    const handleVehicleSelect = (vehicle: VehicleData) => {
        setFormData(prev => ({
            ...prev,
            CarRegister: vehicle.RegisterNo,
            CustomerName: vehicle.CustomerName,
            CarModel: vehicle.Model,
            VinNo: vehicle.VinNo,
        }));
        setShowSuggestions(false);
    };

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSaving(true);
        setError(null);

        try {
            const res = await fetch(`/api/bookings/${id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    CustomerName: formData.CustomerName,
                    CustomerPhone: formData.CustomerPhone || null,
                    CarRegister: formData.CarRegister,
                    CarModel: formData.CarModel,
                    VinNo: formData.VinNo,
                    LastMileage: formData.LastMileage,
                    ClaimDetail: formData.ClaimDetail,
                }),
            });

            const data = await res.json();
            if (data.success) {
                router.push('/service-center/bookings');
            } else {
                setError(data.error || 'Failed to update booking');
            }
        } catch (err) {
            console.error('Error saving booking:', err);
            setError('Internal Server Error');
        } finally {
            setIsSaving(false);
        }
    };

    if (isLoading) {
        return (
            <div className="p-6 text-center text-gray-500">
                <div className="animate-spin inline-block w-8 h-8 border-4 border-current border-t-transparent text-blue-600 rounded-full mb-2" />
                <div>กำลังโหลดข้อมูล...</div>
            </div>
        );
    }

    const formatDate = (dateStr: string) => {
        if (!dateStr) return '';
        const d = new Date(dateStr);
        return d.toLocaleDateString('th-TH', { day: 'numeric', month: 'long', year: 'numeric' });
    };

    return (
        <div className="p-6 max-w-4xl mx-auto space-y-6">
            {/* Header */}
            <div className="flex items-center gap-4">
                <Button
                    variant="ghost"
                    onClick={() => router.back()}
                    className="p-2"
                >
                    <ArrowLeft className="w-5 h-5 text-gray-600" />
                </Button>
                <div>
                    <h1 className="text-xl font-bold text-gray-900">แก้ไขรายละเอียดการจองคิว</h1>
                    <p className="text-xs text-gray-500 mt-0.5">เลขที่การจอง: {formData.BookingNo}</p>
                </div>
            </div>

            {error && (
                <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-sm text-red-800">
                    ❌ {error}
                </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-6">
                <Card className="border-gray-200 shadow-sm">
                    <CardContent className="p-6 space-y-6">
                        {/* Read Only Info Section */}
                        <div className="bg-gray-50 p-4 rounded-xl grid grid-cols-1 md:grid-cols-2 gap-4 border border-gray-100 text-sm">
                            <div>
                                <span className="text-xs text-gray-400 block font-semibold uppercase">สาขาที่นัดหมาย</span>
                                <span className="font-semibold text-gray-800">{formData.BranchName}</span>
                            </div>
                            <div>
                                <span className="text-xs text-gray-400 block font-semibold uppercase">ประเภทงาน</span>
                                <span className={`font-semibold ${
                                    formData.ProjectType === 'ซ่อมทั่วไป' || formData.Mileage === 0 ? 'text-amber-600' : 'text-blue-600'
                                }`}>
                                    {formData.ProjectType === 'ซ่อมทั่วไป' || formData.Mileage === 0
                                        ? '🔧 ซ่อมทั่วไป'
                                        : `📅 ตรวจเช็คระยะ (${formData.Mileage.toLocaleString()} กม.)`}
                                </span>
                            </div>
                            <div>
                                <span className="text-xs text-gray-400 block font-semibold uppercase">วันที่จอง</span>
                                <span className="font-semibold text-gray-800">{formatDate(formData.BookingDate)}</span>
                            </div>
                            <div>
                                <span className="text-xs text-gray-400 block font-semibold uppercase">เวลานัดหมาย</span>
                                <span className="font-semibold text-gray-800">{formData.StartTime} - {formData.EndTime} น.</span>
                            </div>
                        </div>

                        {/* Vehicle & Customer Section */}
                        <div className="space-y-4 pt-2">
                            <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider flex items-center gap-1">
                                <Car className="w-3.5 h-3.5" /> แก้ไขข้อมูลลูกค้าและรถยนต์
                            </h3>
                            
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                {/* Car Register with Suggestions */}
                                <div className="relative">
                                    <Input
                                        label="ทะเบียนรถยนต์ *"
                                        name="CarRegister"
                                        placeholder="เช่น กข-1234 กรุงเทพ"
                                        value={formData.CarRegister}
                                        onChange={handleCarRegisterChange}
                                        onFocus={() => {
                                            if (vehicleSuggestions.length > 0) setShowSuggestions(true);
                                        }}
                                        onBlur={() => {
                                            setTimeout(() => setShowSuggestions(false), 200);
                                        }}
                                        required
                                    />
                                    {isSearchingVehicles && (
                                        <div className="absolute right-3 top-9 text-xs text-gray-400 animate-spin">
                                            ⌛
                                        </div>
                                    )}
                                    {showSuggestions && vehicleSuggestions.length > 0 && (
                                        <div className="absolute z-10 left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                                            {vehicleSuggestions.map((v) => (
                                                <button
                                                    key={v.InventoryItemID}
                                                    type="button"
                                                    onMouseDown={() => handleVehicleSelect(v)}
                                                    className="w-full text-left px-4 py-2 text-sm hover:bg-blue-50 transition-colors border-b last:border-0 border-gray-50 flex flex-col"
                                                >
                                                    <span className="font-bold text-gray-800">{v.RegisterNo}</span>
                                                    <span className="text-[10px] text-gray-400">
                                                        รุ่น: {v.Model} | เจ้าของ: {v.CustomerName}
                                                    </span>
                                                </button>
                                            ))}
                                        </div>
                                    )}
                                </div>

                                {activeBookingWarning && (
                                    <div className="col-span-1 md:col-span-2 p-4 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-800 animate-fade-in">
                                        <div className="font-bold flex items-center gap-1.5 text-amber-900">
                                            <span>⚠️</span>
                                            <span>รถทะเบียนนี้มีการจองล่วงหน้าที่ยังไม่มาถึงในระบบแล้ว</span>
                                        </div>
                                        <div className="mt-1 text-xs text-amber-700 leading-relaxed">
                                            เลขที่การจอง: <strong className="text-amber-900">{activeBookingWarning.BookingNo}</strong> | 
                                            วันที่จอง: <strong className="text-amber-900">{formatDate(activeBookingWarning.BookingDate)}</strong> | 
                                            เวลา: <strong className="text-amber-900">{activeBookingWarning.StartTime} - {activeBookingWarning.EndTime} น.</strong> <br/>
                                            ลูกค้า: <strong className="text-amber-900">{activeBookingWarning.CustomerName}</strong> | 
                                            สาขาที่จอง: <strong className="text-amber-900">{activeBookingWarning.BranchName}</strong> | 
                                            สถานะ: <span className={`px-1.5 py-0.5 rounded font-bold text-[10px] ${activeBookingWarning.Status === 1 ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'}`}>{activeBookingWarning.Status === 1 ? 'อนุมัติแล้ว' : 'รอดำเนินการ'}</span>
                                        </div>
                                    </div>
                                )}

                                <Input
                                    label="ชื่อลูกค้า *"
                                    name="CustomerName"
                                    placeholder="กรอกชื่อ-นามสกุลลูกค้า"
                                    value={formData.CustomerName}
                                    onChange={handleChange}
                                    required
                                />

                                <Input
                                    label="เบอร์โทรลูกค้า *"
                                    name="CustomerPhone"
                                    placeholder="0xxxxxxxxx"
                                    value={formData.CustomerPhone}
                                    onChange={(e) => setFormData(prev => ({ ...prev, CustomerPhone: e.target.value.replace(/[^0-9]/g, '') }))}
                                    maxLength={10}
                                />

                                <Input
                                    label="รุ่นรถยนต์ (Car Model) *"
                                    name="CarModel"
                                    placeholder="เช่น AION Y Plus"
                                    value={formData.CarModel}
                                    onChange={handleChange}
                                    required
                                />

                                <Input
                                    label="เลขตัวถัง (Vin No)"
                                    name="VinNo"
                                    placeholder="กรอกเลขตัวถังรถยนต์"
                                    value={formData.VinNo}
                                    onChange={handleChange}
                                />

                                <Input
                                    label="เลขไมล์ล่าสุด (กิโลเมตร) *"
                                    name="LastMileage"
                                    type="number"
                                    placeholder="ระบุเลขไมล์ล่าสุด เช่น 10000"
                                    value={formData.LastMileage || ''}
                                    onChange={(e) => setFormData(prev => ({ ...prev, LastMileage: parseInt(e.target.value) || 0 }))}
                                    required
                                />
                            </div>
                        </div>

                        {/* Claim / Details Section */}
                        <div className="space-y-2 pt-2">
                            <label className="block text-sm font-semibold text-gray-700">
                                รายละเอียดอาการชำรุด
                            </label>
                            <textarea
                                name="ClaimDetail"
                                placeholder="ระบุอาการชำรุด หรือข้อมูลการเคลมเพิ่มเติม..."
                                value={formData.ClaimDetail}
                                onChange={handleChange}
                                className="w-full border border-gray-300 rounded-xl p-3 text-sm text-gray-900 placeholder-gray-400 min-h-24 focus:ring-blue-500 focus:border-blue-500"
                            />
                        </div>
                    </CardContent>
                </Card>

                {/* Form Actions */}
                <div className="flex justify-end gap-3">
                    <Button
                        type="button"
                        variant="outline"
                        onClick={() => router.back()}
                        disabled={isSaving}
                    >
                        ยกเลิก
                    </Button>
                    <Button
                        type="submit"
                        disabled={isSaving}
                        className="bg-blue-600 hover:bg-blue-700 text-white"
                    >
                        {isSaving ? 'กำลังบันทึก...' : 'บันทึกการแก้ไข'}
                    </Button>
                </div>
            </form>
        </div>
    );
}
