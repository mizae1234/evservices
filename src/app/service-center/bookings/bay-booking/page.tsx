'use client';

import React, { useState, useEffect, Suspense } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Header } from '@/components/layouts';
import {
    Card, CardContent, CardHeader, CardTitle,
    Button, Input, Select, LoadingPage,
} from '@/components/ui';
import { ArrowLeft, Clock, Check, Loader2, Plus, Trash2, GripVertical, Save, Wrench, ToggleLeft, ToggleRight, Globe } from 'lucide-react';
import { CAR_MODEL_FLAT_RATES } from '@/lib/flat-rates-data';
import { MileageWarning } from '@/components/bookings/MileageWarning';

interface CarModel {
    ModelID: number;
    ModelCode: string;
    Brand: string;
    ModelName: string;
}

interface ServiceType {
    ServiceTypeID: number;
    Code: string;
    Name: string;
    RequiresMileage: boolean;
}

interface FlatRate {
    FlatRateID: number;
    ServiceTypeID: number;
    MileageID: number | null;
    CarModelID: number | null;
    DurationMinutes: number;
    Description: string | null;
    Mileage: { MileageID: number; Value: number; Label: string } | null;
}

function timeToMinutes(t: string): number {
    const [h, m] = t.split(':').map(Number);
    return h * 60 + m;
}

function minutesToTime(m: number): string {
    const h = Math.floor(m / 60);
    const min = m % 60;
    return `${h.toString().padStart(2, '0')}:${min.toString().padStart(2, '0')}`;
}

function formatDuration(min: number): string {
    const h = Math.floor(min / 60);
    const m = min % 60;
    if (h === 0) return `${m} นาที`;
    if (m === 0) return `${h} ชม.`;
    return `${h} ชม. ${m} นาที`;
}

function formatThaiDate(dateStr: string): string {
    const [y, m, d] = dateStr.split('-').map(Number);
    const date = new Date(y, m - 1, d);
    const thaiMonths = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
    const thaiDays = ['อาทิตย์', 'จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์', 'เสาร์'];
    return `วัน${thaiDays[date.getDay()]}ที่ ${d} ${thaiMonths[m - 1]} ${y + 543}`;
}

