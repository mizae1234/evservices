'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import { Header } from '@/components/layouts';
import {
    Card, CardContent, CardHeader, CardTitle,
    Button, Input, LoadingPage,
} from '@/components/ui';
import { Plus, Edit2, Save, Building, Globe, Power } from 'lucide-react';

interface Branch {
    BranchID: number;
    BranchCode: string;
    BranchName: string;
    Address: string | null;
    Phone: string | null;
    IsActive: boolean;
    AllowOnlineBooking: boolean;
    _count?: {
        ServiceBays: number;
    };
}

export default function BranchManagementPage() {
    const { data: session } = useSession();
    const [isLoading, setIsLoading] = useState(true);
    const [branches, setBranches] = useState<Branch[]>([]);

    // Form states
    const [isCreating, setIsCreating] = useState(false);
    const [newBranch, setNewBranch] = useState({
        BranchCode: '',
        BranchName: '',
        Address: '',
        Phone: '',
        IsActive: true,
        AllowOnlineBooking: false
    });

    // Edit states
    const [editingId, setEditingId] = useState<number | null>(null);
    const [editForm, setEditForm] = useState<Partial<Branch>>({});
    const [isSaving, setIsSaving] = useState(false);

    const isAdmin = session?.user?.role === 'ADMIN';

    const loadData = useCallback(async () => {
        try {
            const res = await fetch('/api/admin/branches');
            const data = await res.json();
            if (data.success) {
                setBranches(data.data);
            }
        } catch (err) {
            console.error('Error loading branches:', err);
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        loadData();
    }, [loadData]);

    const handleCreate = async () => {
        if (!newBranch.BranchCode || !newBranch.BranchName) {
            alert('กรุณากรอกรหัสสาขาและชื่อสาขา');
            return;
        }
        
        setIsSaving(true);
        try {
            const res = await fetch('/api/admin/branches', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(newBranch),
            });
            const data = await res.json();
            if (data.success) {
                setNewBranch({
                    BranchCode: '',
                    BranchName: '',
                    Address: '',
                    Phone: '',
                    IsActive: true,
                    AllowOnlineBooking: false
                });
                setIsCreating(false);
                loadData();
            } else {
                alert(data.error || 'เกิดข้อผิดพลาดในการสร้างสาขา');
            }
        } catch (err) {
            console.error(err);
            alert('เกิดข้อผิดพลาดในการสร้าง');
        } finally {
            setIsSaving(false);
        }
    };

    const handleUpdate = async (id: number) => {
        setIsSaving(true);
        try {
            const res = await fetch(`/api/admin/branches/${id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(editForm),
            });
            const data = await res.json();
            if (data.success) {
                setEditingId(null);
                loadData();
            } else {
                alert(data.error || 'เกิดข้อผิดพลาดในการแก้ไข');
            }
        } catch (err) {
            console.error(err);
            alert('เกิดข้อผิดพลาดในการแก้ไข');
        } finally {
            setIsSaving(false);
        }
    };

    const toggleStatus = async (branch: Branch, field: 'IsActive' | 'AllowOnlineBooking') => {
        try {
            const res = await fetch(`/api/admin/branches/${branch.BranchID}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    BranchCode: branch.BranchCode,
                    BranchName: branch.BranchName,
                    [field]: !branch[field]
                }),
            });
            const data = await res.json();
            if (data.success) {
                loadData();
            } else {
                alert(data.error || 'เกิดข้อผิดพลาดในการเปลี่ยนสถานะ');
            }
        } catch (err) {
            console.error(err);
            alert('เกิดข้อผิดพลาด');
        }
    };

    if (isLoading) return <LoadingPage />;

    if (!isAdmin) {
        return (
            <>
                <Header title="Branch Management" subtitle="จัดการสาขา" />
                <div className="p-6 text-center text-gray-500">
                    <p>เฉพาะ Admin ส่วนกลางเท่านั้น</p>
                </div>
            </>
        );
    }

    return (
        <>
            <Header title="Branch Management" subtitle="จัดการข้อมูลสาขา และการตั้งค่าจองออนไลน์" />

            <div className="p-4 lg:p-6 max-w-7xl mx-auto space-y-6">
                
                {/* Create Branch Card */}
                {!isCreating ? (
                    <Button onClick={() => setIsCreating(true)} className="mb-4">
                        <Plus className="w-4 h-4 mr-1" />
                        เพิ่มสาขาใหม่
                    </Button>
                ) : (
                    <Card className="border-blue-200 shadow-sm">
                        <CardHeader className="bg-blue-50/50 pb-4 border-b border-blue-100">
                            <CardTitle className="text-lg flex items-center gap-2 text-blue-900">
                                <Building className="w-5 h-5 text-blue-600" />
                                เพิ่มสาขาใหม่
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="pt-6">
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                                <Input
                                    label="รหัสสาขา"
                                    placeholder="เช่น BR011"
                                    value={newBranch.BranchCode}
                                    onChange={(e) => setNewBranch({ ...newBranch, BranchCode: e.target.value })}
                                />
                                <Input
                                    label="ชื่อสาขา"
                                    placeholder="เช่น สาขาลาดพร้าว"
                                    value={newBranch.BranchName}
                                    onChange={(e) => setNewBranch({ ...newBranch, BranchName: e.target.value })}
                                />
                                <Input
                                    label="เบอร์โทรศัพท์"
                                    placeholder="เช่น 02-123-4567"
                                    value={newBranch.Phone}
                                    onChange={(e) => setNewBranch({ ...newBranch, Phone: e.target.value })}
                                />
                                <Input
                                    label="ที่อยู่"
                                    placeholder="ที่อยู่สาขา"
                                    value={newBranch.Address}
                                    onChange={(e) => setNewBranch({ ...newBranch, Address: e.target.value })}
                                />
                            </div>
                            <div className="flex gap-6 mt-6">
                                <label className="flex items-center gap-2 cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={newBranch.IsActive}
                                        onChange={(e) => setNewBranch({ ...newBranch, IsActive: e.target.checked })}
                                        className="rounded text-blue-600 focus:ring-blue-500"
                                    />
                                    <span className="text-sm font-medium text-gray-700">เปิดใช้งาน (IsActive)</span>
                                </label>
                                <label className="flex items-center gap-2 cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={newBranch.AllowOnlineBooking}
                                        onChange={(e) => setNewBranch({ ...newBranch, AllowOnlineBooking: e.target.checked })}
                                        className="rounded text-emerald-600 focus:ring-emerald-500"
                                    />
                                    <span className="text-sm font-medium text-gray-700">อนุญาตจองออนไลน์ (AllowOnlineBooking)</span>
                                </label>
                            </div>
                            <div className="mt-6 flex justify-end gap-3">
                                <Button variant="ghost" onClick={() => setIsCreating(false)}>ยกเลิก</Button>
                                <Button onClick={handleCreate} disabled={isSaving}>
                                    <Save className="w-4 h-4 mr-1" />
                                    {isSaving ? 'กำลังบันทึก...' : 'บันทึกสาขาใหม่'}
                                </Button>
                            </div>
                        </CardContent>
                    </Card>
                )}

                {/* Branches List */}
                <Card>
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="bg-gray-50 border-b border-gray-200">
                                    <th className="px-4 py-3 text-left font-semibold text-gray-700">รหัส</th>
                                    <th className="px-4 py-3 text-left font-semibold text-gray-700">ชื่อสาขา</th>
                                    <th className="px-4 py-3 text-left font-semibold text-gray-700">ที่อยู่ / เบอร์โทร</th>
                                    <th className="px-4 py-3 text-center font-semibold text-gray-700">Service Bays</th>
                                    <th className="px-4 py-3 text-center font-semibold text-gray-700">รับจองออนไลน์</th>
                                    <th className="px-4 py-3 text-center font-semibold text-gray-700">สถานะ</th>
                                    <th className="px-4 py-3 text-right font-semibold text-gray-700">จัดการ</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {branches.map(branch => (
                                    <tr key={branch.BranchID} className="hover:bg-gray-50/50">
                                        <td className="px-4 py-3">
                                            {editingId === branch.BranchID ? (
                                                <Input
                                                    value={editForm.BranchCode}
                                                    onChange={e => setEditForm({ ...editForm, BranchCode: e.target.value })}
                                                />
                                            ) : (
                                                <span className="font-mono text-gray-600">{branch.BranchCode}</span>
                                            )}
                                        </td>
                                        <td className="px-4 py-3 font-medium text-gray-900">
                                            {editingId === branch.BranchID ? (
                                                <Input
                                                    value={editForm.BranchName}
                                                    onChange={e => setEditForm({ ...editForm, BranchName: e.target.value })}
                                                />
                                            ) : (
                                                branch.BranchName
                                            )}
                                        </td>
                                        <td className="px-4 py-3">
                                            {editingId === branch.BranchID ? (
                                                <div className="space-y-2">
                                                    <Input
                                                        placeholder="เบอร์โทร"
                                                        value={editForm.Phone || ''}
                                                        onChange={e => setEditForm({ ...editForm, Phone: e.target.value })}
                                                    />
                                                    <Input
                                                        placeholder="ที่อยู่"
                                                        value={editForm.Address || ''}
                                                        onChange={e => setEditForm({ ...editForm, Address: e.target.value })}
                                                    />
                                                </div>
                                            ) : (
                                                <div className="text-gray-600">
                                                    {branch.Phone && <div>📞 {branch.Phone}</div>}
                                                    {branch.Address && <div className="text-xs truncate max-w-[200px]" title={branch.Address}>{branch.Address}</div>}
                                                    {!branch.Phone && !branch.Address && <span className="text-gray-400">-</span>}
                                                </div>
                                            )}
                                        </td>
                                        <td className="px-4 py-3 text-center">
                                            <span className="inline-flex items-center justify-center bg-gray-100 text-gray-700 px-2.5 py-0.5 rounded-full font-medium">
                                                {branch._count?.ServiceBays || 0}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3 text-center">
                                            {editingId === branch.BranchID ? (
                                                <input
                                                    type="checkbox"
                                                    checked={editForm.AllowOnlineBooking}
                                                    onChange={e => setEditForm({ ...editForm, AllowOnlineBooking: e.target.checked })}
                                                    className="w-5 h-5 rounded text-emerald-600 focus:ring-emerald-500"
                                                />
                                            ) : (
                                                <button
                                                    onClick={() => toggleStatus(branch, 'AllowOnlineBooking')}
                                                    className={`p-1.5 rounded-full transition-colors ${branch.AllowOnlineBooking ? 'bg-emerald-100 text-emerald-600 hover:bg-emerald-200' : 'bg-gray-100 text-gray-400 hover:bg-gray-200'}`}
                                                    title={branch.AllowOnlineBooking ? "เปิดรับจอง" : "ปิดรับจอง"}
                                                >
                                                    <Globe className="w-5 h-5" />
                                                </button>
                                            )}
                                        </td>
                                        <td className="px-4 py-3 text-center">
                                            {editingId === branch.BranchID ? (
                                                <input
                                                    type="checkbox"
                                                    checked={editForm.IsActive}
                                                    onChange={e => setEditForm({ ...editForm, IsActive: e.target.checked })}
                                                    className="w-5 h-5 rounded text-blue-600 focus:ring-blue-500"
                                                />
                                            ) : (
                                                <button
                                                    onClick={() => toggleStatus(branch, 'IsActive')}
                                                    className={`p-1.5 rounded-full transition-colors ${branch.IsActive ? 'bg-blue-100 text-blue-600 hover:bg-blue-200' : 'bg-red-50 text-red-400 hover:bg-red-100'}`}
                                                    title={branch.IsActive ? "ใช้งานอยู่" : "ระงับใช้งาน"}
                                                >
                                                    <Power className="w-5 h-5" />
                                                </button>
                                            )}
                                        </td>
                                        <td className="px-4 py-3 text-right">
                                            {editingId === branch.BranchID ? (
                                                <div className="flex justify-end gap-2">
                                                    <Button size="sm" onClick={() => handleUpdate(branch.BranchID)} disabled={isSaving}>
                                                        บันทึก
                                                    </Button>
                                                    <Button size="sm" variant="ghost" onClick={() => setEditingId(null)}>
                                                        ยกเลิก
                                                    </Button>
                                                </div>
                                            ) : (
                                                <button
                                                    onClick={() => {
                                                        setEditingId(branch.BranchID);
                                                        setEditForm(branch);
                                                    }}
                                                    className="text-blue-600 hover:text-blue-800 p-2"
                                                >
                                                    <Edit2 className="w-4 h-4" />
                                                </button>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </Card>
            </div>
        </>
    );
}
