'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import { Header } from '@/components/layouts';
import {
    Card, CardContent, CardHeader, CardTitle,
    Button, Input, Select, LoadingPage,
} from '@/components/ui';
import { Plus, Trash2, ArrowLeft, Clock, Save, Edit2 } from 'lucide-react';

interface ServiceType {
    ServiceTypeID: number;
    Code: string;
    Name: string;
    RequiresMileage: boolean;
}

interface Mileage {
    MileageID: number;
    Value: number;
    Label: string;
}

interface FlatRate {
    FlatRateID: number;
    ServiceTypeID: number;
    MileageID: number | null;
    DurationMinutes: number;
    Description: string | null;
    ServiceType: { Code: string; Name: string; RequiresMileage: boolean };
    Mileage: { Value: number; Label: string } | null;
}

export default function FlatRateManagementPage() {
    const { data: session } = useSession();
    const [isLoading, setIsLoading] = useState(true);
    const [flatRates, setFlatRates] = useState<FlatRate[]>([]);
    const [serviceTypes, setServiceTypes] = useState<ServiceType[]>([]);
    const [mileages, setMileages] = useState<Mileage[]>([]);

    // Create form
    const [selectedServiceType, setSelectedServiceType] = useState('');
    const [selectedMileage, setSelectedMileage] = useState('');
    const [durationMinutes, setDurationMinutes] = useState('');
    const [description, setDescription] = useState('');
    const [isCreating, setIsCreating] = useState(false);

    // Edit
    const [editingId, setEditingId] = useState<number | null>(null);
    const [editDuration, setEditDuration] = useState('');
    const [editDescription, setEditDescription] = useState('');
    const [isSaving, setIsSaving] = useState(false);

    const isAdmin = session?.user?.role === 'ADMIN';

    const loadData = useCallback(async () => {
        try {
            const [frRes, stRes, mRes] = await Promise.all([
                fetch('/api/flat-rates'),
                fetch('/api/service-types'),
                fetch('/api/mileages'),
            ]);
            const [frData, stData, mData] = await Promise.all([frRes.json(), stRes.json(), mRes.json()]);
            if (frData.success) setFlatRates(frData.data);
            if (stData.success) setServiceTypes(stData.data);
            if (mData.success) setMileages(mData.data || []);
        } catch (err) {
            console.error('Error loading flat rate data:', err);
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        loadData();
    }, [loadData]);

    // Get the selected service type's RequiresMileage flag
    const selectedST = serviceTypes.find(st => st.ServiceTypeID.toString() === selectedServiceType);

    const handleCreate = async () => {
        if (!selectedServiceType || !durationMinutes) {
            alert('กรุณาเลือกประเภทบริการและระบุเวลา');
            return;
        }

        const dur = parseInt(durationMinutes);
        if (dur <= 0 || dur % 30 !== 0) {
            alert('เวลาต้องเป็นจำนวนเต็มบวกที่เป็นผลคูณของ 30');
            return;
        }

        setIsCreating(true);
        try {
            const body: Record<string, unknown> = {
                ServiceTypeID: selectedServiceType,
                DurationMinutes: durationMinutes,
                Description: description || null,
            };
            if (selectedST?.RequiresMileage && selectedMileage) {
                body.MileageID = selectedMileage;
            }

            const res = await fetch('/api/flat-rates', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            });
            const data = await res.json();
            if (data.success) {
                setSelectedServiceType('');
                setSelectedMileage('');
                setDurationMinutes('');
                setDescription('');
                loadData();
            } else {
                alert(data.error || 'เกิดข้อผิดพลาด');
            }
        } catch {
            alert('เกิดข้อผิดพลาดในการสร้าง');
        } finally {
            setIsCreating(false);
        }
    };

    const handleUpdate = async (id: number) => {
        const dur = parseInt(editDuration);
        if (dur <= 0 || dur % 30 !== 0) {
            alert('เวลาต้องเป็นจำนวนเต็มบวกที่เป็นผลคูณของ 30');
            return;
        }
        setIsSaving(true);
        try {
            const res = await fetch(`/api/flat-rates/${id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ DurationMinutes: editDuration, Description: editDescription }),
            });
            const data = await res.json();
            if (data.success) {
                setEditingId(null);
                loadData();
            } else {
                alert(data.error || 'เกิดข้อผิดพลาด');
            }
        } catch {
            alert('เกิดข้อผิดพลาดในการแก้ไข');
        } finally {
            setIsSaving(false);
        }
    };

    const handleDelete = async (fr: FlatRate) => {
        const label = `${fr.ServiceType.Name}${fr.Mileage ? ` / ${fr.Mileage.Label}` : ''}`;
        if (!confirm(`ต้องการลบ Flat Rate "${label}" ใช่หรือไม่?`)) return;
        try {
            const res = await fetch(`/api/flat-rates/${fr.FlatRateID}`, { method: 'DELETE' });
            const data = await res.json();
            if (data.success) {
                loadData();
            } else {
                alert(data.error || 'เกิดข้อผิดพลาด');
            }
        } catch {
            alert('เกิดข้อผิดพลาดในการลบ');
        }
    };

    const formatDuration = (min: number) => {
        const h = Math.floor(min / 60);
        const m = min % 60;
        if (h === 0) return `${m} นาที`;
        if (m === 0) return `${h} ชม.`;
        return `${h} ชม. ${m} นาที`;
    };

    if (isLoading) return <LoadingPage />;

    if (!isAdmin) {
        return (
            <>
                <Header title="Flat Rate Management" subtitle="จัดการเวลามาตรฐาน" />
                <div className="p-6 text-center text-gray-500">
                    <p>เฉพาะ Admin ส่วนกลางเท่านั้น</p>
                </div>
            </>
        );
    }

    // Group flat rates by service type
    const grouped = serviceTypes.map(st => ({
        ...st,
        rates: flatRates.filter(fr => fr.ServiceTypeID === st.ServiceTypeID),
    }));

    return (
        <>
            <Header title="Flat Rate Management" subtitle="จัดการเวลามาตรฐาน (ส่วนกลาง)" />

            <div className="p-4 lg:p-6 max-w-4xl space-y-6">
                <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => window.location.href = '/service-center/bookings/bay-calendar'}
                >
                    <ArrowLeft className="w-4 h-4 mr-1" />
                    กลับไปตาราง Bay Calendar
                </Button>

                {/* Create Flat Rate */}
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <Plus className="w-5 h-5 text-blue-600" />
                            เพิ่ม Flat Rate ใหม่
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <Select
                                label="ประเภทบริการ"
                                value={selectedServiceType}
                                onChange={(e) => { setSelectedServiceType(e.target.value); setSelectedMileage(''); }}
                                options={serviceTypes.map(st => ({ value: st.ServiceTypeID.toString(), label: st.Name }))}
                                placeholder="เลือกประเภทบริการ"
                            />

                            {selectedST?.RequiresMileage && (
                                <Select
                                    label="ระยะทาง (Mileage)"
                                    value={selectedMileage}
                                    onChange={(e) => setSelectedMileage(e.target.value)}
                                    options={mileages.map(m => ({ value: m.MileageID.toString(), label: m.Label }))}
                                    placeholder="เลือกระยะทาง"
                                />
                            )}

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">ระยะเวลา (นาที)</label>
                                <div className="flex items-center gap-2">
                                    <Input
                                        type="number"
                                        placeholder="เช่น 120"
                                        value={durationMinutes}
                                        onChange={(e) => setDurationMinutes(e.target.value)}
                                        min={30}
                                        step={30}
                                    />
                                    <span className="text-sm text-gray-500 whitespace-nowrap">
                                        {durationMinutes ? formatDuration(parseInt(durationMinutes) || 0) : ''}
                                    </span>
                                </div>
                                <p className="text-xs text-gray-400 mt-1">ต้องเป็นผลคูณของ 30 นาที</p>
                            </div>

                            <Input
                                label="รายละเอียด (optional)"
                                placeholder="เช่น รวมเปลี่ยนน้ำมันเครื่อง"
                                value={description}
                                onChange={(e) => setDescription(e.target.value)}
                            />
                        </div>
                        <div className="mt-4">
                            <Button onClick={handleCreate} disabled={isCreating}>
                                <Plus className="w-4 h-4 mr-1" />
                                {isCreating ? 'กำลังสร้าง...' : 'เพิ่ม Flat Rate'}
                            </Button>
                        </div>
                    </CardContent>
                </Card>

                {/* Flat Rates by Service Type */}
                {grouped.map(st => (
                    <Card key={st.ServiceTypeID}>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2 text-lg">
                                <Clock className="w-5 h-5 text-emerald-600" />
                                <span className="text-gray-900">{st.Name}</span>
                                {st.RequiresMileage && (
                                    <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-medium">ตามระยะ</span>
                                )}
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            {st.rates.length === 0 ? (
                                <p className="text-sm text-gray-400 text-center py-4">ยังไม่มี Flat Rate</p>
                            ) : (
                                <div className="overflow-x-auto">
                                    <table className="w-full text-sm">
                                        <thead>
                                            <tr className="border-b border-gray-200 text-left">
                                                {st.RequiresMileage && <th className="py-2.5 px-3 text-gray-800 font-bold text-sm">ระยะทาง</th>}
                                                <th className="py-2.5 px-3 text-gray-800 font-bold text-sm">ระยะเวลา</th>
                                                <th className="py-2.5 px-3 text-gray-800 font-bold text-sm">รายละเอียด</th>
                                                <th className="py-2.5 px-3 text-gray-800 font-bold text-sm text-right">จัดการ</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {st.rates.map(fr => (
                                                <tr key={fr.FlatRateID} className="border-b border-gray-50 hover:bg-gray-50">
                                                {st.RequiresMileage && (
                                                        <td className="py-2.5 px-3 font-bold text-gray-900">{fr.Mileage?.Label || '-'}</td>
                                                    )}
                                                    <td className="py-2.5 px-3">
                                                        {editingId === fr.FlatRateID ? (
                                                            <Input
                                                                type="number"
                                                                value={editDuration}
                                                                onChange={(e) => setEditDuration(e.target.value)}
                                                                min={30}
                                                                step={30}
                                                                className="w-24"
                                                            />
                                                        ) : (
                                                            <span className="font-bold text-blue-700 text-base">
                                                                {formatDuration(fr.DurationMinutes)}
                                                            </span>
                                                        )}
                                                    </td>
                                                    <td className="py-2.5 px-3 text-gray-700">
                                                        {editingId === fr.FlatRateID ? (
                                                            <Input
                                                                value={editDescription}
                                                                onChange={(e) => setEditDescription(e.target.value)}
                                                                placeholder="รายละเอียด"
                                                            />
                                                        ) : (
                                                            fr.Description || '-'
                                                        )}
                                                    </td>
                                                    <td className="py-2 px-3 text-right">
                                                        {editingId === fr.FlatRateID ? (
                                                            <div className="flex items-center gap-2 justify-end">
                                                                <Button size="sm" onClick={() => handleUpdate(fr.FlatRateID)} disabled={isSaving}>
                                                                    <Save className="w-3 h-3 mr-1" />
                                                                    บันทึก
                                                                </Button>
                                                                <Button size="sm" variant="ghost" onClick={() => setEditingId(null)}>
                                                                    ยกเลิก
                                                                </Button>
                                                            </div>
                                                        ) : (
                                                            <div className="flex items-center gap-2 justify-end">
                                                                <button
                                                                    onClick={() => {
                                                                        setEditingId(fr.FlatRateID);
                                                                        setEditDuration(fr.DurationMinutes.toString());
                                                                        setEditDescription(fr.Description || '');
                                                                    }}
                                                                    className="text-blue-600 hover:underline text-xs"
                                                                >
                                                                    <Edit2 className="w-3.5 h-3.5" />
                                                                </button>
                                                                <button
                                                                    onClick={() => handleDelete(fr)}
                                                                    className="text-gray-400 hover:text-red-600 transition-colors"
                                                                >
                                                                    <Trash2 className="w-3.5 h-3.5" />
                                                                </button>
                                                            </div>
                                                        )}
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </CardContent>
                    </Card>
                ))}
            </div>
        </>
    );
}
