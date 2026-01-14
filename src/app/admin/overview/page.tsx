// Admin Dashboard
// Overview of all claims across branches

'use client';

import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle, StatusBadge, LoadingPage } from '@/components/ui';
import { Header } from '@/components/layouts';
import { formatDate, formatCurrency } from '@/lib/utils';
import { DashboardStats, Claim } from '@/types';
import {
    FileText,
    Clock,
    CheckCircle,
    XCircle,
    AlertCircle,
    TrendingUp,
    Building,
    ArrowRight,
} from 'lucide-react';

export default function AdminDashboardPage() {
    const { data: session } = useSession();
    const [stats, setStats] = useState<DashboardStats | null>(null);
    const [pendingClaims, setPendingClaims] = useState<Claim[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        fetchData();
    }, []);

    const fetchData = async () => {
        try {
            const [statsRes, claimsRes] = await Promise.all([
                fetch('/api/dashboard/stats'),
                fetch('/api/claims?status=1&pageSize=5'),
            ]);

            const statsData = await statsRes.json();
            const claimsData = await claimsRes.json();

            if (statsData.success) setStats(statsData.data);
            if (claimsData.success) setPendingClaims(claimsData.data);
        } catch (error) {
            console.error('Error fetching dashboard data:', error);
        } finally {
            setIsLoading(false);
        }
    };

    if (isLoading) return <LoadingPage />;

    const statCards = [
        {
            label: 'เคลมทั้งหมด',
            value: stats?.total || 0,
            icon: FileText,
            color: 'text-blue-600',
            bgColor: 'bg-blue-100',
        },
        {
            label: 'รออนุมัติ',
            value: stats?.pending || 0,
            icon: Clock,
            color: 'text-yellow-600',
            bgColor: 'bg-yellow-100',
            highlight: true,
        },
        {
            label: 'อนุมัติแล้ว',
            value: stats?.approved || 0,
            icon: CheckCircle,
            color: 'text-green-600',
            bgColor: 'bg-green-100',
        },
        {
            label: 'ปฏิเสธ',
            value: stats?.rejected || 0,
            icon: XCircle,
            color: 'text-red-600',
            bgColor: 'bg-red-100',
        },
        {
            label: 'ขอข้อมูลเพิ่ม',
            value: stats?.needInfo || 0,
            icon: AlertCircle,
            color: 'text-purple-600',
            bgColor: 'bg-purple-100',
        },
    ];

    return (
        <>
            <Header
                title="Admin Dashboard"
                subtitle="ภาพรวมระบบ EV Services"
            />

            <div className="mt-6 space-y-6">
                {/* Stats Cards */}
                <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4">
                    {statCards.map((stat) => (
                        <Card
                            key={stat.label}
                            className={`hover:shadow-md transition-shadow ${stat.highlight ? 'ring-2 ring-yellow-400' : ''
                                }`}
                        >
                            <CardContent className="p-6">
                                <div className="flex items-center gap-4">
                                    <div className={`p-3 rounded-xl ${stat.bgColor}`}>
                                        <stat.icon className={`w-6 h-6 ${stat.color}`} />
                                    </div>
                                    <div>
                                        <p className="text-2xl font-bold text-gray-900">{stat.value}</p>
                                        <p className="text-sm text-gray-500">{stat.label}</p>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    ))}
                </div>

                {/* Quick Stats & Pending Claims */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    {/* Summary */}
                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <TrendingUp className="w-5 h-5" />
                                สรุป
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="space-y-4">
                                <div className="flex items-center justify-between">
                                    <span className="text-gray-600">อัตราการอนุมัติ</span>
                                    <span className="font-bold text-green-600">
                                        {stats && stats.total > 0
                                            ? Math.round((stats.approved / stats.total) * 100)
                                            : 0}
                                        %
                                    </span>
                                </div>
                                <div className="flex items-center justify-between">
                                    <span className="text-gray-600">รอดำเนินการ</span>
                                    <span className="font-bold text-yellow-600">
                                        {stats?.pending || 0} รายการ
                                    </span>
                                </div>
                                <div className="flex items-center justify-between">
                                    <span className="text-gray-600">ต้องติดตาม</span>
                                    <span className="font-bold text-purple-600">
                                        {stats?.needInfo || 0} รายการ
                                    </span>
                                </div>
                            </div>

                            <Link
                                href="/admin/approvals"
                                className="mt-6 flex items-center justify-center gap-2 w-full py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                            >
                                ไปยังหน้าอนุมัติ
                                <ArrowRight className="w-4 h-4" />
                            </Link>
                        </CardContent>
                    </Card>

                    {/* Pending Claims */}
                    <Card className="lg:col-span-2">
                        <CardHeader className="flex flex-row items-center justify-between">
                            <CardTitle className="flex items-center gap-2">
                                <Clock className="w-5 h-5 text-yellow-500" />
                                รออนุมัติ
                            </CardTitle>
                            <Link
                                href="/admin/approvals?status=1"
                                className="text-sm text-blue-600 hover:underline"
                            >
                                ดูทั้งหมด
                            </Link>
                        </CardHeader>
                        <CardContent>
                            {pendingClaims.length === 0 ? (
                                <div className="text-center py-8">
                                    <CheckCircle className="w-12 h-12 text-green-300 mx-auto mb-3" />
                                    <p className="text-gray-500">ไม่มีเคลมรออนุมัติ</p>
                                </div>
                            ) : (
                                <div className="space-y-3">
                                    {pendingClaims.map((claim) => (
                                        <Link
                                            key={claim.ClaimID}
                                            href={`/admin/approvals/${claim.ClaimID}`}
                                            className="flex items-center justify-between p-4 bg-yellow-50 hover:bg-yellow-100 rounded-xl transition-colors border border-yellow-100"
                                        >
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-2">
                                                    <p className="font-medium text-gray-900">{claim.ClaimNo}</p>
                                                    <StatusBadge status={claim.Status} />
                                                </div>
                                                <p className="text-sm text-gray-600 truncate">
                                                    {claim.CustomerName} • {claim.CarRegister}
                                                </p>
                                                <div className="flex items-center gap-1 mt-1 text-xs text-gray-500">
                                                    <Building className="w-3 h-3" />
                                                    {claim.Branch?.BranchName}
                                                </div>
                                            </div>
                                            <div className="text-right ml-4">
                                                <p className="font-bold text-gray-900">
                                                    {formatCurrency(Number(claim.Amount))}
                                                </p>
                                                <p className="text-xs text-gray-500">
                                                    {formatDate(claim.ClaimDate)}
                                                </p>
                                            </div>
                                        </Link>
                                    ))}
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </div>
            </div>
        </>
    );
}
