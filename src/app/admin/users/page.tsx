// Admin Users Management Page
// Manage users - create, edit, delete, reset password, role filter, pagination

'use client';

import { useEffect, useState, useCallback } from 'react';
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
    Filter,
    ChevronLeft,
    ChevronRight,
    RotateCcw,
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
    const [isInitialLoading, setIsInitialLoading] = useState(true);
    const [isTableLoading, setIsTableLoading] = useState(false);

    // Filters
    const [search, setSearch] = useState('');
    const [selectedRole, setSelectedRole] = useState('all');
    const [selectedBranch, setSelectedBranch] = useState('all');
    const [selectedStatus, setSelectedStatus] = useState('all');

    // Pagination
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState<string | number>(20);
    const [total, setTotal] = useState(0);
    const [totalPages, setTotalPages] = useState(1);

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

    // Fetch master roles & branches once
    useEffect(() => {
        const fetchMaster = async () => {
            try {
                const [rolesRes, branchesRes] = await Promise.all([
                    fetch('/api/roles'),
                    fetch('/api/branches'),
                ]);
                const rolesData = await rolesRes.json();
                const branchesData = await branchesRes.json();

                if (rolesData.success) setRoles(rolesData.data);
                if (branchesData.success) setBranches(branchesData.data);
            } catch (error) {
                console.error('Error fetching master data:', error);
            }
        };
        fetchMaster();
    }, []);

    // Fetch users with current query parameters
    const fetchUsers = useCallback(async (
        searchTerm = search,
        roleId = selectedRole,
        branchId = selectedBranch,
        status = selectedStatus,
        pageNum = page,
        size = pageSize
    ) => {
        setIsTableLoading(true);
        try {
            const params = new URLSearchParams();
            if (searchTerm.trim()) params.set('search', searchTerm.trim());
            if (roleId && roleId !== 'all') params.set('roleId', roleId);
            if (branchId && branchId !== 'all') params.set('branchId', branchId);
            if (status && status !== 'all') params.set('isActive', status);
            params.set('page', pageNum.toString());
            params.set('pageSize', size.toString());

            const res = await fetch(`/api/users?${params.toString()}`);
            const data = await res.json();

            if (data.success) {
                setUsers(data.data);
                setTotal(data.total || 0);
                setTotalPages(data.totalPages || 1);
            }
        } catch (error) {
            console.error('Error fetching users:', error);
        } finally {
            setIsTableLoading(false);
            setIsInitialLoading(false);
        }
    }, [search, selectedRole, selectedBranch, selectedStatus, page, pageSize]);

    // Initial and filter-change fetch
    useEffect(() => {
        fetchUsers(search, selectedRole, selectedBranch, selectedStatus, page, pageSize);
    }, [selectedRole, selectedBranch, selectedStatus, page, pageSize, fetchUsers]);

    const handleSearchSubmit = (e?: React.FormEvent) => {
        if (e) e.preventDefault();
        setPage(1);
        fetchUsers(search, selectedRole, selectedBranch, selectedStatus, 1, pageSize);
    };

    const handleResetFilters = () => {
        setSearch('');
        setSelectedRole('all');
        setSelectedBranch('all');
        setSelectedStatus('all');
        setPage(1);
        fetchUsers('', 'all', 'all', 'all', 1, pageSize);
    };

    const handlePageSizeChange = (newSize: string) => {
        const parsed = newSize === 'all' ? 'all' : parseInt(newSize);
        setPageSize(parsed);
        setPage(1);
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
                fetchUsers();
                setTimeout(() => setShowModal(false), 1200);
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
                fetchUsers();
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

    const getRoleBadgeStyle = (roleCode: string) => {
        switch (roleCode?.toUpperCase()) {
            case 'ADMIN':
                return 'bg-purple-100 text-purple-700 border-purple-200';
            case 'SERVICE_CENTER':
                return 'bg-blue-100 text-blue-700 border-blue-200';
            case 'CS':
                return 'bg-amber-100 text-amber-700 border-amber-200';
            case 'CS_LINEMAN':
                return 'bg-emerald-100 text-emerald-700 border-emerald-200';
            default:
                return 'bg-gray-100 text-gray-700 border-gray-200';
        }
    };

    if (isInitialLoading) return <LoadingPage />;

    const hasActiveFilters = search.trim() !== '' || selectedRole !== 'all' || selectedBranch !== 'all' || selectedStatus !== 'all';
    const isAllMode = pageSize === 'all' || pageSize === 0;
    const currentFrom = total > 0 ? (page - 1) * (typeof pageSize === 'number' ? pageSize : total) + 1 : 0;
    const currentTo = isAllMode ? total : Math.min(page * (typeof pageSize === 'number' ? pageSize : total), total);

    return (
        <>
            <Header title="จัดการผู้ใช้" subtitle="เพิ่ม แก้ไข จัดการสิทธิ์ และดูรายชื่อผู้ใช้งานทั้งหมดในระบบ" />

            <div className="mt-6 space-y-6">
                {/* Actions & Filters Bar */}
                <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm space-y-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                        {/* Search & Filters */}
                        <div className="flex flex-wrap items-center gap-3 flex-1">
                            {/* Search */}
                            <form onSubmit={handleSearchSubmit} className="flex items-center gap-1.5 min-w-[240px] max-w-sm">
                                <div className="relative w-full">
                                    <Input
                                        placeholder="ค้นหาชื่อ, อีเมล หรือเบอร์โทร..."
                                        value={search}
                                        onChange={(e) => setSearch(e.target.value)}
                                        className="pr-8 text-sm"
                                    />
                                    {search && (
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setSearch('');
                                                setPage(1);
                                                fetchUsers('', selectedRole, selectedBranch, selectedStatus, 1, pageSize);
                                            }}
                                            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                                        >
                                            <X className="w-4 h-4" />
                                        </button>
                                    )}
                                </div>
                                <Button type="submit" variant="outline" size="sm" className="h-10 px-3">
                                    <Search className="w-4 h-4" />
                                </Button>
                            </form>

                            {/* Role Filter */}
                            <div className="flex items-center gap-1.5">
                                <Filter className="w-4 h-4 text-gray-500 hidden sm:inline" />
                                <select
                                    value={selectedRole}
                                    onChange={(e) => {
                                        setSelectedRole(e.target.value);
                                        setPage(1);
                                    }}
                                    className="border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white font-medium text-gray-700 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                >
                                    <option value="all">ทุกบทบาท (Role)</option>
                                    {roles.map((role) => (
                                        <option key={role.RoleID} value={role.RoleID.toString()}>
                                            {role.RoleName} ({role.RoleCode})
                                        </option>
                                    ))}
                                </select>
                            </div>

                            {/* Branch Filter */}
                            <div className="flex items-center gap-1.5">
                                <select
                                    value={selectedBranch}
                                    onChange={(e) => {
                                        setSelectedBranch(e.target.value);
                                        setPage(1);
                                    }}
                                    className="border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white font-medium text-gray-700 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                >
                                    <option value="all">ทุกสาขา (Branch)</option>
                                    {branches.map((b) => (
                                        <option key={b.BranchID} value={b.BranchID.toString()}>
                                            {b.BranchName}
                                        </option>
                                    ))}
                                </select>
                            </div>

                            {/* Status Filter */}
                            <div className="flex items-center gap-1.5">
                                <select
                                    value={selectedStatus}
                                    onChange={(e) => {
                                        setSelectedStatus(e.target.value);
                                        setPage(1);
                                    }}
                                    className="border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white font-medium text-gray-700 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                >
                                    <option value="all">ทุกสถานะ</option>
                                    <option value="true">เปิดใช้งาน</option>
                                    <option value="false">ระงับการใช้งาน</option>
                                </select>
                            </div>

                            {/* Reset Button */}
                            {hasActiveFilters && (
                                <Button
                                    onClick={handleResetFilters}
                                    variant="ghost"
                                    size="sm"
                                    className="text-xs text-gray-500 hover:text-gray-700 flex items-center gap-1 h-9"
                                    title="ล้างตัวกรองทั้งหมด"
                                >
                                    <RotateCcw className="w-3.5 h-3.5" />
                                    ล้างตัวกรอง
                                </Button>
                            )}
                        </div>

                        {/* Add User Button */}
                        <Button onClick={openCreateModal} className="flex items-center gap-2 shrink-0">
                            <Plus className="w-4 h-4" />
                            เพิ่มผู้ใช้
                        </Button>
                    </div>
                </div>

                {/* Users Table */}
                <Card>
                    <CardHeader className="py-4 px-6 border-b border-gray-200">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                            <CardTitle className="flex items-center gap-2 text-base font-semibold text-gray-900">
                                <Users className="w-5 h-5 text-blue-600" />
                                รายชื่อผู้ใช้ ({total} คน)
                                {selectedRole !== 'all' && (
                                    <span className="text-xs font-normal px-2.5 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200">
                                        กรองตาม: {roles.find(r => r.RoleID.toString() === selectedRole)?.RoleName}
                                    </span>
                                )}
                            </CardTitle>
                        </div>
                    </CardHeader>
                    <CardContent className="p-0">
                        <div className="overflow-x-auto relative">
                            {isTableLoading && (
                                <div className="absolute inset-0 bg-white/60 backdrop-blur-[1px] flex items-center justify-center z-10">
                                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                                </div>
                            )}

                            <table className="w-full">
                                <thead className="bg-gray-50 border-b border-gray-200">
                                    <tr>
                                        <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">ชื่อ - นามสกุล</th>
                                        <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">อีเมล</th>
                                        <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">บทบาท (Role)</th>
                                        <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">สาขา</th>
                                        <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">สถานะ</th>
                                        <th className="px-6 py-3 text-right text-xs font-semibold text-gray-600 uppercase tracking-wider">จัดการ</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-200">
                                    {users.length === 0 ? (
                                        <tr>
                                            <td colSpan={6} className="px-6 py-12 text-center text-gray-500">
                                                <Users className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                                                <p className="text-base font-medium text-gray-700">ไม่พบข้อมูลผู้ใช้</p>
                                                <p className="text-xs text-gray-400 mt-1">ลองเปลี่ยนเงื่อนไขค้นหาหรือตัวกรองบทบาท</p>
                                            </td>
                                        </tr>
                                    ) : (
                                        users.map((user) => (
                                            <tr key={user.UserID} className="hover:bg-gray-50 transition-colors">
                                                <td className="px-6 py-4 whitespace-nowrap">
                                                    <div className="font-medium text-gray-900">{user.FullName}</div>
                                                    {user.Phone && <div className="text-xs text-gray-500 mt-0.5">{user.Phone}</div>}
                                                </td>
                                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                                                    {user.Email}
                                                </td>
                                                <td className="px-6 py-4 whitespace-nowrap">
                                                    <span className={`inline-flex px-2.5 py-1 text-xs font-medium rounded-full border ${getRoleBadgeStyle(user.Role.RoleCode)}`}>
                                                        {user.Role.RoleName}
                                                    </span>
                                                </td>
                                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                                                    {user.Branch?.BranchName || '-'}
                                                </td>
                                                <td className="px-6 py-4 whitespace-nowrap">
                                                    {user.IsActive ? (
                                                        <span className="inline-flex items-center gap-1 text-xs font-medium text-green-700 bg-green-50 px-2 py-0.5 rounded-full border border-green-200">
                                                            <Check className="w-3.5 h-3.5 text-green-600" /> ใช้งาน
                                                        </span>
                                                    ) : (
                                                        <span className="inline-flex items-center gap-1 text-xs font-medium text-red-700 bg-red-50 px-2 py-0.5 rounded-full border border-red-200">
                                                            <Ban className="w-3.5 h-3.5 text-red-600" /> ระงับ
                                                        </span>
                                                    )}
                                                </td>
                                                <td className="px-6 py-4 whitespace-nowrap text-right">
                                                    <div className="flex items-center justify-end gap-1.5">
                                                        <button
                                                            onClick={() => handleResetPassword(user)}
                                                            className="p-1.5 text-yellow-600 hover:bg-yellow-50 rounded-lg transition-colors"
                                                            title="รีเซ็ตรหัสผ่าน"
                                                        >
                                                            <Key className="w-4 h-4" />
                                                        </button>
                                                        <button
                                                            onClick={() => openEditModal(user)}
                                                            className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                                                            title="แก้ไข"
                                                        >
                                                            <Pencil className="w-4 h-4" />
                                                        </button>
                                                        <button
                                                            onClick={() => handleDelete(user)}
                                                            className="p-1.5 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                                            title="ลบ"
                                                        >
                                                            <Trash2 className="w-4 h-4" />
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>

                        {/* Pagination Footer */}
                        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 px-6 py-4 border-t border-gray-200 bg-gray-50/70">
                            <div className="flex flex-wrap items-center gap-3 text-xs text-gray-500">
                                <span>
                                    {isAllMode ? (
                                        <>แสดงทั้งหมด <strong className="text-gray-900 font-bold">{total}</strong> คน</>
                                    ) : (
                                        <>
                                            แสดง <strong className="text-gray-800">{currentFrom}</strong> -{' '}
                                            <strong className="text-gray-800">{currentTo}</strong> จากทั้งหมด{' '}
                                            <strong className="text-gray-900 font-bold">{total}</strong> คน
                                        </>
                                    )}
                                </span>
                                <div className="flex items-center gap-1.5 border-l border-gray-300 pl-3">
                                    <span>แสดง</span>
                                    <select
                                        value={pageSize}
                                        onChange={(e) => handlePageSizeChange(e.target.value)}
                                        className="border border-gray-300 rounded px-2 py-1 text-xs text-gray-900 bg-white font-medium focus:ring-1 focus:ring-blue-500"
                                    >
                                        <option value={20}>20</option>
                                        <option value={50}>50</option>
                                        <option value={100}>100</option>
                                        <option value="all">ทั้งหมด</option>
                                    </select>
                                    <span>คนต่อหน้า</span>
                                </div>
                            </div>

                            {!isAllMode && totalPages > 1 && (
                                <div className="flex items-center gap-1.5">
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => setPage(p => Math.max(1, p - 1))}
                                        disabled={page <= 1}
                                        className="h-8 px-2.5 text-xs font-semibold"
                                    >
                                        <ChevronLeft className="w-4 h-4 mr-1" />
                                        ก่อนหน้า
                                    </Button>

                                    <span className="px-3 py-1 text-xs font-bold text-gray-700 bg-white border border-gray-200 rounded-lg">
                                        หน้า {page} / {totalPages}
                                    </span>

                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                                        disabled={page >= totalPages}
                                        className="h-8 px-2.5 text-xs font-semibold"
                                    >
                                        ถัดไป
                                        <ChevronRight className="w-4 h-4 ml-1" />
                                    </Button>
                                </div>
                            )}
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Modal */}
            {showModal && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden">
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
                                <div className={`p-3 rounded-lg text-sm ${message.type === 'success' ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'
                                    }`}>
                                    {message.text}
                                </div>
                            )}

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">อีเมล <span className="text-red-500">*</span></label>
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
                                <label className="block text-sm font-medium text-gray-700 mb-1">ชื่อ-นามสกุล <span className="text-red-500">*</span></label>
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
                                <label className="block text-sm font-medium text-gray-700 mb-1">บทบาท (Role) <span className="text-red-500">*</span></label>
                                <select
                                    value={formData.RoleID}
                                    onChange={(e) => setFormData({ ...formData, RoleID: e.target.value })}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                                >
                                    {roles.map((role) => (
                                        <option key={role.RoleID} value={role.RoleID}>
                                            {role.RoleName} ({role.RoleCode})
                                        </option>
                                    ))}
                                </select>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">สาขา</label>
                                <select
                                    value={formData.BranchID}
                                    onChange={(e) => setFormData({ ...formData, BranchID: e.target.value })}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
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
                                <div className="flex items-center gap-2 pt-1">
                                    <input
                                        type="checkbox"
                                        id="isActive"
                                        checked={formData.IsActive}
                                        onChange={(e) => setFormData({ ...formData, IsActive: e.target.checked })}
                                        className="w-4 h-4 text-blue-600 rounded"
                                    />
                                    <label htmlFor="isActive" className="text-sm text-gray-700 font-medium cursor-pointer">เปิดใช้งาน (Active)</label>
                                </div>
                            )}
                        </div>

                        <div className="flex justify-end gap-3 p-6 border-t border-gray-200 bg-gray-50">
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
