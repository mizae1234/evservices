'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Clock, Car, User, X, Loader2 } from 'lucide-react';

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
    DurationMinutes: number;
    Description: string | null;
    Mileage: { MileageID: number; Value: number; Label: string } | null;
}

interface MileageOption {
    value: string;
    label: string;
}

interface Props {
    isOpen: boolean;
    onClose: () => void;
    onSuccess: () => void;
    bayId: number;
    bayName: string;
    branchId: string;
    date: string;
    startTime: string;
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
    return `${h} ชม. ${m} น.`;
}

export default function BayBookingModal({ isOpen, onClose, onSuccess, bayId, bayName, branchId, date, startTime }: Props) {
    // Master data
    const [serviceTypes, setServiceTypes] = useState<ServiceType[]>([]);
    const [flatRates, setFlatRates] = useState<FlatRate[]>([]);
    const [mileages, setMileages] = useState<MileageOption[]>([]);

    // Form state
    const [selectedServiceType, setSelectedServiceType] = useState('');
    const [selectedMileage, setSelectedMileage] = useState('');
    const [duration, setDuration] = useState(0);
    const [customDuration, setCustomDuration] = useState('');
    const [useCustomDuration, setUseCustomDuration] = useState(false);
    const [formStartTime, setFormStartTime] = useState(startTime);
    const [customerName, setCustomerName] = useState('');
    const [carRegister, setCarRegister] = useState('');
    const [carModel, setCarModel] = useState('');
    const [vinNo, setVinNo] = useState('');
    const [claimDetail, setClaimDetail] = useState('');

    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState('');

    // Computed end time
    const effectiveDuration = useCustomDuration ? (parseInt(customDuration) || 0) : duration;
    const endTimeMinutes = timeToMinutes(formStartTime) + effectiveDuration;
    const endTime = effectiveDuration > 0 ? minutesToTime(endTimeMinutes) : '';

    // Get selected service type object
    const selectedST = serviceTypes.find(st => st.ServiceTypeID.toString() === selectedServiceType);

    // Load master data
    useEffect(() => {
        if (!isOpen) return;

        async function loadData() {
            try {
                const [stRes, frRes, mRes] = await Promise.all([
                    fetch('/api/service-types'),
                    fetch('/api/flat-rates'),
                    fetch('/api/mileages'),
                ]);
                const [stData, frData, mData] = await Promise.all([stRes.json(), frRes.json(), mRes.json()]);
                if (stData.success) setServiceTypes(stData.data);
                if (frData.success) setFlatRates(frData.data);
                if (mData.success) setMileages(mData.data || []);
            } catch (err) {
                console.error('Error loading data:', err);
            }
        }
        loadData();
    }, [isOpen]);

    // Reset form when modal opens
    useEffect(() => {
        if (isOpen) {
            setSelectedServiceType('');
            setSelectedMileage('');
            setDuration(0);
            setCustomDuration('');
            setUseCustomDuration(false);
            setFormStartTime(startTime);
            setCustomerName('');
            setCarRegister('');
            setCarModel('');
            setVinNo('');
            setClaimDetail('');
            setError('');
        }
    }, [isOpen, startTime]);

    // Auto-fill duration from Flat Rate when service type + mileage changes
    useEffect(() => {
        if (!selectedServiceType) {
            setDuration(0);
            return;
        }

        const stId = parseInt(selectedServiceType);

        if (selectedST?.RequiresMileage && selectedMileage) {
            // Find flat rate for this service type + mileage
            const mileageId = parseInt(selectedMileage);
            const rate = flatRates.find(fr => fr.ServiceTypeID === stId && fr.MileageID === mileageId);
            if (rate) {
                setDuration(rate.DurationMinutes);
                setUseCustomDuration(false);
            } else {
                setDuration(0);
            }
        } else if (selectedST && !selectedST.RequiresMileage) {
            // Find flat rate without mileage
            const rate = flatRates.find(fr => fr.ServiceTypeID === stId && fr.MileageID === null);
            if (rate) {
                setDuration(rate.DurationMinutes);
                setUseCustomDuration(false);
            } else {
                setDuration(120); // default 2 hours
                setUseCustomDuration(false);
            }
        }
    }, [selectedServiceType, selectedMileage, flatRates, selectedST]);

    // Get relevant mileage options for the selected service type
    const relevantMileages = selectedST?.RequiresMileage
        ? flatRates
            .filter(fr => fr.ServiceTypeID === parseInt(selectedServiceType) && fr.Mileage)
            .map(fr => ({
                value: fr.MileageID!.toString(),
                label: fr.Mileage!.Label,
                duration: fr.DurationMinutes,
            }))
        : [];

    const handleSubmit = async () => {
        setError('');

        // Validation
        if (!selectedServiceType) { setError('กรุณาเลือกประเภทบริการ'); return; }
        if (selectedST?.RequiresMileage && !selectedMileage) { setError('กรุณาเลือกระยะทาง'); return; }
        if (!effectiveDuration || effectiveDuration <= 0) { setError('กรุณาระบุระยะเวลา'); return; }
        if (!customerName.trim()) { setError('กรุณาระบุชื่อลูกค้า'); return; }
        if (!carRegister.trim()) { setError('กรุณาระบุทะเบียนรถ'); return; }
        if (!carModel.trim()) { setError('กรุณาระบุรุ่นรถ'); return; }
        if (!endTime) { setError('ไม่สามารถคำนวณเวลาจบได้'); return; }

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
                    CarModel: carModel.trim(),
                    CarRegister: carRegister.trim(),
                    VinNo: vinNo || null,
                    ClaimDetail: claimDetail || '',
                    BranchID: branchId,
                    BayID: bayId,
                    ServiceTypeID: selectedServiceType,
                    DurationMinutes: effectiveDuration,
                    Mileage: selectedMileage ? parseInt(selectedMileage) : 0,
                    LastMileage: 0,
                }),
            });

            const data = await res.json();
            if (data.success) {
                onSuccess();
                onClose();
            } else {
                setError(data.error || 'เกิดข้อผิดพลาด');
            }
        } catch {
            setError('เกิดข้อผิดพลาดในการจอง');
        } finally {
            setIsSubmitting(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
            <div
                className="bg-white rounded-xl shadow-2xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between bg-blue-50">
                    <div>
                        <h3 className="font-bold text-gray-900 text-lg">จอง {bayName}</h3>
                        <p className="text-sm text-gray-600">
                            {date} เริ่ม {startTime}
                        </p>
                    </div>
                    <button onClick={onClose} className="p-1.5 hover:bg-gray-200 rounded-lg transition-colors">
                        <X className="w-5 h-5 text-gray-500" />
                    </button>
                </div>

                {/* Body */}
                <div className="px-6 py-4 space-y-5">
                    {/* Step 1: Service Type */}
                    <div>
                        <label className="block text-sm font-semibold text-gray-800 mb-2">
                            <span className="bg-blue-100 text-blue-700 rounded-full w-5 h-5 inline-flex items-center justify-center text-xs mr-2">1</span>
                            ประเภทบริการ <span className="text-red-500">*</span>
                        </label>
                        <div className="grid grid-cols-1 gap-2">
                            {serviceTypes.map(st => (
                                <button
                                    key={st.ServiceTypeID}
                                    onClick={() => { setSelectedServiceType(st.ServiceTypeID.toString()); setSelectedMileage(''); }}
                                    className={`p-3 rounded-lg border-2 text-left transition-all ${
                                        selectedServiceType === st.ServiceTypeID.toString()
                                            ? 'border-blue-500 bg-blue-50 text-blue-800'
                                            : 'border-gray-200 hover:border-gray-300 text-gray-700'
                                    }`}
                                >
                                    <p className="font-semibold text-sm">{st.Name}</p>
                                    <p className="text-xs text-gray-500 mt-0.5">
                                        {st.Code === 'MILEAGE_CHECK' && 'เช็คตามระยะปกติ (auto-approve)'}
                                        {st.Code === 'MILEAGE_PLUS_REPAIR' && 'เช็คระยะพร้อมซ่อมเพิ่ม (รออนุมัติ)'}
                                        {st.Code === 'GENERAL_REPAIR' && 'งานซ่อมทั่วไป (รออนุมัติ)'}
                                    </p>
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Step 2: Mileage (if needed) */}
                    {selectedST?.RequiresMileage && (
                        <div>
                            <label className="block text-sm font-semibold text-gray-800 mb-2">
                                <span className="bg-blue-100 text-blue-700 rounded-full w-5 h-5 inline-flex items-center justify-center text-xs mr-2">2</span>
                                ระยะทาง <span className="text-red-500">*</span>
                            </label>
                            <div className="grid grid-cols-2 gap-2">
                                {relevantMileages.map(m => (
                                    <button
                                        key={m.value}
                                        onClick={() => setSelectedMileage(m.value)}
                                        className={`p-2.5 rounded-lg border-2 text-center transition-all ${
                                            selectedMileage === m.value
                                                ? 'border-blue-500 bg-blue-50 text-blue-800'
                                                : 'border-gray-200 hover:border-gray-300 text-gray-700'
                                        }`}
                                    >
                                        <p className="font-semibold text-sm">{m.label}</p>
                                        <p className="text-xs text-gray-400">{formatDuration(m.duration)}</p>
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Step 3: Duration + Time */}
                    {effectiveDuration > 0 && (
                        <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4">
                            <div className="flex items-center gap-2 mb-2">
                                <Clock className="w-5 h-5 text-emerald-600" />
                                <span className="font-semibold text-emerald-800">เวลาที่คำนวณ</span>
                            </div>
                            <div className="grid grid-cols-3 gap-3 text-sm">
                                <div>
                                    <span className="text-gray-500">เริ่ม</span>
                                    <p className="font-bold text-gray-900">{formStartTime}</p>
                                </div>
                                <div>
                                    <span className="text-gray-500">ระยะเวลา</span>
                                    <p className="font-bold text-emerald-700">{formatDuration(effectiveDuration)}</p>
                                </div>
                                <div>
                                    <span className="text-gray-500">จบ</span>
                                    <p className="font-bold text-gray-900">{endTime}</p>
                                </div>
                            </div>
                            {!useCustomDuration && (
                                <button
                                    onClick={() => { setUseCustomDuration(true); setCustomDuration(effectiveDuration.toString()); }}
                                    className="text-xs text-blue-600 hover:underline mt-2"
                                >
                                    ปรับเวลาเอง
                                </button>
                            )}
                            {useCustomDuration && (
                                <div className="mt-2 flex items-center gap-2">
                                    <Input
                                        type="number"
                                        value={customDuration}
                                        onChange={(e) => setCustomDuration(e.target.value)}
                                        min={30}
                                        step={30}
                                        className="w-24"
                                    />
                                    <span className="text-xs text-gray-500">นาที</span>
                                    <button
                                        onClick={() => { setUseCustomDuration(false); }}
                                        className="text-xs text-gray-400 hover:underline"
                                    >
                                        ใช้ค่าเดิม
                                    </button>
                                </div>
                            )}

                            <div className="mt-3">
                                <label className="text-xs text-gray-500">ปรับเวลาเริ่ม</label>
                                <input
                                    type="time"
                                    value={formStartTime}
                                    onChange={(e) => setFormStartTime(e.target.value)}
                                    className="ml-2 border border-gray-300 rounded px-2 py-1 text-sm"
                                />
                            </div>
                        </div>
                    )}

                    {/* Step 4: Customer Info */}
                    {effectiveDuration > 0 && (
                        <div>
                            <label className="block text-sm font-semibold text-gray-800 mb-3">
                                <span className="bg-blue-100 text-blue-700 rounded-full w-5 h-5 inline-flex items-center justify-center text-xs mr-2">
                                    {selectedST?.RequiresMileage ? '3' : '3'}
                                </span>
                                ข้อมูลลูกค้า
                            </label>
                            <div className="space-y-3">
                                <Input
                                    label="ชื่อลูกค้า *"
                                    placeholder="ชื่อ-นามสกุล"
                                    value={customerName}
                                    onChange={(e) => setCustomerName(e.target.value)}
                                />
                                <div className="grid grid-cols-2 gap-3">
                                    <Input
                                        label="ทะเบียนรถ *"
                                        placeholder="เช่น กข 1234"
                                        value={carRegister}
                                        onChange={(e) => setCarRegister(e.target.value)}
                                    />
                                    <Input
                                        label="รุ่นรถ *"
                                        placeholder="เช่น MG ZS EV"
                                        value={carModel}
                                        onChange={(e) => setCarModel(e.target.value)}
                                    />
                                </div>
                                <Input
                                    label="VIN No. (ถ้ามี)"
                                    placeholder="เลข VIN"
                                    value={vinNo}
                                    onChange={(e) => setVinNo(e.target.value)}
                                />
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">หมายเหตุ</label>
                                    <textarea
                                        placeholder="รายละเอียดเพิ่มเติม..."
                                        value={claimDetail}
                                        onChange={(e) => setClaimDetail(e.target.value)}
                                        rows={2}
                                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                    />
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Error */}
                    {error && (
                        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
                            {error}
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-between">
                    <div className="text-xs text-gray-400">
                        {selectedST?.Code === 'MILEAGE_CHECK' ? '✅ อนุมัติอัตโนมัติ' : selectedServiceType ? '⏳ รอผู้จัดการอนุมัติ' : ''}
                    </div>
                    <div className="flex items-center gap-2">
                        <Button variant="ghost" onClick={onClose} disabled={isSubmitting}>
                            ยกเลิก
                        </Button>
                        <Button
                            onClick={handleSubmit}
                            disabled={isSubmitting || !effectiveDuration || !customerName || !carRegister || !carModel}
                        >
                            {isSubmitting ? (
                                <>
                                    <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                                    กำลังจอง...
                                </>
                            ) : (
                                'ยืนยันจอง'
                            )}
                        </Button>
                    </div>
                </div>
            </div>
        </div>
    );
}