function BayBookingPageInner() {
    const router = useRouter();
    const { data: session } = useSession();
    const searchParams = useSearchParams();
    const isCS = session?.user?.role === 'CS';

    const bayId = searchParams.get('bayId') || '';
    const bayName = searchParams.get('bayName') || 'Bay';
    const branchId = searchParams.get('branchId') || '';
    const date = searchParams.get('date') || new Date().toISOString().split('T')[0];
    const initialStartTime = searchParams.get('startTime') || '08:30';

    // Master data
    const [serviceTypes, setServiceTypes] = useState<ServiceType[]>([]);
    const [flatRates, setFlatRates] = useState<FlatRate[]>([]);
    const [isLoadingData, setIsLoadingData] = useState(true);

    // Form — Step 1: Service Type
    const [selectedServiceType, setSelectedServiceType] = useState('');
    // Form — Step 2: Mileage
    const [selectedMileage, setSelectedMileage] = useState('');
    // Form — Step 3: Duration + Time
    const [duration, setDuration] = useState(0);
    const [customDuration, setCustomDuration] = useState('');
    const [useCustomDuration, setUseCustomDuration] = useState(false);
    const [formStartTime, setFormStartTime] = useState(initialStartTime);
    // Form — Step 4: Customer Info
    const [customerName, setCustomerName] = useState('');
    const [customerPhone, setCustomerPhone] = useState('');
    const [carRegister, setCarRegister] = useState('');
    const [carModel, setCarModel] = useState('');
    const [vinNo, setVinNo] = useState('');
    const [claimDetail, setClaimDetail] = useState('');
    const [projectType, setProjectType] = useState('');
    const [lastMileage, setLastMileage] = useState('');
    const [bookingType, setBookingType] = useState<'EV7' | 'RETAIL' | 'LINEMAN'>('EV7');

    // Car models dropdown
    const [carModels, setCarModels] = useState<CarModel[]>([]);

    // Track pre-filled status
    const [isVinPrefilled, setIsVinPrefilled] = useState(false);
    const [isProjectTypePrefilled, setIsProjectTypePrefilled] = useState(false);

    // Vehicle lookup
    const [vehicleSuggestions, setVehicleSuggestions] = useState<{ InventoryItemID: number; VinNo: string; RegisterNo: string; ProjectType: string; Model: string; CustomerName: string }[]>([]);
    const [showSuggestions, setShowSuggestions] = useState(false);
    const [isSearchingVehicles, setIsSearchingVehicles] = useState(false);
    const [inventoryItemId, setInventoryItemId] = useState<number | null>(null);

    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState(false);

    // Active booking warning
    const [activeBookingWarning, setActiveBookingWarning] = useState<any | null>(null);

    // Bays availability for overlap checking
    const [baysData, setBaysData] = useState<any[]>([]);

    // Computed
    const effectiveDuration = useCustomDuration ? (parseInt(customDuration) || 0) : duration;
    
    // Calculate EndTime skipping lunch break (12:00 - 13:00)
    const getEndTimeWithLunchBreak = () => {
        if (effectiveDuration <= 0) return '';
        const startMin = timeToMinutes(formStartTime);
        const lunchStart = 12 * 60;
        let endMin = startMin + effectiveDuration;
        if (startMin < lunchStart && endMin > lunchStart) {
            endMin += 60; // Add 60 mins for lunch break
        }
        return minutesToTime(endMin);
    };
    const endTime = getEndTimeWithLunchBreak();
    const selectedST = serviceTypes.find(st => st.ServiceTypeID.toString() === selectedServiceType);

    const warningDateStr = activeBookingWarning?.BookingDate 
        ? new Date(activeBookingWarning.BookingDate).toISOString().split('T')[0] 
        : '';
    const isSameDayDuplicate = warningDateStr === date;

    // Helper to check if two time ranges overlap
    const isOverlap = (s1: string, e1: string, s2: string, e2: string) => {
        return timeToMinutes(s1) < timeToMinutes(e2) && timeToMinutes(s2) < timeToMinutes(e1);
    };

    const currentBay = baysData.find(b => b.BayID === parseInt(bayId));
    const activeBookings = currentBay?.Bookings || [];
    
    // Check if current slot overlaps with any active bookings on the current bay
    const overlappingBooking = activeBookings.find((b: any) => {
        if (b.Status === 2 || b.Status === 4) return false;
        return isOverlap(formStartTime, endTime, b.StartTime, b.EndTime);
    });

    // Find other bays with this slot free
    const alternativeBays = baysData.filter(b => {
        if (b.BayID === parseInt(bayId)) return false; // skip current
        const hasOverlap = b.Bookings.some((bk: any) => {
            if (bk.Status === 2 || bk.Status === 4) return false;
            return isOverlap(formStartTime, endTime, bk.StartTime, bk.EndTime);
        });
        return !hasOverlap;
    });

    // Find other free slots in the current bay
    const openMin = timeToMinutes('08:30');
    const closeMin = timeToMinutes('17:30');
    const alternativeSlots: { start: string; end: string }[] = [];
    
    if (effectiveDuration > 0) {
        for (let m = openMin; m < closeMin; m += 30) {
            const slotStart = minutesToTime(m);
            let slotEndMin = m + effectiveDuration;
            if (m < 12 * 60 && slotEndMin > 12 * 60) {
                slotEndMin += 60;
            }
            if (slotEndMin > closeMin) continue;

            const slotEnd = minutesToTime(slotEndMin);
            
            const hasOverlap = activeBookings.some((bk: any) => {
                if (bk.Status === 2 || bk.Status === 4) return false;
                return isOverlap(slotStart, slotEnd, bk.StartTime, bk.EndTime);
            });
            
            if (!hasOverlap) {
                alternativeSlots.push({ start: slotStart, end: slotEnd });
            }
        }
    }

    // Current step
    const currentStep = !selectedServiceType ? 1
        : !carModel ? 2
        : selectedST?.RequiresMileage && !selectedMileage ? 3
        : effectiveDuration <= 0 ? 3
        : 4;

    // Load master data
    useEffect(() => {
        async function loadData() {
            try {
                const [stRes, frRes, cmRes, baRes] = await Promise.all([
                    fetch('/api/service-types'),
                    fetch('/api/flat-rates'),
                    fetch('/api/car-models'),
                    fetch(`/api/bookings/bay-availability?branchId=${branchId}&date=${date}`),
                ]);
                const [stData, frData, cmData, baData] = await Promise.all([
                    stRes.json(),
                    frRes.json(),
                    cmRes.json(),
                    baRes.json(),
                ]);
                if (stData.success) setServiceTypes(stData.data);
                if (frData.success) setFlatRates(frData.data);
                if (cmData.success) setCarModels(cmData.data);
                if (baData.success) setBaysData(baData.data || []);
            } catch (err) {
                console.error('Error loading data:', err);
            } finally {
                setIsLoadingData(false);
            }
        }
        loadData();
    }, [branchId, date]);

    // Auto-fill duration from Flat Rate

    // Helper to calculate custom duration
    const getCalculatedDuration = (stId: number, mileageValue: string | null) => {
        if (!carModel) return null;
        const cm = carModels.find(m => (m.Brand ? `${m.Brand} ${m.ModelName}` : m.ModelName) === carModel);
        if (!cm) return null;
        
        let modelKey = cm.ModelCode;
        if (cm.ModelID >= 11 && cm.ModelID <= 12) modelKey = 'Y PLUS TAXI'; // Y490, Y410
        else if (cm.ModelID === 13) modelKey = 'ES TAXI'; // ES
        else if (modelKey.startsWith('Y')) modelKey = 'Y PLUS'; // Handles Y490-RETAIL, Y410-RETAIL, etc.
        else if (modelKey === 'ES-RETAIL') modelKey = 'ES'; // Handles ES-RETAIL
        else if (modelKey === 'HT') modelKey = 'HYPTEC HT';
        else if (modelKey === 'M8-PHEV') modelKey = 'M8 PHEV';
        
        const ratesForModel = CAR_MODEL_FLAT_RATES[modelKey as keyof typeof CAR_MODEL_FLAT_RATES];
        if (ratesForModel && mileageValue) {
            const hr = (ratesForModel as any)[mileageValue];
            if (hr) return hr * 60; // convert to minutes
        }
        return null;
    };

    useEffect(() => {
        if (!selectedServiceType) { setDuration(0); return; }
        const stId = parseInt(selectedServiceType);

        if (selectedST?.RequiresMileage && selectedMileage) {
            const mileageId = parseInt(selectedMileage);
            const rate = flatRates.find(fr => fr.ServiceTypeID === stId && fr.MileageID === mileageId);
            
            // Override with CAR_MODEL_FLAT_RATES if applicable
            let finalDuration = rate ? rate.DurationMinutes : 0;
            if (rate && rate.Mileage) {
                const custom = getCalculatedDuration(stId, String(rate.Mileage.Value));
                if (custom) {
                    finalDuration = custom;
                    // If ServiceType is "เช็คระยะ + ซ่อม" (ID = 2), add 60 minutes
                    if (stId === 2) {
                        finalDuration += 60;
                    }
                }
            }
            
            if (finalDuration > 0) { setDuration(finalDuration); setUseCustomDuration(false); }
            else { setDuration(0); }
        } else if (selectedST && !selectedST.RequiresMileage) {
            const rate = flatRates.find(fr => fr.ServiceTypeID === stId && fr.MileageID === null);
            if (rate) { setDuration(rate.DurationMinutes); setUseCustomDuration(false); }
            else { setDuration(120); setUseCustomDuration(false); }
        }
    }, [selectedServiceType, selectedMileage, flatRates, selectedST, carModel, carModels]);

    // Mileage options for the selected service type, filtered by selected car model
    const lastMileageNum = parseInt(lastMileage) || 0;
    const relevantMileages = selectedST?.RequiresMileage
        ? (() => {
            const stId = parseInt(selectedServiceType);
            // Find selected car model ID
            const cm = carModel ? carModels.find(m => (m.Brand ? `${m.Brand} ${m.ModelName}` : m.ModelName) === carModel) : null;
            let rates = flatRates.filter(fr => fr.ServiceTypeID === stId && fr.Mileage);
            // Filter by car model if selected
            if (cm) {
                const modelRates = rates.filter(fr => fr.CarModelID === cm.ModelID);
                if (modelRates.length > 0) rates = modelRates;
            }
            // Deduplicate by MileageID
            const seen = new Map<string, { value: string; label: string; duration: number; disabled: boolean }>();
            for (const fr of rates) {
                const key = fr.MileageID!.toString();
                if (seen.has(key)) continue;
                const disabled = lastMileageNum > 0 && fr.Mileage!.Value <= lastMileageNum;
                seen.set(key, { value: key, label: fr.Mileage!.Label, duration: fr.DurationMinutes, disabled });
            }
            return Array.from(seen.values());
        })()
        : [];

    // Vehicle search
    const searchVehicles = async (query: string) => {
        if (!query || query.length < 2) {
            setVehicleSuggestions([]); setShowSuggestions(false); return;
        }
        setIsSearchingVehicles(true);
        try {
            const res = await fetch(`/api/vehicles/lookup?q=${encodeURIComponent(query)}`);
            const data = await res.json();
            if (data.success && data.data.length > 0) {
                setVehicleSuggestions(data.data);
                setShowSuggestions(true);
            } else {
                setVehicleSuggestions([]); setShowSuggestions(false);
            }
        } catch (err) { console.error('Error searching vehicles:', err); }
        finally { setIsSearchingVehicles(false); }
    };

    const handleCarRegisterChange = (val: string) => {
        setCarRegister(val);
        setInventoryItemId(null);
        setIsVinPrefilled(false);
        setIsProjectTypePrefilled(false);
        if (bookingType === 'RETAIL') return;
        searchVehicles(val);
    };

    const handleVehicleSelect = (v: typeof vehicleSuggestions[0]) => {
        setCarRegister(v.RegisterNo);
        setCustomerName(v.CustomerName || '');
        setVinNo(v.VinNo || '');
        setInventoryItemId(v.InventoryItemID);
        setProjectType(v.ProjectType || '');
        setIsVinPrefilled(!!v.VinNo);
        setIsProjectTypePrefilled(!!v.ProjectType);
        // Match car model from dropdown
        if (v.Model) {
            const searchModel = v.Model.toLowerCase().replace(/\s+/g, '');
            const match = carModels.find(m => {
                const fullName = (m.Brand ? `${m.Brand} ${m.ModelName}` : m.ModelName).toLowerCase().replace(/\s+/g, '');
                return fullName === searchModel || fullName.includes(searchModel) || searchModel.includes(fullName);
            });
            if (match) {
                setCarModel(match.Brand ? `${match.Brand} ${match.ModelName}` : match.ModelName);
            } else {
                setCarModel(v.Model);
            }
        }
        setShowSuggestions(false);
        setVehicleSuggestions([]);
    };

    const handleBookingTypeChange = (type: 'EV7' | 'RETAIL' | 'LINEMAN') => {
        setBookingType(type);
        setCarRegister('');
        setCustomerName('');
        setCarModel('');
        setVinNo('');
        setProjectType('');
        setLastMileage('');
        setInventoryItemId(null);
        setIsVinPrefilled(false);
        setIsProjectTypePrefilled(false);
        setVehicleSuggestions([]);
        setShowSuggestions(false);
        setActiveBookingWarning(null);
    };

    const handleSelectAlternativeBay = (newBayId: number, newBayName: string) => {
        const params = new URLSearchParams(window.location.search);
        params.set('bayId', newBayId.toString());
        params.set('bayName', newBayName);
        router.replace(`${window.location.pathname}?${params.toString()}`);
    };

    const handleSelectAlternativeSlot = (startTime: string) => {
        setFormStartTime(startTime);
    };

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
            if (carRegister && bookingType !== 'RETAIL') {
                checkActiveBooking(carRegister);
            } else {
                setActiveBookingWarning(null);
            }
        }, 500);
        return () => clearTimeout(timer);
    }, [carRegister, bookingType]);

    const handleSubmit = async () => {
        setError('');
        if (!selectedServiceType) { setError('กรุณาเลือกประเภทบริการ'); return; }
        if (selectedST?.RequiresMileage && !selectedMileage) { setError('กรุณาเลือกระยะทาง'); return; }
        if (!effectiveDuration || effectiveDuration <= 0) { setError('กรุณาระบุระยะเวลา'); return; }
        if (!customerName.trim()) { setError('กรุณาระบุชื่อลูกค้า'); return; }
        if (!customerPhone.trim()) { setError('กรุณาระบุเบอร์โทรลูกค้า'); return; }
        if (selectedST?.RequiresMileage && !lastMileage.trim()) { setError('กรุณาระบุเลขไมล์ล่าสุด'); return; }
        if (!carRegister.trim()) { setError('กรุณาระบุทะเบียนรถ'); return; }
        if (!carModel.trim()) { setError('กรุณาระบุรุ่นรถ'); return; }

        // For SERVICE_CENTER/ADMIN: confirm if overlapping
        let shouldForceOverlap = false;
        if (overlappingBooking && !isCS) {
            const confirmed = confirm(
                `⚠️ เวลาที่เลือก (${formStartTime} - ${endTime}) ทับซ้อนกับคิว ${overlappingBooking.BookingNo} (${overlappingBooking.StartTime}-${overlappingBooking.EndTime} น. ลูกค้า: ${overlappingBooking.CustomerName})\n\nแน่ใจหรือไม่ที่จะเพิ่มการจองทับเวลานี้?`
            );
            if (!confirmed) return;
            shouldForceOverlap = true;
        }

        setIsSubmitting(true);
        try {
            const res = await fetch('/api/bookings', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    BookingDate: date,
                    StartTime: formStartTime,
                    EndTime: endTime,
                    CustomerName: customerName.trim(),
                    CustomerPhone: customerPhone.trim() || undefined,
                    CarModel: carModel.trim(),
                    CarRegister: carRegister.trim(),
                    VinNo: vinNo || null,
                    ProjectType: projectType || '',
                    ClaimDetail: claimDetail || '',
                    BranchID: branchId,
                    BayID: parseInt(bayId),
                    ServiceTypeID: parseInt(selectedServiceType),
                    DurationMinutes: effectiveDuration,
                    BookingType: bookingType,
                    Mileage: (() => {
                        if (!selectedMileage) return 0;
                        const fr = flatRates.find(f => f.MileageID?.toString() === selectedMileage);
                        return fr?.Mileage?.Value || 0;
                    })(),
                    LastMileage: parseInt(lastMileage) || 0,
                    forceOverlap: shouldForceOverlap,
                }),
            });
            const data = await res.json();
            if (data.success) {
                setSuccess(true);
                setTimeout(() => {
                    router.push(`/service-center/bookings/bay-calendar?branchId=${branchId}&date=${date}`);
                }, 1500);
            } else {
                setError(data.error || 'เกิดข้อผิดพลาด');
            }
        } catch {
            setError('เกิดข้อผิดพลาดในการจอง');
        } finally {
            setIsSubmitting(false);
        }
    };

    if (isLoadingData) return <LoadingPage />;

    if (success) {
        return (
            <>
                <Header title="จองสำเร็จ!" subtitle="" />
                <div className="flex items-center justify-center min-h-[50vh]">
                    <div className="text-center">
                        <div className="w-20 h-20 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-4">
                            <Check className="w-10 h-10 text-emerald-600" />
                        </div>
                        <h2 className="text-xl font-bold text-gray-900 mb-2">จองเรียบร้อยแล้ว!</h2>
                        <p className="text-gray-500 mb-1">{bayName} • {formatThaiDate(date)}</p>
                        <p className="text-gray-500">{formStartTime} - {endTime} ({formatDuration(effectiveDuration)})</p>
                        <p className="text-sm text-gray-400 mt-3">กำลังกลับไป Bay Calendar...</p>
                    </div>
                </div>
            </>
        );
    }

    return (
        <>
            <Header
                title={`จอง ${bayName}`}
                subtitle={`${formatThaiDate(date)} • เริ่ม ${initialStartTime}`}
            />

            <div className="p-4 lg:p-6 w-full max-w-7xl mx-auto">
                {/* Back */}
                <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => router.push(`/service-center/bookings/bay-calendar?branchId=${branchId}&date=${date}`)}
                    className="mb-4"
                >
                    <ArrowLeft className="w-4 h-4 mr-1" />
                    กลับ Bay Calendar
                </Button>

                <div className="space-y-6">
                    {/* ========== ประเภทลูกค้า ========== */}
                    <div className="flex gap-3">
                        <button
                            type="button"
                            onClick={() => handleBookingTypeChange('EV7')}
                            className={`flex-1 py-3 rounded-xl border-2 text-sm font-bold transition-all flex items-center justify-center gap-2 ${
                                bookingType === 'EV7'
                                    ? 'bg-blue-50 border-blue-400 text-blue-700 ring-2 ring-blue-200'
                                    : 'bg-gray-50 border-gray-200 text-gray-500 hover:bg-gray-100'
                            }`}
                        >
                            🚕 EV7 (รถ Taxi)
                        </button>
                        {!isCS && (
                            <button
                                type="button"
                                onClick={() => handleBookingTypeChange('RETAIL')}
                                className={`flex-1 py-3 rounded-xl border-2 text-sm font-bold transition-all flex items-center justify-center gap-2 ${
                                    bookingType === 'RETAIL'
                                        ? 'bg-emerald-50 border-emerald-400 text-emerald-700 ring-2 ring-emerald-200'
                                        : 'bg-gray-50 border-gray-200 text-gray-500 hover:bg-gray-100'
                                }`}
                            >
                                🚗 Retail (ลูกค้าทั่วไป)
                            </button>
                        )}
                        <button
                            type="button"
                            onClick={() => handleBookingTypeChange('LINEMAN')}
                            className={`flex-1 py-3 rounded-xl border-2 text-sm font-bold transition-all flex items-center justify-center gap-2 ${
                                bookingType === 'LINEMAN'
                                    ? 'bg-green-50 border-green-400 text-green-700 ring-2 ring-green-200'
                                    : 'bg-gray-50 border-gray-200 text-gray-500 hover:bg-gray-100'
                            }`}
                        >
                            🛵 Lineman
                        </button>
                    </div>

                    {/* ========== STEP 1: ประเภทบริการ ========== */}
                    <Card className={currentStep >= 1 ? '' : 'opacity-50'}>
                        <CardContent className="p-5">
                            <h3 className="font-bold text-gray-900 mb-3 flex items-center gap-2">
                                <span className="bg-blue-600 text-white rounded-full w-7 h-7 flex items-center justify-center text-sm">1</span>
                                เลือกประเภทบริการ
                            </h3>
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                {serviceTypes.map(st => (
                                    <button
                                        key={st.ServiceTypeID}
                                        onClick={() => { setSelectedServiceType(st.ServiceTypeID.toString()); setSelectedMileage(''); }}
                                        className={`p-4 rounded-xl border-2 text-left transition-all ${
                                            selectedServiceType === st.ServiceTypeID.toString()
                                                ? 'border-blue-500 bg-blue-50 shadow-md'
                                                : 'border-gray-200 hover:border-blue-300 hover:bg-gray-50'
                                        }`}
                                    >
                                        <p className="font-bold text-gray-900">{st.Name}</p>
                                        <p className="text-xs text-gray-500 mt-1">
                                            {st.Code === 'MILEAGE_CHECK' && '✅ อนุมัติอัตโนมัติ'}
                                            {st.Code === 'MILEAGE_PLUS_REPAIR' && '⏳ รอผู้จัดการอนุมัติ'}
                                            {st.Code === 'GENERAL_REPAIR' && '⏳ รอผู้จัดการอนุมัติ'}
                                        </p>
                                    </button>
                                ))}
                            </div>
                        </CardContent>
                    </Card>

                    {/* ========== STEP 2: ข้อมูลลูกค้าและรถยนต์ ========== */}
                    <Card className={currentStep >= 2 ? '' : 'opacity-50'}>
                            <CardContent className="p-5">
                                <h3 className="font-bold text-gray-900 mb-4 flex items-center gap-2">
                                    <span className="bg-blue-600 text-white rounded-full w-7 h-7 flex items-center justify-center text-sm">2</span>
                                    ข้อมูลลูกค้า
                                </h3>
                                <div className="space-y-4">
                                    {activeBookingWarning && (
                                        isSameDayDuplicate ? (
                                            <div className="p-4 bg-red-50 border-2 border-red-200 rounded-xl text-sm text-red-800 mb-4">
                                                <div className="font-bold flex items-center gap-1.5 text-red-900">
                                                    <span>❌ รถทะเบียนนี้มีคิวการจองในวันที่เลือกแล้ว</span>
                                                </div>
                                                <div className="mt-1 text-xs text-red-700 leading-relaxed">
                                                    ไม่สามารถจองซ้ำภายในวันเดียวกันได้ <br/>
                                                    เลขที่การจอง: <strong className="text-red-900">{activeBookingWarning.BookingNo}</strong> | 
                                                    เวลา: <strong className="text-red-900">{activeBookingWarning.StartTime} - {activeBookingWarning.EndTime} น.</strong> <br/>
                                                    ลูกค้า: <strong className="text-red-900">{activeBookingWarning.CustomerName}</strong> | 
                                                    สาขาที่จอง: <strong className="text-red-900">{activeBookingWarning.BranchName}</strong>
                                                </div>
                                            </div>
                                        ) : (
                                            <div className="p-4 bg-amber-50 border-2 border-amber-200 rounded-xl text-sm text-amber-800 mb-4">
                                                <div className="font-bold flex items-center gap-1.5 text-amber-900">
                                                    <span>⚠️ คันนี้เคยโทรมาจองคิวแล้ว</span>
                                                </div>
                                                <div className="mt-1 text-xs text-amber-700 leading-relaxed">
                                                    เลขที่การจอง: <strong className="text-amber-900">{activeBookingWarning.BookingNo}</strong> | 
                                                    วันที่จอง: <strong className="text-amber-900">{new Date(activeBookingWarning.BookingDate).toLocaleDateString('th-TH', { day: 'numeric', month: 'long', year: 'numeric' })}</strong> | 
                                                    เวลา: <strong className="text-amber-900">{activeBookingWarning.StartTime} - {activeBookingWarning.EndTime} น.</strong> <br/>
                                                    ลูกค้า: <strong className="text-amber-900">{activeBookingWarning.CustomerName}</strong> | 
                                                    สาขาที่จอง: <strong className="text-amber-900">{activeBookingWarning.BranchName}</strong>
                                                </div>
                                            </div>
                                        )
                                    )}

                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                        {/* Car Register with Suggestions */}
                                        <div className="relative">
                                            <Input
                                                label={`ทะเบียนรถ * ${bookingType !== 'RETAIL' ? '(พิมพ์เพื่อค้นหา)' : ''}`}
                                                placeholder="เช่น กข 1234"
                                                value={carRegister}
                                                onChange={(e) => handleCarRegisterChange(e.target.value)}
                                                onFocus={() => { if (vehicleSuggestions.length > 0) setShowSuggestions(true); }}
                                                onBlur={() => { setTimeout(() => setShowSuggestions(false), 200); }}
                                            />
                                            {isSearchingVehicles && (
                                                <div className="absolute right-3 top-9 text-sm text-gray-500 animate-pulse">กำลังค้นหา...</div>
                                            )}
                                            {showSuggestions && vehicleSuggestions.length > 0 && (
                                                <div className="absolute z-10 left-0 right-0 mt-1 bg-white border-2 border-blue-300 rounded-xl shadow-lg max-h-48 overflow-y-auto">
                                                    {vehicleSuggestions.map((v) => (
                                                        <button
                                                            key={v.InventoryItemID}
                                                            type="button"
                                                            onMouseDown={() => handleVehicleSelect(v)}
                                                            className="w-full text-left px-4 py-3 hover:bg-blue-50 transition-colors border-b last:border-0 border-gray-100"
                                                        >
                                                            <span className="font-bold text-gray-900 text-sm">{v.RegisterNo}</span>
                                                            <span className="text-xs text-gray-600 ml-2">
                                                                {v.Model} • {v.CustomerName}
                                                            </span>
                                                        </button>
                                                    ))}
                                                </div>
                                            )}
                                        </div>

                                        <Input
                                            label="เบอร์โทรลูกค้า *"
                                            placeholder="0xxxxxxxxx"
                                            value={customerPhone}
                                            onChange={(e) => setCustomerPhone(e.target.value.replace(/[^0-9]/g, ''))}
                                            maxLength={10}
                                        />
                                        <Input
                                            label="ชื่อลูกค้า *"
                                            placeholder="ชื่อ-นามสกุล"
                                            value={customerName}
                                            onChange={(e) => setCustomerName(e.target.value)}
                                        />
                                        <Input
                                            label={selectedST?.RequiresMileage ? "เลขไมล์ล่าสุด (กิโลเมตร) *" : "เลขไมล์ล่าสุด (กิโลเมตร)"}
                                            type="number"
                                            placeholder="ระบุเลขไมล์ล่าสุดของรถยนต์"
                                            value={lastMileage}
                                            onChange={(e) => setLastMileage(e.target.value)}
                                        />
                                    </div>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                        <Select
                                            label="รุ่นรถ *"
                                            value={carModel}
                                            onChange={(e) => setCarModel(e.target.value)}
                                            options={carModels
                                                .filter(m => {
                                                    const isTaxi = [11, 12, 13].includes(m.ModelID);
                                                    return (bookingType === 'EV7' || bookingType === 'LINEMAN') ? isTaxi : !isTaxi;
                                                })
                                                .map(m => ({
                                                    value: m.Brand ? `${m.Brand} ${m.ModelName}` : m.ModelName,
                                                    label: m.Brand ? `${m.Brand} ${m.ModelName}` : m.ModelName,
                                                }))}
                                            placeholder="เลือกรุ่นรถ"
                                        />
                                        <Input
                                            label="VIN No."
                                            placeholder="เลขตัวถัง"
                                            value={vinNo}
                                            onChange={(e) => setVinNo(e.target.value)}
                                            disabled={isVinPrefilled}
                                        />
                                        <Input
                                            label="Project Type"
                                            placeholder="Owner / Rental / Fleet"
                                            value={projectType}
                                            onChange={(e) => setProjectType(e.target.value)}
                                            disabled={isProjectTypePrefilled}
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">หมายเหตุ</label>
                                        <textarea
                                            placeholder="รายละเอียดเพิ่มเติม..."
                                            value={claimDetail}
                                            onChange={(e) => setClaimDetail(e.target.value)}
                                            rows={2}
                                            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 bg-white font-medium focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                        />
                                    </div>
                                </div>
                            </CardContent>
                        </Card>


                    {/* ========== Warning: ไมล์อาจเกินระยะเช็ค ========== */}
                    {(() => {
                        if (!selectedMileage || lastMileageNum <= 0) return null;
                        const fr = flatRates.find(f => f.MileageID?.toString() === selectedMileage && f.Mileage);
                        if (!fr || !fr.Mileage) return null;
                        return (
                            <MileageWarning
                                lastMileage={lastMileageNum}
                                targetMileage={fr.Mileage.Value}
                                bookingDate={date}
                                showDetail
                            />
                        );
                    })()}

                    {/* ========== STEP 3: ระยะทาง (ถ้าเป็นเช็คระยะ) ========== */}
                    {selectedST?.RequiresMileage && (
                        <Card className={currentStep >= 3 ? '' : 'opacity-50'}>
                            <CardContent className="p-5">
                                <h3 className="font-bold text-gray-900 mb-3 flex items-center gap-2">
                                    <span className="bg-blue-600 text-white rounded-full w-7 h-7 flex items-center justify-center text-sm">3</span>
                                    เลือกระยะทาง
                                </h3>
                                <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                                    {relevantMileages.map(m => (
                                        <button
                                            key={m.value}
                                            onClick={() => !m.disabled && setSelectedMileage(m.value)}
                                            disabled={m.disabled}
                                            className={`p-3 rounded-xl border-2 text-center transition-all ${
                                                m.disabled
                                                    ? 'border-gray-100 bg-gray-100 opacity-50 cursor-not-allowed'
                                                    : selectedMileage === m.value
                                                        ? 'border-blue-500 bg-blue-50 shadow-md'
                                                        : 'border-gray-200 hover:border-blue-300'
                                            }`}
                                        >
                                            <p className={`font-bold text-sm ${m.disabled ? 'text-gray-400' : 'text-gray-900'}`}>{m.label}</p>
                                            <p className={`text-xs font-medium mt-0.5 ${m.disabled ? 'text-gray-300' : 'text-blue-600'}`}>{formatDuration(m.duration)}</p>
                                        </button>
                                    ))}
                                </div>
                            </CardContent>
                        </Card>
                    )}

                    {/* ========== เวลาที่คำนวณ ========== */}
                    {effectiveDuration > 0 && (
                        <div className={`border-2 rounded-xl p-5 transition-all ${
                            overlappingBooking 
                                ? 'bg-rose-50 border-rose-300' 
                                : 'bg-emerald-50 border-emerald-200'
                        }`}>
                            <div className="flex items-center gap-2 mb-4">
                                <Clock className={`w-6 h-6 ${overlappingBooking ? 'text-rose-600' : 'text-emerald-600'}`} />
                                <span className={`font-bold text-lg ${overlappingBooking ? 'text-rose-900' : 'text-emerald-900'}`}>
                                    {overlappingBooking ? 'ช่วงเวลานี้ทับซ้อนกับคิวอื่น!' : 'เวลาที่คำนวณให้'}
                                </span>
                            </div>

                            {overlappingBooking && (
                                <div className="mb-4 p-4 bg-white border border-rose-200 rounded-xl text-sm text-rose-800 space-y-2 shadow-sm">
                                    <p className="font-bold flex items-center gap-1.5 text-rose-900">
                                        <span>⚠️ ช่วงเวลา {formStartTime} - {endTime} น. ชนกับคิวใน {bayName}</span>
                                    </p>
                                    <p className="text-xs text-rose-700 leading-relaxed">
                                        คิวที่ชน: <strong>{overlappingBooking.BookingNo}</strong> ({overlappingBooking.StartTime} - {overlappingBooking.EndTime} น. • ลูกค้า: {overlappingBooking.CustomerName})
                                    </p>
                                </div>
                            )}

                            {overlappingBooking && (
                                <div className="mb-4 p-4 bg-white border border-blue-200 rounded-xl space-y-3 shadow-sm">
                                    <h4 className="font-bold text-blue-900 text-sm">💡 แนะนำคิวทางเลือก:</h4>
                                    
                                    {/* Alternative Bays */}
                                    {alternativeBays.length > 0 && (
                                        <div className="space-y-1">
                                            <p className="text-xs font-bold text-gray-700">👉 ย้ายไปช่องซ่อมอื่น (เวลาเดิม {formStartTime} น.):</p>
                                            <div className="flex flex-wrap gap-2 pt-1">
                                                {alternativeBays.map(b => (
                                                    <button
                                                        key={b.BayID}
                                                        type="button"
                                                        onClick={() => handleSelectAlternativeBay(b.BayID, b.BayName)}
                                                        className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-black transition-all shadow-sm"
                                                    >
                                                        ย้ายไป {b.BayName}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    {/* Alternative Slots */}
                                    {alternativeSlots.length > 0 && (
                                        <div className="space-y-1">
                                            <p className="text-xs font-bold text-gray-700">👉 แนะนำช่วงเวลาอื่นที่ว่าง (ในช่อง {bayName}):</p>
                                            <div className="flex flex-wrap gap-1.5 pt-1">
                                                {alternativeSlots.slice(0, 4).map(s => (
                                                    <button
                                                        key={s.start}
                                                        type="button"
                                                        onClick={() => handleSelectAlternativeSlot(s.start)}
                                                        className="px-3 py-1.5 bg-amber-500 hover:bg-amber-600 text-white rounded-lg text-xs font-black transition-all shadow-sm"
                                                    >
                                                        {s.start} - {s.end} น.
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}

                            <div className="grid grid-cols-3 gap-3">
                                <div className="bg-white rounded-xl p-4 text-center border border-emerald-100">
                                    <p className="text-sm font-bold text-gray-700 mb-2">เริ่ม</p>
                                    <p className="text-2xl font-black text-gray-900">{formStartTime}</p>
                                </div>
                                <div className="bg-white rounded-xl p-4 text-center border border-emerald-100">
                                    <p className="text-sm font-bold text-gray-700 mb-2">ระยะเวลา</p>
                                    <p className="text-2xl font-black text-emerald-700">{formatDuration(effectiveDuration)}</p>
                                </div>
                                <div className="bg-white rounded-xl p-4 text-center border border-emerald-100">
                                    <p className="text-sm font-bold text-gray-700 mb-2">จบ</p>
                                    <p className="text-2xl font-black text-gray-900">{endTime}</p>
                                </div>
                            </div>
                            <div className="flex items-center gap-4 mt-4 flex-wrap">
                                <div className="flex items-center gap-2">
                                    <label className="text-sm font-bold text-gray-800">ปรับเวลาเริ่ม:</label>
                                    <div className="flex items-center gap-1">
                                        <input
                                            type="number"
                                            min={0}
                                            max={23}
                                            value={formStartTime.split(':')[0]}
                                            onChange={(e) => {
                                                const h = e.target.value.padStart(2, '0');
                                                const m = formStartTime.split(':')[1] || '00';
                                                setFormStartTime(`${h}:${m}`);
                                            }}
                                            className="w-16 border-2 border-gray-400 rounded-lg px-2 py-2 text-xl font-black text-gray-900 text-center bg-white"
                                        />
                                        <span className="text-2xl font-black text-gray-900">:</span>
                                        <input
                                            type="number"
                                            min={0}
                                            max={59}
                                            step={30}
                                            value={formStartTime.split(':')[1]}
                                            onChange={(e) => {
                                                const h = formStartTime.split(':')[0] || '08';
                                                const m = e.target.value.padStart(2, '0');
                                                setFormStartTime(`${h}:${m}`);
                                            }}
                                            className="w-16 border-2 border-gray-400 rounded-lg px-2 py-2 text-xl font-black text-gray-900 text-center bg-white"
                                        />
                                    </div>
                                </div>
                                {session?.user?.role !== 'CS' && (
                                    !useCustomDuration ? (
                                        <button onClick={() => { setUseCustomDuration(true); setCustomDuration(effectiveDuration.toString()); }}
                                            className="text-blue-600 hover:underline text-xs">
                                            ปรับระยะเวลาเอง
                                        </button>
                                    ) : (
                                        <div className="flex items-center gap-1">
                                            <input type="number" value={customDuration} onChange={(e) => setCustomDuration(e.target.value)}
                                                min={30} step={30} className="border border-gray-400 rounded px-2 py-1 w-20 text-sm text-gray-900 font-bold bg-white" />
                                            <span className="text-xs text-gray-500">นาที</span>
                                            <button onClick={() => setUseCustomDuration(false)} className="text-xs text-gray-400 hover:underline ml-1">
                                                ใช้ค่าเดิม
                                            </button>
                                        </div>
                                    )
                                )}
                            </div>
                        </div>
                    )}

                    {/* Error */}
                    {error && (
                        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm font-medium">
                            {error}
                        </div>
                    )}

                    {/* Submit */}
                    {effectiveDuration > 0 && (
                        <div className="flex items-center justify-between bg-gray-50 rounded-xl p-4">
                            <div className="text-sm text-gray-600 flex items-center">
                                {isSameDayDuplicate ? (
                                    <span className="text-red-600 font-bold text-sm">
                                        ❌ ไม่สามารถจองซ้ำในวันเดียวกันได้
                                    </span>
                                ) : overlappingBooking && isCS ? (
                                    <span className="text-red-600 font-bold text-sm">
                                        ❌ เวลาทับซ้อนกับการจองที่มีอยู่
                                    </span>
                                ) : overlappingBooking && !isCS ? (
                                    <span className="text-amber-600 font-bold text-sm">
                                        ⚠️ เวลาทับซ้อน — กดยืนยันเพื่อจองทับได้
                                    </span>
                                ) : selectedST?.Code === 'MILEAGE_CHECK' ? (
                                    <span className="text-emerald-600 font-medium">✅ อนุมัติอัตโนมัติ</span>
                                ) : (
                                    <span className="text-amber-600 font-medium">⏳ รอผู้จัดการสาขาอนุมัติ</span>
                                )}
                            </div>
                            <Button
                                onClick={handleSubmit}
                                disabled={isSubmitting || !customerName || !carRegister || !carModel || (selectedST?.RequiresMileage && !lastMileage) || isSameDayDuplicate || (!!overlappingBooking && isCS)}
                                className="px-8"
                            >
                                {isSubmitting ? (
                                    <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> กำลังจอง...</>
                                ) : overlappingBooking && !isCS ? (
                                    '⚠️ ยืนยันจอง (ทับเวลา)'
                                ) : (
                                    'ยืนยันจอง'
                                )}
                            </Button>
                        </div>
                    )}
                </div>
            </div>
        </>
    );
}

export default function BayBookingPage() {
    return (
        <Suspense fallback={<LoadingPage />}>
            <BayBookingPageInner />
        </Suspense>
    );
}
