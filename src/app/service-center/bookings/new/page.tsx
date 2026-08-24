'use client';

import React, { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { Card, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { ArrowLeft, Car, Milestone, Clock } from 'lucide-react';
import { isCSRole, getAllowedBookingType } from '@/lib/permissions';
import { getBangkokDateString } from '@/lib/utils';

interface BranchOption {
    BranchID: number;
    BranchName: string;
}

interface CarModelOption {
    ModelID: number;
    ModelName: string;
    Brand: string | null;
}

interface MileageOption {
    value: string;
    label: string;
}

interface VehicleData {
    InventoryItemID: number;
    VinNo: string;
    RegisterNo: string;
    ProjectType: string;
    Model: string;
    CustomerName: string;
    ModelCode?: string;
}

function NewBookingPageInner() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const { data: session } = useSession();

    // Query params pre-fills
    const paramBranchId = searchParams.get('branchId') || '';
    const paramDate = searchParams.get('date') || '';
    const paramStartTime = searchParams.get('startTime') || '';
    const paramEndTime = searchParams.get('endTime') || '';

    const isCS = isCSRole(session?.user?.role);
    const allowedType = getAllowedBookingType(session?.user);

    // Options lists
    const [branches, setBranches] = useState<BranchOption[]>([]);
    const [carModels, setCarModels] = useState<CarModelOption[]>([]);
    const [mileages, setMileages] = useState<MileageOption[]>([]);

    // Form state
    const [formData, setFormData] = useState({
        BookingDate: paramDate || getBangkokDateString(),
        BranchID: paramBranchId,
        StartTime: paramStartTime,
        EndTime: paramEndTime,
        CustomerName: '',
        CustomerPhone: '',
        CarRegister: '',
        CarModel: '',
        VinNo: '',
        ProjectType: '',
        InventoryItemID: null as number | null,
        LastMileage: 0,
        Mileage: 10000,
        MileageOption: '10000',
        CustomMileage: '',
        ClaimDetail: '',
    });

    const [isSaving, setIsSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [activeBookingWarning, setActiveBookingWarning] = useState<any | null>(null);

    // Available Time Slots selection inside booking page
    const [slots, setSlots] = useState<{ StartTime: string; EndTime: string; IsAvailable: boolean; BookedCount: number; MaxQueue: number }[]>([]);
    const [isLoadingSlots, setIsLoadingSlots] = useState(false);
    const [isBranchClosed, setIsBranchClosed] = useState(false);
    const [branchClosedReason, setBranchClosedReason] = useState('');
    const [isCheckMileage, setIsCheckMileage] = useState(true);
    const [bookingType, setBookingType] = useState<'EV7' | 'RETAIL' | 'LINEMAN'>((allowedType as any) || 'EV7');

    useEffect(() => {
        if (allowedType) {
            setBookingType(allowedType as any);
        }
    }, [allowedType]);

    // Vehicle lookup suggestions
    const [vehicleSuggestions, setVehicleSuggestions] = useState<VehicleData[]>([]);
    const [isSearchingVehicles, setIsSearchingVehicles] = useState(false);
    const [showSuggestions, setShowSuggestions] = useState(false);

    const isAdmin = session?.user?.role === 'ADMIN';
    const canSelectBranch = isAdmin || isCS;

    // Fetch dependencies
    useEffect(() => {
        const fetchDependencies = async () => {
            try {
                // Fetch branches
                const branchRes = await fetch('/api/branches');
                const branchData = await branchRes.json();
                if (branchData.success) {
                    setBranches(branchData.data || []);
                    // If no branch pre-filled, default to user's branch or first branch
                    if (!formData.BranchID) {
                        const userBranch = !canSelectBranch && session?.user?.branchId 
                            ? session.user.branchId.toString() 
                            : (branchData.data.length > 0 ? branchData.data[0].BranchID.toString() : '');
                        setFormData(prev => ({ ...prev, BranchID: userBranch }));
                    }
                }

                // Fetch car models
                const carRes = await fetch('/api/car-models');
                const carData = await carRes.json();
                if (carData.success) setCarModels(carData.data || []);

                // Fetch mileages
                const milRes = await fetch('/api/mileages');
                const milData = await milRes.json();
                if (milData.success) {
                    setMileages(milData.data || []);
                    if (milData.data && milData.data.length > 0) {
                        setFormData(prev => ({
                            ...prev,
                            MileageOption: milData.data[0].value,
                            Mileage: milData.data[0].value !== 'other' ? parseInt(milData.data[0].value) : 10000
                        }));
                    }
                }

            } catch (err) {
                console.error('Error fetching dependencies:', err);
            }
        };

        if (session?.user) {
            fetchDependencies();
        }
    }, [session, canSelectBranch]);

    const checkActiveBooking = async (registerNo: string) => {
        if (!registerNo || registerNo.trim().length < 2) {
            setActiveBookingWarning(null);
            return;
        }
        try {
            const res = await fetch(`/api/bookings/check-active?registerNo=${encodeURIComponent(registerNo)}`);
            const data = await res.json();
            if (data.success && data.hasActiveBooking) {
                setActiveBookingWarning(data.booking);
            } else {
                setActiveBookingWarning(null);
            }
        } catch (err) {
            console.error('Error checking active booking:', err);
            setActiveBookingWarning(null);
        }
    };

    useEffect(() => {
        const timer = setTimeout(() => {
            if (formData.CarRegister && bookingType === 'EV7') {
                checkActiveBooking(formData.CarRegister);
            } else {
                setActiveBookingWarning(null);
            }
        }, 500);
        return () => clearTimeout(timer);
    }, [formData.CarRegister, bookingType]);

    useEffect(() => {
        const fetchSlots = async () => {
            if (!formData.BranchID || !formData.BookingDate) {
                setSlots([]);
                return;
            }
            setIsLoadingSlots(true);
            setIsBranchClosed(false);
            setBranchClosedReason('');
            try {
                const res = await fetch(`/api/bookings/slots?branchId=${formData.BranchID}&date=${formData.BookingDate}`, { cache: 'no-store' });
                const data = await res.json();
                if (data.success) {
                    if (data.isClosed) {
                        setIsBranchClosed(true);
                        setBranchClosedReason(data.reason || 'สาขาปิดทำการ');
                        setSlots([]);
                    } else {
                        setSlots(data.data || []);
                    }
                }
            } catch (err) {
                console.error('Error fetching slots:', err);
                setSlots([]);
            } finally {
                setIsLoadingSlots(false);
            }
        };

        if (session?.user) {
            fetchSlots();
        }
    }, [session, formData.BranchID, formData.BookingDate]);

    // Search vehicles
    const searchVehicles = async (query: string) => {
        if (!query || query.length < 2) {
            setVehicleSuggestions([]);
            setShowSuggestions(false);
            return;
        }
        setIsSearchingVehicles(true);
        try {
            const res = await fetch(`/api/vehicles/lookup?q=${encodeURIComponent(query)}`);
            const data = await res.json();
            if (data.success && data.data.length > 0) {
                setVehicleSuggestions(data.data);
                setShowSuggestions(true);
            } else {
                setVehicleSuggestions([]);
                setShowSuggestions(false);
            }
        } catch (err) {
            console.error('Error searching vehicles:', err);
        } finally {
            setIsSearchingVehicles(false);
        }
    };

    const handleCarRegisterChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const val = e.target.value;
        setFormData(prev => ({ ...prev, CarRegister: val }));

        // Skip vehicle search for RETAIL
        if (bookingType === 'RETAIL') return;

        searchVehicles(val);
    };

    const handleVehicleSelect = (vehicle: VehicleData) => {
        // Find best match in carModels
        let matchedModel = '';
        const searchModel = vehicle.Model ? vehicle.Model.toLowerCase().replace(/\s+/g, '') : '';
        
        if (searchModel) {
            // 1. Try exact match first (after removing spaces)
            const exactMatch = carModels.find(m => {
                const fullName = (m.Brand ? `${m.Brand} ${m.ModelName}` : m.ModelName).toLowerCase().replace(/\s+/g, '');
                return fullName === searchModel;
            });
            
            if (exactMatch) {
                matchedModel = exactMatch.Brand ? `${exactMatch.Brand} ${exactMatch.ModelName}` : exactMatch.ModelName;
            } else {
                // 2. Try substring match (e.g. "aion y plus" matches "AION Y Plus 410 Premium")
                const partialMatch = carModels.find(m => {
                    const fullName = (m.Brand ? `${m.Brand} ${m.ModelName}` : m.ModelName).toLowerCase().replace(/\s+/g, '');
                    return fullName.includes(searchModel) || searchModel.includes(fullName);
                });
                
                if (partialMatch) {
                    matchedModel = partialMatch.Brand ? `${partialMatch.Brand} ${partialMatch.ModelName}` : partialMatch.ModelName;
                }
            }
        }
        
        // Fallback to vehicle.Model if no match found in DB
        if (!matchedModel && vehicle.Model) {
            matchedModel = vehicle.Model;
        }

        setFormData(prev => ({
            ...prev,
            CarRegister: vehicle.RegisterNo,
            VinNo: vehicle.VinNo,
            ProjectType: vehicle.ProjectType,
            CustomerName: vehicle.CustomerName,
            CarModel: matchedModel || prev.CarModel,
            InventoryItemID: vehicle.InventoryItemID,
        }));
        setShowSuggestions(false);
        setVehicleSuggestions([]);
    };

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        
        if (
            !formData.BookingDate || 
            !formData.StartTime || 
            !formData.EndTime || 
            !formData.CustomerName.trim() || 
            !formData.CarRegister.trim() || 
            !formData.CarModel.trim() || 
            !formData.BranchID
        ) {
            setError('กรุณากรอกข้อมูลหลักให้ครบถ้วน');
            return;
        }

        const cleanPhone = (formData.CustomerPhone || '').replace(/[^0-9]/g, '');
        if (!cleanPhone) {
            setError('กรุณาระบุเบอร์โทรลูกค้า');
            return;
        }
        if (cleanPhone.length !== 10) {
            setError('เบอร์โทรลูกค้าต้องมี 10 หลัก');
            return;
        }

        if (formData.LastMileage === undefined || formData.LastMileage === null || formData.LastMileage.toString().trim() === '') {
            setError('กรุณากรอกเลขไมล์ล่าสุด');
            return;
        }

        if (isCheckMileage) {
            if (!formData.MileageOption) {
                setError('กรุณาเลือกระยะเช็คระยะ');
                return;
            }
            if (formData.MileageOption === 'other' && (!formData.CustomMileage || formData.CustomMileage.trim() === '')) {
                setError('กรุณาระบุระยะเช็คระยะเพิ่มเติม');
                return;
            }
        }

        setIsSaving(true);
        setError(null);

        try {
            const res = await fetch('/api/bookings', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    ...formData,
                    IsCheckMileage: bookingType === 'EV7' ? isCheckMileage : false,
                    BookingType: bookingType,
                }),
            });

            const data = await res.json();
            if (data.success) {
                router.push('/service-center/bookings');
            } else {
                setError(data.error || 'จองคิวล้มเหลว');
            }
        } catch (err) {
            console.error('Error creating booking:', err);
            setError('เกิดข้อผิดพลาดในการทำรายการ');
        } finally {
            setIsSaving(false);
        }
    };

    const carModelOptions = carModels.map(m => {
        const fullName = m.Brand ? `${m.Brand} ${m.ModelName}` : m.ModelName;
        return { value: fullName, label: fullName };
    });

    const branchOptions = branches.map(b => ({
        value: b.BranchID.toString(),
        label: b.BranchName,
    }));

    return (
        <div className="w-full max-w-7xl mx-auto py-6 px-4">
            {/* Back to list */}
            <button
                type="button"
                onClick={() => router.push('/service-center/bookings')}
                className="flex items-center text-sm font-semibold text-gray-500 hover:text-gray-800 transition-colors mb-5 gap-1.5"
            >
                <ArrowLeft className="w-4 h-4" />
                กลับหน้าหลัก
            </button>

            <Card className="bg-white border border-gray-100 shadow-lg rounded-2xl overflow-hidden">
                <div className={`p-6 text-white transition-all duration-300 ${bookingType === 'RETAIL' ? 'bg-gradient-to-r from-emerald-600 to-teal-700' : 'bg-gradient-to-r from-blue-600 to-indigo-700'}`}>
                    <h1 className="text-xl font-bold flex items-center gap-2">
                        <Car className="w-6 h-6" />
                        {bookingType === 'RETAIL' ? 'แบบฟอร์มจองคิวลูกค้า Retail' : 'แบบฟอร์มบันทึกการจองคิวเช็คระยะ'}
                    </h1>
                    <p className="text-xs mt-1 opacity-80">
                        {bookingType === 'RETAIL' ? 'จองคิวบริการสำหรับลูกค้ารถทั่วไป (ไม่ผ่านระบบเคลม)' : 'ระบุข้อมูลลูกค้าและรุ่นรถยนต์เพื่อทำการบันทึกข้อมูลโควตาและคิวบริการของศูนย์บริการ'}
                    </p>
                </div>

                <CardContent className="p-6">
                    <form onSubmit={handleSubmit} className="space-y-6">
                        {error && (
                            <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700 font-semibold">
                                ⚠️ {error}
                            </div>
                        )}

                        {/* Booking Type Display */}
                        <div className="flex gap-3">
                            {allowedType ? (
                                <div className="flex-1 py-3 px-4 rounded-xl border-2 border-green-500 bg-green-50 text-green-800 ring-2 ring-green-200 text-sm font-bold flex items-center justify-between shadow-sm">
                                    <span className="flex items-center gap-2 text-base">
                                        🛵 ประเภทการจอง: <span className="text-green-900 font-extrabold">{allowedType === 'LINEMAN' ? 'Lineman' : allowedType}</span>
                                    </span>
                                    <span className="text-xs bg-green-200 text-green-900 px-2.5 py-1 rounded-full font-bold">
                                        ✓ ล็อกสิทธิ์เฉพาะ {allowedType === 'LINEMAN' ? 'Lineman' : allowedType}
                                    </span>
                                </div>
                            ) : (
                                <>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setBookingType('EV7');
                                            setActiveBookingWarning(null);
                                            setVehicleSuggestions([]);
                                        }}
                                        className={`flex-1 py-3 rounded-xl border text-sm font-bold transition-all duration-200 flex items-center justify-center gap-2 ${
                                            bookingType === 'EV7'
                                                ? 'bg-blue-50 border-blue-400 text-blue-700 ring-2 ring-blue-200'
                                                : 'bg-gray-50 border-gray-200 text-gray-400 hover:bg-gray-100'
                                        }`}
                                    >
                                        🚕 EV7 (รถ Taxi)
                                    </button>
                                    {!isCS && (
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setBookingType('RETAIL');
                                                setActiveBookingWarning(null);
                                                setVehicleSuggestions([]);
                                                setShowSuggestions(false);
                                                // Clear EV7-specific fields
                                                setFormData(prev => ({
                                                    ...prev,
                                                    VinNo: '',
                                                    ProjectType: '',
                                                    InventoryItemID: null,
                                                }));
                                            }}
                                            className={`flex-1 py-3 rounded-xl border text-sm font-bold transition-all duration-200 flex items-center justify-center gap-2 ${
                                                bookingType === 'RETAIL'
                                                    ? 'bg-emerald-50 border-emerald-400 text-emerald-700 ring-2 ring-emerald-200'
                                                    : 'bg-gray-50 border-gray-200 text-gray-400 hover:bg-gray-100'
                                            }`}
                                        >
                                            🚗 Retail (ลูกค้าทั่วไป)
                                        </button>
                                    )}
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setBookingType('LINEMAN');
                                            setActiveBookingWarning(null);
                                            setVehicleSuggestions([]);
                                            setShowSuggestions(false);
                                            setFormData(prev => ({
                                                ...prev,
                                                VinNo: '',
                                                ProjectType: '',
                                                InventoryItemID: null,
                                            }));
                                        }}
                                        className={`flex-1 py-3 rounded-xl border text-sm font-bold transition-all duration-200 flex items-center justify-center gap-2 ${
                                            bookingType === 'LINEMAN'
                                                ? 'bg-green-50 border-green-400 text-green-700 ring-2 ring-green-200'
                                                : 'bg-gray-50 border-gray-200 text-gray-400 hover:bg-gray-100'
                                        }`}
                                    >
                                        🛵 Lineman
                                    </button>
                                </>
                            )}
                        </div>

                        {bookingType === 'RETAIL' && (
                            <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 text-xs text-emerald-800">
                                <strong>โหมด Retail:</strong> จองคิวสำหรับลูกค้ารถทั่วไป — ไม่ต้องค้นข้อมูลรถจากระบบ, สถานะอนุมัติอัตโนมัติ, ปิดงานได้เลยโดยไม่ต้องส่งเคลม
                            </div>
                        )}

                        {/* Location and Time Section */}
                        <div className="bg-blue-50/30 border border-blue-100/50 rounded-xl p-4">
                            <h3 className="text-xs font-bold text-blue-800 uppercase tracking-wider mb-3 flex items-center gap-1">
                                <Clock className="w-3.5 h-3.5" /> รายละเอียดศูนย์บริการและเวลา
                            </h3>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <Select
                                    label="ศูนย์บริการ (สาขา)"
                                    name="BranchID"
                                    value={formData.BranchID}
                                    onChange={handleChange}
                                    options={branchOptions}
                                    disabled={!canSelectBranch}
                                    required
                                />

                                <Input
                                    label="วันที่ต้องการจอง"
                                    name="BookingDate"
                                    type="date"
                                    value={formData.BookingDate}
                                    onChange={handleChange}
                                    min={getBangkokDateString()}
                                    required
                                />
                            </div>
                        </div>

                        {/* Time Slots Block Grid */}
                        <div className="bg-gray-50/50 border border-gray-200/60 rounded-xl p-4">
                            <h3 className="text-xs font-bold text-gray-700 uppercase tracking-wider mb-3 flex items-center gap-1">
                                <Clock className="w-3.5 h-3.5" /> เลือกช่วงเวลาที่ต้องการจอง (Time Slot) *
                            </h3>

                            {isLoadingSlots ? (
                                <div className="flex items-center justify-center p-6 text-sm text-gray-400">
                                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600 mr-2"></div>
                                    กำลังตรวจสอบความว่างคิวของสาขา...
                                </div>
                            ) : isBranchClosed ? (
                                <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700 font-semibold">
                                    🔴 ขออภัย สาขาปิดบริการในวันที่เลือกเนื่องจาก: {branchClosedReason}
                                </div>
                            ) : slots.length === 0 ? (
                                <div className="text-center p-4 bg-gray-50 rounded-lg text-sm text-gray-400 border border-gray-100">
                                    ไม่พบช่วงเวลาให้บริการของสาขา หรือกรุณาเลือกสาขาอื่น
                                </div>
                            ) : (
                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                                    {slots.map((slot) => {
                                        const isSelected = formData.StartTime === slot.StartTime && formData.EndTime === slot.EndTime;
                                        const isFull = !slot.IsAvailable;
                                        const percent = Math.min(100, Math.round((slot.BookedCount / slot.MaxQueue) * 100));

                                        return (
                                            <button
                                                key={slot.StartTime}
                                                type="button"
                                                disabled={isFull}
                                                onClick={() => {
                                                    setFormData(prev => ({
                                                        ...prev,
                                                        StartTime: slot.StartTime,
                                                        EndTime: slot.EndTime
                                                    }));
                                                }}
                                                className={`p-3 text-left rounded-xl border text-sm transition-all duration-200 flex flex-col justify-between group relative overflow-hidden h-20 ${
                                                    isFull
                                                        ? 'bg-red-50/20 border-red-100 text-red-400 cursor-not-allowed opacity-60'
                                                        : isSelected
                                                            ? 'bg-blue-50 border-blue-500 text-blue-700 ring-2 ring-blue-500/20'
                                                            : 'bg-white hover:bg-gray-50 border-gray-200 text-gray-700'
                                                }`}
                                            >
                                                {/* Utilization progress indicator bar */}
                                                {!isFull && (
                                                    <div className="absolute bottom-0 left-0 w-full bg-gray-100 h-1">
                                                        <div 
                                                            className={`h-1 transition-all duration-300 ${
                                                                percent >= 100
                                                                    ? 'bg-red-500'
                                                                    : percent >= 80
                                                                        ? 'bg-amber-500'
                                                                        : 'bg-green-500'
                                                            }`}
                                                            style={{ width: `${percent}%` }}
                                                        />
                                                    </div>
                                                )}

                                                <div className="flex flex-col justify-between h-full w-full">
                                                    <span className="font-bold flex items-center gap-1.5 text-xs sm:text-sm">
                                                        <Clock className="w-3.5 h-3.5 text-gray-400 group-hover:text-blue-500 transition-colors" />
                                                        {slot.StartTime} - {slot.EndTime} น.
                                                    </span>
                                                    <span className={`text-[11px] font-semibold mt-1 ${
                                                        isFull
                                                            ? 'text-red-500'
                                                            : isSelected
                                                                ? 'text-blue-600 font-bold'
                                                                : 'text-gray-500'
                                                    }`}>
                                                        {isFull
                                                            ? `คิวเต็ม (${slot.BookedCount}/${slot.MaxQueue})`
                                                            : `ว่าง (${slot.BookedCount}/${slot.MaxQueue} คิว)`
                                                        }
                                                    </span>
                                                </div>

                                                {/* Check icon for selected slot */}
                                                {isSelected && (
                                                    <span className="absolute top-2 right-2 text-blue-600 bg-blue-100 rounded-full p-0.5">
                                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                                                        </svg>
                                                    </span>
                                                )}
                                            </button>
                                        );
                                    })}
                                </div>
                            )}

                            {/* Hidden inputs to validate form submission requirements for StartTime/EndTime */}
                            <input type="hidden" name="StartTime" value={formData.StartTime} required />
                            <input type="hidden" name="EndTime" value={formData.EndTime} required />
                        </div>

                        {/* Vehicle & Customer Section */}
                        <div className="space-y-4">
                            <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider flex items-center gap-1">
                                <Car className="w-3.5 h-3.5" /> รายละเอียดลูกค้าและรถยนต์
                                {bookingType === 'RETAIL' && <span className="text-emerald-600 ml-1">(Retail - กรอกเอง)</span>}
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
                                            // Timeout to allow clicking a suggestion before hiding
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

                                {activeBookingWarning && bookingType === 'EV7' && (
                                    <div className="col-span-1 md:col-span-2 p-4 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-800 animate-fade-in">
                                        <div className="font-bold flex items-center gap-1.5 text-amber-900">
                                            <span>⚠️</span>
                                            <span>รถทะเบียนนี้มีการจองล่วงหน้าที่ยังไม่มาถึงในระบบแล้ว</span>
                                        </div>
                                        <div className="mt-1 text-xs text-amber-700 leading-relaxed">
                                            เลขที่การจอง: <strong className="text-amber-900">{activeBookingWarning.BookingNo}</strong> | 
                                            วันที่จอง: <strong className="text-amber-900">{new Date(activeBookingWarning.BookingDate).toLocaleDateString('th-TH', { day: 'numeric', month: 'long', year: 'numeric' })}</strong> | 
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

                                <div>
                                    <Input
                                        label="เบอร์โทรลูกค้า *"
                                        name="CustomerPhone"
                                        placeholder="0xxxxxxxxx"
                                        value={formData.CustomerPhone}
                                        onChange={(e) => setFormData(prev => ({ ...prev, CustomerPhone: e.target.value.replace(/[^0-9]/g, '') }))}
                                        maxLength={10}
                                        required
                                    />
                                    <p className={`mt-1 text-xs text-right ${formData.CustomerPhone.length === 10 ? 'text-green-600' : 'text-gray-400'}`}>
                                        {formData.CustomerPhone.length}/10
                                    </p>
                                </div>

                                <Select
                                    label="รุ่นรถยนต์ (Car Model) *"
                                    name="CarModel"
                                    value={formData.CarModel}
                                    onChange={handleChange}
                                    options={[{ value: '', label: 'เลือกรุ่นรถ' }, ...carModelOptions]}
                                    required
                                />

                                {bookingType === 'EV7' && (
                                    <>
                                        <Input
                                            label="หมายเลขตัวถัง (VIN)"
                                            name="VinNo"
                                            placeholder="เช่น 17 หลัก (ระบุหรือไม่ระบุก็ได้)"
                                            value={formData.VinNo}
                                            onChange={handleChange}
                                        />

                                        <Input
                                            label="ประเภทโครงการ (Project Type)"
                                            name="ProjectType"
                                            placeholder="เช่น BYD-Taxi (ระบุหรือไม่ระบุก็ได้)"
                                            value={formData.ProjectType}
                                            onChange={handleChange}
                                        />
                                    </>
                                )}
                            </div>
                        </div>

                        {/* Service Type & Mileage */}
                        <>
                            {/* Service Type Selection */}
                            <div className="space-y-3 pt-2">
                                <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider flex items-center gap-1">
                                    <Milestone className="w-3.5 h-3.5" /> ประเภทการเข้ารับบริการ *
                                </h3>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setIsCheckMileage(true);
                                            setFormData(prev => ({ ...prev, Mileage: 10000 }));
                                        }}
                                        className={`p-4 text-center rounded-xl border text-sm font-semibold flex items-center justify-center gap-2 transition-all duration-200 ${
                                            isCheckMileage
                                                ? 'bg-blue-50 border-blue-500 text-blue-700 ring-2 ring-blue-500/10'
                                                : 'bg-white hover:bg-gray-50 border-gray-200 text-gray-600'
                                        }`}
                                    >
                                        <span>🚗</span>
                                        <span>ตรวจเช็คตามระยะทาง (Periodic Check)</span>
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setIsCheckMileage(false);
                                            setFormData(prev => ({ ...prev, Mileage: 0 }));
                                        }}
                                        className={`p-4 text-center rounded-xl border text-sm font-semibold flex items-center justify-center gap-2 transition-all duration-200 ${
                                            !isCheckMileage
                                                ? 'bg-blue-50 border-blue-500 text-blue-700 ring-2 ring-blue-500/10'
                                                : 'bg-white hover:bg-gray-50 border-gray-200 text-gray-600'
                                        }`}
                                    >
                                        <span>🔧</span>
                                        <span>ซ่อมเคลมทั่วไป / อาการชำรุดอื่นๆ (General Repairs)</span>
                                    </button>
                                </div>
                            </div>

                            {/* Mileage and Details Section */}
                            <div className="space-y-4 pt-2">
                                <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider flex items-center gap-1">
                                    <Milestone className="w-3.5 h-3.5" /> รายละเอียดเลขไมล์และอาการ
                                </h3>
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                    <Input
                                        label="เลขไมล์ล่าสุด (กิโลเมตร) *"
                                        name="LastMileage"
                                        type="number"
                                        value={formData.LastMileage}
                                        onChange={handleChange}
                                        placeholder="กรอกเลขไมล์ล่าสุดของรถยนต์"
                                        required
                                    />

                                    {isCheckMileage && (
                                        <>
                                            <Select
                                                label="ระยะทางที่ต้องการนัดเช็คระยะ (กิโลเมตร) *"
                                                name="MileageOption"
                                                value={formData.MileageOption}
                                                onChange={(e) => {
                                                    const val = e.target.value;
                                                    setFormData(prev => ({
                                                        ...prev,
                                                        MileageOption: val,
                                                        Mileage: val !== 'other' ? parseInt(val) : (parseInt(prev.CustomMileage) || 0)
                                                    }));
                                                }}
                                                options={mileages}
                                                required
                                            />

                                            {formData.MileageOption === 'other' && (
                                                <Input
                                                    label="ระบุระยะ (กิโลเมตร) *"
                                                    name="CustomMileage"
                                                    type="number"
                                                    value={formData.CustomMileage}
                                                    onChange={(e) => {
                                                        const val = e.target.value;
                                                        setFormData(prev => ({
                                                            ...prev,
                                                            CustomMileage: val,
                                                            Mileage: parseInt(val) || 0
                                                        }));
                                                    }}
                                                    placeholder="เช่น 15000"
                                                    required
                                                />
                                            )}
                                        </>
                                    )}
                                </div>

                                <Input
                                    label="อาการเบื้องต้น / รายละเอียดเพิ่มเติม"
                                    name="ClaimDetail"
                                    placeholder="ระบุอาการชำรุดที่ต้องการแจ้งซ่อมเพิ่มเติม (ถ้ามี)"
                                    value={formData.ClaimDetail}
                                    onChange={handleChange}
                                />
                            </div>
                        </>

                        {/* Actions */}
                        <div className="flex items-center justify-end gap-3 pt-6 border-t border-gray-100">
                            <Button
                                type="button"
                                variant="outline"
                                onClick={() => router.push('/service-center/bookings')}
                                disabled={isSaving}
                            >
                                ยกเลิก
                            </Button>
                            <Button
                                type="submit"
                                disabled={isSaving}
                                className={bookingType === 'RETAIL' ? 'bg-emerald-600 hover:bg-emerald-700 text-white' : 'bg-blue-600 hover:bg-blue-700 text-white'}
                            >
                                {isSaving ? 'กำลังบันทึกการจอง...' : bookingType === 'RETAIL' ? '✅ ยืนยันจองคิว Retail' : 'ยืนยันบันทึกจองคิว'}
                            </Button>
                        </div>
                    </form>
                </CardContent>
            </Card>
        </div>
    );
}

export default function NewBookingPage() {
    return (
        <Suspense fallback={<div className="p-8 text-center text-gray-500">กำลังโหลด...</div>}>
            <NewBookingPageInner />
        </Suspense>
    );
}
