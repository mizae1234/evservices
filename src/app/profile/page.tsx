// User Profile Page
// Change password functionality

'use client';

export const dynamic = 'force-dynamic';

import { useState } from 'react';
import { useSession } from 'next-auth/react';
import { Card, CardContent, CardHeader, CardTitle, Button, Input, LoadingPage } from '@/components/ui';
import { Header } from '@/components/layouts';
import { User, Lock, Eye, EyeOff, Check } from 'lucide-react';

export default function ProfilePage() {
    const { data: session, status } = useSession();

    const [formData, setFormData] = useState({
        currentPassword: '',
        newPassword: '',
        confirmPassword: '',
    });
    const [showPasswords, setShowPasswords] = useState({
        current: false,
        new: false,
        confirm: false,
    });
    const [isLoading, setIsLoading] = useState(false);
    const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

    if (status === 'loading') return <LoadingPage />;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);
        setMessage(null);

        try {
            const res = await fetch('/api/users/change-password', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(formData),
            });

            const data = await res.json();

            if (data.success) {
                setMessage({ type: 'success', text: data.message });
                setFormData({ currentPassword: '', newPassword: '', confirmPassword: '' });
            } else {
                setMessage({ type: 'error', text: data.error });
            }
        } catch (error) {
            setMessage({ type: 'error', text: 'เกิดข้อผิดพลาดในการเปลี่ยนรหัสผ่าน' });
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <>
            <Header title="โปรไฟล์" subtitle="ข้อมูลส่วนตัวและเปลี่ยนรหัสผ่าน" />

            <div className="mt-6 max-w-2xl space-y-6">
                {/* User Info Card */}
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <User className="w-5 h-5" />
                            ข้อมูลผู้ใช้
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="space-y-4">
                            <div className="flex items-center gap-4">
                                <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center">
                                    <User className="w-8 h-8 text-blue-600" />
                                </div>
                                <div>
                                    <p className="text-lg font-semibold text-gray-900">{session?.user?.name}</p>
                                    <p className="text-gray-500">{session?.user?.email}</p>
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-4 pt-4 border-t border-gray-200">
                                <div>
                                    <p className="text-xs text-gray-500">บทบาท</p>
                                    <p className="font-medium text-gray-900">
                                        {session?.user?.role === 'ADMIN' ? 'ผู้ดูแลระบบ' : 'ศูนย์บริการ'}
                                    </p>
                                </div>
                                {session?.user?.branchName && (
                                    <div>
                                        <p className="text-xs text-gray-500">สาขา</p>
                                        <p className="font-medium text-gray-900">{session.user.branchName}</p>
                                    </div>
                                )}
                            </div>
                        </div>
                    </CardContent>
                </Card>

                {/* Change Password Card */}
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <Lock className="w-5 h-5" />
                            เปลี่ยนรหัสผ่าน
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <form onSubmit={handleSubmit} className="space-y-4">
                            {message && (
                                <div className={`p-3 rounded-lg text-sm flex items-center gap-2 ${message.type === 'success'
                                    ? 'bg-green-50 text-green-700'
                                    : 'bg-red-50 text-red-700'
                                    }`}>
                                    {message.type === 'success' && <Check className="w-4 h-4" />}
                                    {message.text}
                                </div>
                            )}

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    รหัสผ่านปัจจุบัน
                                </label>
                                <div className="relative">
                                    <Input
                                        type={showPasswords.current ? 'text' : 'password'}
                                        value={formData.currentPassword}
                                        onChange={(e) => setFormData({ ...formData, currentPassword: e.target.value })}
                                        placeholder="กรอกรหัสผ่านปัจจุบัน"
                                        required
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setShowPasswords({ ...showPasswords, current: !showPasswords.current })}
                                        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                                    >
                                        {showPasswords.current ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                    </button>
                                </div>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    รหัสผ่านใหม่
                                </label>
                                <div className="relative">
                                    <Input
                                        type={showPasswords.new ? 'text' : 'password'}
                                        value={formData.newPassword}
                                        onChange={(e) => setFormData({ ...formData, newPassword: e.target.value })}
                                        placeholder="กรอกรหัสผ่านใหม่ (อย่างน้อย 4 ตัวอักษร)"
                                        required
                                        minLength={4}
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setShowPasswords({ ...showPasswords, new: !showPasswords.new })}
                                        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                                    >
                                        {showPasswords.new ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                    </button>
                                </div>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    ยืนยันรหัสผ่านใหม่
                                </label>
                                <div className="relative">
                                    <Input
                                        type={showPasswords.confirm ? 'text' : 'password'}
                                        value={formData.confirmPassword}
                                        onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })}
                                        placeholder="กรอกรหัสผ่านใหม่อีกครั้ง"
                                        required
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setShowPasswords({ ...showPasswords, confirm: !showPasswords.confirm })}
                                        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                                    >
                                        {showPasswords.confirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                    </button>
                                </div>
                            </div>

                            <div className="pt-2">
                                <Button type="submit" disabled={isLoading} className="w-full">
                                    {isLoading ? 'กำลังบันทึก...' : 'เปลี่ยนรหัสผ่าน'}
                                </Button>
                            </div>

                            <p className="text-xs text-gray-500 text-center">
                                หากลืมรหัสผ่าน กรุณาติดต่อผู้ดูแลระบบเพื่อรีเซ็ตรหัสผ่าน
                            </p>
                        </form>
                    </CardContent>
                </Card>
            </div>
        </>
    );
}
