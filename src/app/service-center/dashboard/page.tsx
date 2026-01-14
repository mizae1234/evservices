// Service Center Dashboard
// Shows claim statistics and recent activity

'use client';

import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle, StatusBadge, LoadingPage } from '@/components/ui';
import { Header } from '@/components/layouts';
import { formatDate, formatCurrency } from '@/lib/utils';
import { DashboardStats, Claim, CLAIM_STATUS } from '@/types';
import {
    FileText,
    Clock,
    CheckCircle,
    XCircle,
    AlertCircle,
    Plus,
    ArrowRight,
    Download,
} from 'lucide-react';

export default function DashboardPage() {
    const { data: session } = useSession();
    const [stats, setStats] = useState<DashboardStats | null>(null);
    const [recentClaims, setRecentClaims] = useState<Claim[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        fetchData();
    }, []);

    const fetchData = async () => {
        try {
            const [statsRes, claimsRes] = await Promise.all([
                fetch('/api/dashboard/stats'),
                fetch('/api/claims?pageSize=5'),
            ]);

            const statsData = await statsRes.json();
            const claimsData = await claimsRes.json();

            if (statsData.success) setStats(statsData.data);
            if (claimsData.success) setRecentClaims(claimsData.data);
        } catch (error) {
            console.error('Error fetching dashboard data:', error);
        } finally {
            setIsLoading(false);
        }
    };

    if (isLoading) return <LoadingPage />;

    const statCards = [
        {
            label: 'ใบงานทั้งหมด',
            value: stats?.total || 0,
            icon: FileText,
            color: 'bg-blue-500',
            bgColor: 'bg-blue-50',
        },
        {
            label: 'รออนุมัติ',
            value: stats?.pending || 0,
            icon: Clock,
            color: 'bg-yellow-500',
            bgColor: 'bg-yellow-50',
        },
        {
            label: 'อนุมัติแล้ว',
            value: stats?.approved || 0,
            icon: CheckCircle,
            color: 'bg-green-500',
            bgColor: 'bg-green-50',
        },
        {
            label: 'ปฏิเสธ',
            value: stats?.rejected || 0,
            icon: XCircle,
            color: 'bg-red-500',
            bgColor: 'bg-red-50',
        },
        {
            label: 'ขอข้อมูลเพิ่ม',
            value: stats?.needInfo || 0,
            icon: AlertCircle,
            color: 'bg-purple-500',
            bgColor: 'bg-purple-50',
        },
    ];

    return (
        <>
            <Header
                title={`สวัสดี, ${session?.user?.name}`}
                subtitle={session?.user?.branchName || 'EV Services'}
            />

            <div className="mt-6 space-y-6">
                {/* Stats Cards */}
                <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4">
                    {statCards.map((stat) => (
                        <Card key={stat.label} className="hover:shadow-md transition-shadow">
                            <CardContent className="p-6">
                                <div className="flex items-center gap-4">
                                    <div className={`p-3 rounded-xl ${stat.bgColor}`}>
                                        <stat.icon className={`w-6 h-6 text-${stat.color.replace('bg-', '')}`} />
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

                {/* Quick Actions & Recent Claims */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    {/* Quick Actions */}
                    <Card>
                        <CardHeader>
                            <CardTitle>ดำเนินการ</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <Link
                                href="/service-center/claims/new"
                                className="flex items-center gap-3 p-4 bg-blue-50 hover:bg-blue-100 rounded-xl transition-colors group"
                            >
                                <div className="p-3 bg-blue-600 rounded-lg">
                                    <Plus className="w-5 h-5 text-white" />
                                </div>
                                <div className="flex-1">
                                    <p className="font-medium text-gray-900">สร้างใบงานใหม่</p>
                                    <p className="text-sm text-gray-500">เพิ่มรายการใบงานบริการ</p>
                                </div>
                                <ArrowRight className="w-5 h-5 text-gray-400 group-hover:text-blue-600 transition-colors" />
                            </Link>

                            <Link
                                href="/service-center/claims"
                                className="flex items-center gap-3 p-4 mt-3 bg-gray-50 hover:bg-gray-100 rounded-xl transition-colors group"
                            >
                                <div className="p-3 bg-gray-600 rounded-lg">
                                    <FileText className="w-5 h-5 text-white" />
                                </div>
                                <div className="flex-1">
                                    <p className="font-medium text-gray-900">รายการใบงานทั้งหมด</p>
                                    <p className="text-sm text-gray-500">ดูและจัดการใบงาน</p>
                                </div>
                                <ArrowRight className="w-5 h-5 text-gray-400 group-hover:text-gray-600 transition-colors" />
                            </Link>
                        </CardContent>
                    </Card>

                    {/* Recent Claims */}
                    <Card className="lg:col-span-2">
                        <CardHeader className="flex flex-row items-center justify-between">
                            <CardTitle>ใบงานล่าสุด</CardTitle>
                            <Link
                                href="/service-center/claims"
                                className="text-sm text-blue-600 hover:underline"
                            >
                                ดูทั้งหมด
                            </Link>
                        </CardHeader>
                        <CardContent>
                            {recentClaims.length === 0 ? (
                                <p className="text-gray-500 text-center py-8">ยังไม่มีรายการใบงาน</p>
                            ) : (
                                <div className="space-y-3">
                                    {recentClaims.map((claim) => (
                                        <div
                                            key={claim.ClaimID}
                                            className="flex items-center justify-between p-4 bg-gray-50 hover:bg-gray-100 rounded-xl transition-colors"
                                        >
                                            <Link
                                                href={`/service-center/claims/${claim.ClaimID}`}
                                                className="flex-1 min-w-0"
                                            >
                                                <div className="flex items-center gap-2">
                                                    <p className="font-medium text-gray-900 truncate">
                                                        {claim.ClaimNo}
                                                    </p>
                                                    <StatusBadge status={claim.Status} />
                                                </div>
                                                <p className="text-sm text-gray-500 truncate">
                                                    {claim.CustomerName} • {claim.CarRegister}
                                                </p>
                                            </Link>
                                            <div className="flex items-center gap-3 ml-4">
                                                <div className="text-right">
                                                    <p className="font-medium text-gray-900">
                                                        {formatCurrency(Number(claim.Amount))}
                                                    </p>
                                                    <p className="text-xs text-gray-500">
                                                        {formatDate(claim.ClaimDate)}
                                                    </p>
                                                </div>
                                                {claim.Status === CLAIM_STATUS.APPROVED && (
                                                    <a
                                                        href={`/api/claims/${claim.ClaimID}/pdf`}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        onClick={(e) => e.stopPropagation()}
                                                        className="p-2 bg-green-100 hover:bg-green-200 rounded-lg transition-colors"
                                                        title="ดาวน์โหลดเอกสารอนุมัติ"
                                                    >
                                                        <Download className="w-4 h-4 text-green-600" />
                                                    </a>
                                                )}
                                            </div>
                                        </div>
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
