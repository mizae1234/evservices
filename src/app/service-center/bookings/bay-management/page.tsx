'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import { Header } from '@/components/layouts';
import {
    Card, CardContent, CardHeader, CardTitle,
    Button, Input, Select, LoadingPage,
} from '@/components/ui';
import { Plus, Trash2, ArrowLeft, GripVertical, Save, Wrench, ToggleLeft, ToggleRight, Globe } from 'lucide-react';
import { isCSRole } from '@/lib/permissions';

interface ServiceBay {
    BayID: number;
    BranchID: number;
    BayName: string;
    SortOrder: number;
    IsActive: boolean;
    IsOnline: boolean;
    CreateDate: string;
}

interface BranchOption {
    BranchID: number;
    BranchName: string;
}

export default function BayManagementPage() {
    const { data: session, status } = useSession();
    const [isLoading, setIsLoading] = useState(true);
    const [bays, setBays] = useState<ServiceBay[]>([]);
    const [newBayName, setNewBayName] = useState('');
    const [isOnlineNew, setIsOnlineNew] = useState(true);
    const [isCreating, setIsCreating] = useState(false);
    const [editingId, setEditingId] = useState<number | null>(null);
    const [editName, setEditName] = useState('');
    const [isSaving, setIsSaving] = useState(false);

    // Branch selection
    const [branches, setBranches] = useState<BranchOption[]>([]);
    const [selectedBranch, setSelectedBranch] = useState('');

    const userRole = session?.user?.role;
    const userBranchId = session?.user?.branchId;
    const canSelectBranch = userRole === 'ADMIN' || isCSRole(userRole);

    // Effective branchId for API calls
    const effectiveBranchId = canSelectBranch ? selectedBranch : userBranchId?.toString() || '';

    // Load branches (for admin/CS)
    useEffect(() => {
        async function loadBranches() {
            try {
                const res = await fetch('/api/branches');
                const data = await res.json();
                if (data.success) {
                    setBranches(data.data);
                    if (canSelectBranch && data.data.length > 0) {
                        setSelectedBranch(data.data[0].BranchID.toString());
                    }
                }
            } catch (err) {
                console.error('Error loading branches:', err);
            }
        }
        if (canSelectBranch) {
            loadBranches();
        }
    }, [canSelectBranch]);

    const loadBays = useCallback(async () => {
        if (!effectiveBranchId) return;
        setIsLoading(true);
        try {
            const params = new URLSearchParams({ includeInactive: 'true', branchId: effectiveBranchId });
            const res = await fetch(`/api/service-bays?${params}`);
            const data = await res.json();
            if (data.success) {
                setBays(data.data);
            }
        } catch (err) {
            console.error('Error loading bays:', err);
        } finally {
            setIsLoading(false);
        }
    }, [effectiveBranchId]);

    useEffect(() => {
        if (effectiveBranchId) {
            loadBays();
        }
    }, [effectiveBranchId, loadBays]);

    const handleCreate = async () => {
        if (!newBayName.trim() || !effectiveBranchId) return;
        setIsCreating(true);
        try {
            const res = await fetch('/api/service-bays', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    BranchID: parseInt(effectiveBranchId),
                    BayName: newBayName.trim(),
                    IsOnline: isOnlineNew,
                }),
            });
            const data = await res.json();
            if (data.success) {
                setNewBayName('');
                setIsOnlineNew(true);
                loadBays();
            } else {
                alert(data.error || 'เกิดข้อผิดพลาด');
            }
        } catch {
            alert('เกิดข้อผิดพลาดในการสร้าง Bay');
        } finally {
            setIsCreating(false);
        }
    };

    const handleUpdate = async (bayId: number) => {
        if (!editName.trim()) return;
        setIsSaving(true);
        try {
            const res = await fetch(`/api/service-bays/${bayId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ BayName: editName.trim() }),
            });
            const data = await res.json();
            if (data.success) {
                setEditingId(null);
                loadBays();
            } else {
                alert(data.error || 'เกิดข้อผิดพลาด');
            }
        } catch {
            alert('เกิดข้อผิดพลาดในการแก้ไข');
        } finally {
            setIsSaving(false);
        }
    };

    const handleToggleActive = async (bay: ServiceBay) => {
        try {
            const res = await fetch(`/api/service-bays/${bay.BayID}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ IsActive: !bay.IsActive }),
            });
            const data = await res.json();
            if (data.success) {
                loadBays();
            } else {
                alert(data.error || 'เกิดข้อผิดพลาด');
            }
        } catch {
            alert('เกิดข้อผิดพลาดในการเปลี่ยนสถานะ');
        }
    };

    const handleToggleOnline = async (bay: ServiceBay) => {
        try {
            const res = await fetch(`/api/service-bays/${bay.BayID}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ IsOnline: !bay.IsOnline }),
            });
            const data = await res.json();
            if (data.success) {
                loadBays();
            } else {
                alert(data.error || 'เกิดข้อผิดพลาด');
            }
        } catch {
            alert('เกิดข้อผิดพลาดในการเปลี่ยนสถานะออนไลน์');
        }
    };

    const handleDelete = async (bay: ServiceBay) => {
        if (!confirm(`ต้องการลบ ${bay.BayName} ใช่หรือไม่?`)) return;
        try {
            const res = await fetch(`/api/service-bays/${bay.BayID}`, { method: 'DELETE' });
            const data = await res.json();
            if (data.success) {
                loadBays();
            } else {
                alert(data.error || 'เกิดข้อผิดพลาด');
            }
        } catch {
            alert('เกิดข้อผิดพลาดในการลบ');
        }
    };

    if (status === 'loading' || (isLoading && bays.length === 0)) return <LoadingPage />;

    const activeBays = bays.filter(b => b.IsActive);
    const inactiveBays = bays.filter(b => !b.IsActive);

    // Get branch name for subtitle
    const currentBranchName = canSelectBranch
        ? branches.find(b => b.BranchID.toString() === selectedBranch)?.BranchName || ''
        : session?.user?.branchName || '';

    return (
        <>
            <Header
                title="จัดการ Service Bay"
                subtitle={currentBranchName ? `เพิ่ม/ลบ/แก้ไข Bay สำหรับ${currentBranchName}` : 'เพิ่ม/ลบ/แก้ไข Bay สำหรับสาขาของคุณ'}
            />

            <div className="p-4 lg:p-6 max-w-3xl space-y-6">
                {/* Back */}
                <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => window.location.href = '/service-center/bookings/bay-calendar'}
                >
                    <ArrowLeft className="w-4 h-4 mr-1" />
                    กลับไปตาราง Bay Calendar
                </Button>

                {/* Branch Selector (Admin/CS) */}
                {canSelectBranch && (
                    <Card>
                        <CardContent className="p-4">
                            <div className="flex items-center gap-3">
                                <label className="text-sm font-medium text-gray-700 whitespace-nowrap">เลือกสาขา:</label>
                                <div className="w-72">
                                    <Select
                                        value={selectedBranch}
                                        onChange={(e) => setSelectedBranch(e.target.value)}
                                        options={branches.map(b => ({ value: b.BranchID.toString(), label: b.BranchName }))}
                                        placeholder="เลือกสาขา"
                                    />
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                )}

                {/* Add New Bay */}
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <Plus className="w-5 h-5 text-blue-600" />
                            เพิ่ม Bay ใหม่
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                        <div className="flex gap-3">
                            <Input
                                placeholder="ชื่อ Bay เช่น Bay 1, Bay A, ช่องซ่อม 1"
                                value={newBayName}
                                onChange={(e) => setNewBayName(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
                                className="text-gray-900 bg-white font-medium"
                            />
                            <Button onClick={handleCreate} disabled={isCreating || !newBayName.trim() || !effectiveBranchId}>
                                <Plus className="w-4 h-4 mr-1" />
                                {isCreating ? 'กำลังสร้าง...' : 'เพิ่ม'}
                            </Button>
                        </div>
                        <div className="flex items-center gap-2">
                            <input
                                type="checkbox"
                                id="isOnlineNew"
                                checked={isOnlineNew}
                                onChange={(e) => setIsOnlineNew(e.target.checked)}
                                className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                            />
                            <label htmlFor="isOnlineNew" className="text-xs font-bold text-gray-700 cursor-pointer select-none">
                                🌐 เปิดรับคิวออนไลน์ (Online Booking / CS)
                            </label>
                        </div>
                    </CardContent>
                </Card>

                {/* Active Bays */}
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <Wrench className="w-5 h-5 text-emerald-600" />
                            Bay ที่เปิดใช้งาน
                            <span className="text-sm font-normal text-gray-500">({activeBays.length} Bay)</span>
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        {activeBays.length === 0 ? (
                            <p className="text-gray-500 text-sm text-center py-8">ยังไม่มี Bay — เพิ่ม Bay ด้านบน</p>
                        ) : (
                            <div className="space-y-2">
                                {activeBays.map((bay) => (
                                    <div key={bay.BayID}
                                        className="flex items-center gap-3 p-3 bg-white border border-gray-200 rounded-lg hover:border-gray-300 transition-colors"
                                    >
                                        <GripVertical className="w-4 h-4 text-gray-300" />

                                        {editingId === bay.BayID ? (
                                            <div className="flex-1 flex gap-2">
                                                <Input
                                                    value={editName}
                                                    onChange={(e) => setEditName(e.target.value)}
                                                    onKeyDown={(e) => e.key === 'Enter' && handleUpdate(bay.BayID)}
                                                    autoFocus
                                                />
                                                <Button size="sm" onClick={() => handleUpdate(bay.BayID)} disabled={isSaving}>
                                                    <Save className="w-4 h-4" />
                                                </Button>
                                                <Button size="sm" variant="ghost" onClick={() => setEditingId(null)}>
                                                    ยกเลิก
                                                </Button>
                                            </div>
                                        ) : (
                                            <>
                                                <div className="flex-1">
                                                    <div className="flex items-center gap-2">
                                                        <p className="font-semibold text-gray-900">{bay.BayName}</p>
                                                        {bay.IsOnline ? (
                                                            <span className="text-[10px] bg-emerald-50 text-emerald-700 px-1.5 py-0.5 rounded-full font-bold border border-emerald-200">🌐 ออนไลน์</span>
                                                        ) : (
                                                            <span className="text-[10px] bg-amber-50 text-amber-700 px-1.5 py-0.5 rounded-full font-bold border border-amber-200">🔒 Walk-in เท่านั้น</span>
                                                        )}
                                                    </div>
                                                    <p className="text-xs text-gray-400 mt-0.5">ลำดับการแสดงผล: #{bay.SortOrder}</p>
                                                </div>
                                                <button
                                                    onClick={() => handleToggleOnline(bay)}
                                                    className="text-gray-400 hover:text-blue-600 transition-colors p-1.5 hover:bg-gray-100 rounded-md"
                                                    title={bay.IsOnline ? "เปลี่ยนเป็น Offline (Walk-in เท่านั้น)" : "เปลี่ยนเป็น Online (เปิดรับคิวออนไลน์)"}
                                                >
                                                    <Globe className={`w-4.5 h-4.5 ${bay.IsOnline ? 'text-blue-600 font-bold' : 'text-gray-400'}`} />
                                                </button>
                                                <button
                                                    onClick={() => { setEditingId(bay.BayID); setEditName(bay.BayName); }}
                                                    className="text-xs text-blue-600 hover:underline px-1"
                                                >
                                                    แก้ไขชื่อ
                                                </button>
                                                <button
                                                    onClick={() => handleToggleActive(bay)}
                                                    className="text-gray-400 hover:text-amber-600 transition-colors"
                                                    title="ปิดการใช้งาน"
                                                >
                                                    <ToggleRight className="w-5 h-5 text-emerald-500" />
                                                </button>
                                                <button
                                                    onClick={() => handleDelete(bay)}
                                                    className="text-gray-400 hover:text-red-600 transition-colors"
                                                    title="ลบ Bay"
                                                >
                                                    <Trash2 className="w-4 h-4" />
                                                </button>
                                            </>
                                        )}
                                    </div>
                                ))}
                            </div>
                        )}
                    </CardContent>
                </Card>

                {/* Inactive Bays */}
                {inactiveBays.length > 0 && (
                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2 text-gray-500">
                                <ToggleLeft className="w-5 h-5" />
                                Bay ที่ปิดการใช้งาน
                                <span className="text-sm font-normal">({inactiveBays.length})</span>
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="space-y-2">
                                {inactiveBays.map((bay) => (
                                    <div key={bay.BayID}
                                        className="flex items-center gap-3 p-3 bg-gray-50 border border-gray-100 rounded-lg opacity-60 hover:opacity-100 transition-opacity"
                                    >
                                        <div className="flex-1">
                                            <p className="font-medium text-gray-500 line-through">{bay.BayName}</p>
                                        </div>
                                        <button
                                            onClick={() => handleToggleActive(bay)}
                                            className="text-xs text-blue-600 hover:underline"
                                        >
                                            เปิดใช้งานอีกครั้ง
                                        </button>
                                    </div>
                                ))}
                            </div>
                        </CardContent>
                    </Card>
                )}
            </div>
        </>
    );
}
