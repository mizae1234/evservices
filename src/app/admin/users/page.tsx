// Admin Users Management Page
// Manage users - create, edit, delete, reset password

'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, Button, Input, LoadingPage } from '@/components/ui';
import { Header } from '@/components/layouts';
import {
    Users,
    Plus,
    Pencil,
    Trash2,
    Key,
    Search,
    X,
    Check,
    Ban,
} from 'lucide-react';

interface User {
    UserID: number;
    Email: string;
    FullName: string;
    Phone: string | null;
    RoleID: number;
    BranchID: number | null;
    IsActive: boolean;
    Role: { RoleCode: string; RoleName: string };
    Branch: { BranchID: number; BranchName: string } | null;
}

interface Role {
    RoleID: number;
    RoleCode: string;
    RoleName: string;
}

interface Branch {
    BranchID: number;
    BranchName: string;
}

export default function AdminUsersPage() {
    const [users, setUsers] = useState<User[]>([]);
    const [roles, setRoles] = useState<Role[]>([]);
    const [branches, setBranches] = useState<Branch[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [search, setSearch] = useState('');

    // Modal state
    const [showModal, setShowModal] = useState(false);
    const [modalMode, setModalMode] = useState<'create' | 'edit'>('create');
    const [selectedUser, setSelectedUser] = useState<User | null>(null);
    const [formData, setFormData] = useState({
        Email: '',
        FullName: '',
        Phone: '',
        RoleID: '',
        BranchID: '',
        IsActive: true,
    });
    const [isSaving, setIsSaving] = useState(false);
    const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

    useEffect(() => {
        fetchData();
    }, []);

    const fetchData = async () => {
        try {
            const [usersRes, rolesRes, branchesRes] = await Promise.all([
                fetch('/api/users'),
                fetch('/api/roles'),
                fetch('/api/branches'),
            ]);

            const usersData = await usersRes.json();
            const rolesData = await rolesRes.json();
            const branchesData = await branchesRes.json();

            if (usersData.success) setUsers(usersData.data);
            if (rolesData.success) setRoles(rolesData.data);
            if (branchesData.success) setBranches(branchesData.data);
        } catch (error) {
            console.error('Error fetching data:', error);
        } finally {
            setIsLoading(false);
        }
    };

    const handleSearch = async () => {
        setIsLoading(true);
        try {
            const res = await fetch(`/api/users?search=${encodeURIComponent(search)}`);
            const data = await res.json();
            if (data.success) setUsers(data.data);
        } catch (error) {
            console.error('Error searching:', error);
        } finally {
            setIsLoading(false);
        }
    };

    const openCreateModal = () => {
        setFormData({
            Email: '',
            FullName: '',
            Phone: '',
            RoleID: roles[0]?.RoleID?.toString() || '',
            BranchID: '',
            IsActive: true,
        });
        setModalMode('create');
        setSelectedUser(null);
        setShowModal(true);
        setMessage(null);
    };

    const openEditModal = (user: User) => {
        setFormData({
            Email: user.Email,
            FullName: user.FullName,
            Phone: user.Phone || '',
            RoleID: user.RoleID.toString(),
            BranchID: user.BranchID?.toString() || '',
            IsActive: user.IsActive,
        });
        setModalMode('edit');
        setSelectedUser(user);
        setShowModal(true);
        setMessage(null);
    };

    const handleSave = async () => {
        setIsSaving(true);
        setMessage(null);

        try {
            const url = modalMode === 'create' ? '/api/users' : `/api/users/${selectedUser?.UserID}`;
            const method = modalMode === 'create' ? 'POST' : 'PUT';

            const res = await fetch(url, {
                method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(formData),
            });

            const data = await res.json();

            if (data.success) {
                setMessage({ type: 'success', text: data.message || 'สำเร็จ' });
                fetchData();
                setTimeout(() => setShowModal(false), 1500);
            } else {
                setMessage({ type: 'error', text: data.error || 'เกิดข้อผิดพลาด' });
            }
        } catch (error) {
            setMessage({ type: 'error', text: 'เกิดข้อผิดพลาดในการบันทึก' });
        } finally {
            setIsSaving(false);
        }
    };

    const handleDelete = async (user: User) => {
        if (!confirm(`ต้องการลบผู้ใช้ "${user.FullName}" หรือไม่?`)) return;

        try {
            const res = await fetch(`/api/users/${user.UserID}`, { method: 'DELETE' });
            const data = await res.json();

            if (data.success) {
                fetchData();
            } else {
                alert(data.error || 'เกิดข้อผิดพลาด');
            }
        } catch (error) {
            alert('เกิดข้อผิดพลาดในการลบ');
        }
    };

    const handleResetPassword = async (user: User) => {
        if (!confirm(`ต้องการรีเซ็ตรหัสผ่านของ "${user.FullName}" หรือไม่?`)) return;

        try {
            const res = await fetch(`/api/users/${user.UserID}/reset-password`, { method: 'POST' });
            const data = await res.json();

            if (data.success) {
                alert(data.message);
            } else {
                alert(data.error || 'เกิดข้อผิดพลาด');
            }
        } catch (error) {
            alert('เกิดข้อผิดพลาดในการรีเซ็ตรหัสผ่าน');
        }
    };

    if (isLoading) return <LoadingPage />;

    return (
        <>
            <Header title="จัดการผู้ใช้" subtitle="เพิ่ม แก้ไข และลบผู้ใช้งานในระบบ" />

            <div className="mt-6 space-y-6">
                {/* Actions Bar */}
                <div className="flex flex-wrap items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                        <Input
                            placeholder="ค้นหาชื่อหรืออีเมล..."
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                            className="w-64"
                        />
                        <Button onClick={handleSearch} variant="outline">
                            <Search className="w-4 h-4" />
                        </Button>
                    </div>
                    <Button onClick={openCreateModal} className="flex items-center gap-2">
                        <Plus className="w-4 h-4" />
                        เพิ่มผู้ใช้
                    </Button>
                </div>

                {/* Users Table */}
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <Users className="w-5 h-5" />
                            รายชื่อผู้ใช้ ({users.length} คน)
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="p-0">
                        <div className="overflow-x-auto">
                            <table className="w-full">
                                <thead className="bg-gray-50 border-b border-gray-200">
                                    <tr>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">ชื่อ</th>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">อีเมล</th>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">บทบาท</th>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">สาขา</th>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">สถานะ</th>
                                        <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">จัดการ</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-200">
                                    {users.map((user) => (
                                        <tr key={user.UserID} className="hover:bg-gray-50">
                                            <td className="px-6 py-4 whitespace-nowrap">
                                                <div className="font-medium text-gray-900">{user.FullName}</div>
                                                {user.Phone && <div className="text-xs text-gray-500">{user.Phone}</div>}
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap text-gray-600">
                                                {user.Email}
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap">
                                                <span className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${user.Role.RoleCode === 'ADMIN'
                                                        ? 'bg-purple-100 text-purple-700'
                                                        : 'bg-blue-100 text-blue-700'
                                                    }`}>
                                                    {user.Role.RoleName}
                                                </span>
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap text-gray-600">
                                                {user.Branch?.BranchName || '-'}
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap">
                                                {user.IsActive ? (
                                                    <span className="inline-flex items-center gap-1 text-green-600">
                                                        <Check className="w-4 h-4" /> ใช้งาน
                                                    </span>
                                                ) : (
                                                    <span className="inline-flex items-center gap-1 text-red-600">
                                                        <Ban className="w-4 h-4" /> ระงับ
                                                    </span>
                                                )}
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap text-right">
                                                <div className="flex items-center justify-end gap-2">
                                                    <button
                                                        onClick={() => handleResetPassword(user)}
                                                        className="p-2 text-yellow-600 hover:bg-yellow-50 rounded-lg"
                                                        title="รีเซ็ตรหัสผ่าน"
                                                    >
                                                        <Key className="w-4 h-4" />
                                                    </button>
                                                    <button
                                                        onClick={() => openEditModal(user)}
                                                        className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg"
                                                        title="แก้ไข"
                                                    >
                                                        <Pencil className="w-4 h-4" />
                                                    </button>
                                                    <button
                                                        onClick={() => handleDelete(user)}
                                                        className="p-2 text-red-600 hover:bg-red-50 rounded-lg"
                                                        title="ลบ"
                                                    >
                                                        <Trash2 className="w-4 h-4" />
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Modal */}
            {showModal && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                    <div className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4">
                        <div className="flex items-center justify-between p-6 border-b border-gray-200">
                            <h3 className="text-lg font-semibold text-gray-900">
                                {modalMode === 'create' ? 'เพิ่มผู้ใช้ใหม่' : 'แก้ไขผู้ใช้'}
                            </h3>
                            <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-gray-600">
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        <div className="p-6 space-y-4">
                            {message && (
                                <div className={`p-3 rounded-lg text-sm ${message.type === 'success' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
                                    }`}>
                                    {message.text}
                                </div>
                            )}

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">อีเมล</label>
                                <Input
                                    type="email"
                                    value={formData.Email}
                                    onChange={(e) => setFormData({ ...formData, Email: e.target.value })}
                                    disabled={modalMode === 'edit'}
                                    placeholder="user@example.com"
                                />
                                {modalMode === 'create' && (
                                    <p className="text-xs text-gray-500 mt-1">
                                        รหัสผ่านเริ่มต้นจะเป็นชื่อก่อน @ เช่น admin@demo.com = admin
                                    </p>
                                )}
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">ชื่อ-นามสกุล</label>
                                <Input
                                    value={formData.FullName}
                                    onChange={(e) => setFormData({ ...formData, FullName: e.target.value })}
                                    placeholder="ชื่อ นามสกุล"
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">เบอร์โทร</label>
                                <Input
                                    value={formData.Phone}
                                    onChange={(e) => setFormData({ ...formData, Phone: e.target.value })}
                                    placeholder="08x-xxx-xxxx"
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">บทบาท</label>
                                <select
                                    value={formData.RoleID}
                                    onChange={(e) => setFormData({ ...formData, RoleID: e.target.value })}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                >
                                    {roles.map((role) => (
                                        <option key={role.RoleID} value={role.RoleID}>
                                            {role.RoleName}
                                        </option>
                                    ))}
                                </select>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">สาขา</label>
                                <select
                                    value={formData.BranchID}
                                    onChange={(e) => setFormData({ ...formData, BranchID: e.target.value })}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                >
                                    <option value="">ไม่ระบุ</option>
                                    {branches.map((branch) => (
                                        <option key={branch.BranchID} value={branch.BranchID}>
                                            {branch.BranchName}
                                        </option>
                                    ))}
                                </select>
                            </div>

                            {modalMode === 'edit' && (
                                <div className="flex items-center gap-2">
                                    <input
                                        type="checkbox"
                                        id="isActive"
                                        checked={formData.IsActive}
                                        onChange={(e) => setFormData({ ...formData, IsActive: e.target.checked })}
                                        className="w-4 h-4 text-blue-600 rounded"
                                    />
                                    <label htmlFor="isActive" className="text-sm text-gray-700">เปิดใช้งาน</label>
                                </div>
                            )}
                        </div>

                        <div className="flex justify-end gap-3 p-6 border-t border-gray-200">
                            <Button variant="outline" onClick={() => setShowModal(false)}>
                                ยกเลิก
                            </Button>
                            <Button onClick={handleSave} disabled={isSaving}>
                                {isSaving ? 'กำลังบันทึก...' : 'บันทึก'}
                            </Button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
