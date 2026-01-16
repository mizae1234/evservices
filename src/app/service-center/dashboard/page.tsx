// Service Center Dashboard
// Shows claim statistics and recent activity

'use client';

import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle, StatusBadge, LoadingPage, Button, Input } from '@/components/ui';
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
    Calendar,
    Search,
    X,
} from 'lucide-react';

export default function DashboardPage() {
    const { data: session } = useSession();
    const [stats, setStats] = useState<DashboardStats | null>(null);
    const [recentClaims, setRecentClaims] = useState<Claim[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    // Date range filter state
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');

    useEffect(() => {
        fetchData();
    }, []);

    const fetchData = async (start?: string, end?: string) => {
        setIsLoading(true);
        try {
            // Build query params for stats
            const statsParams = new URLSearchParams();
            if (start) statsParams.set('startDate', start);
            if (end) statsParams.set('endDate', end);

            const statsUrl = `/api/dashboard/stats${statsParams.toString() ? '?' + statsParams.toString() : ''}`;

            const [statsRes, claimsRes] = await Promise.all([
                fetch(statsUrl),
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

    const handleSearch = () => {
        fetchData(startDate, endDate);
    };

    const handleClearFilter = () => {
        setStartDate('');
        setEndDate('');
        fetchData();
    };

    if (isLoading && !stats) return <LoadingPage />;

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
                {/* Date Range Filter */}
                <Card>
                    <CardContent className="p-4">
                        <div className="flex flex-wrap items-end gap-4">
                            <div className="flex items-center gap-2">
                                <Calendar className="w-5 h-5 text-gray-500" />
                                <span className="text-sm font-medium text-gray-700">ช่วงวันที่:</span>
                            </div>
                            <div className="flex flex-wrap items-center gap-3">
                                <div>
                                    <label className="block text-xs text-gray-500 mb-1">วันที่เริ่มต้น</label>
                                    <Input
                                        type="date"
                                        value={startDate}
                                        onChange={(e) => setStartDate(e.target.value)}
                                        className="w-40"
                                    />
                                </div>
                                <span className="text-gray-400 mt-5">-</span>
                                <div>
                                    <label className="block text-xs text-gray-500 mb-1">วันที่สิ้นสุด</label>
                                    <Input
                                        type="date"
                                        value={endDate}
                                        onChange={(e) => setEndDate(e.target.value)}
                                        className="w-40"
                                    />
                                </div>
                                <div className="flex gap-2 mt-5">
                                    <Button
                                        onClick={handleSearch}
                                        disabled={isLoading}
                                        className="flex items-center gap-2"
                                    >
                                        <Search className="w-4 h-4" />
                                        ค้นหา
                                    </Button>
                                    {(startDate || endDate) && (
                                        <Button
                                            variant="outline"
                                            onClick={handleClearFilter}
                                            className="flex items-center gap-2"
                                        >
                                            <X className="w-4 h-4" />
                                            ล้างตัวกรอง
                                        </Button>
                                    )}
                                </div>
                            </div>
                        </div>
                        {(startDate || endDate) && (
                            <div className="mt-3 text-sm text-blue-600">
                                แสดงข้อมูล: {startDate ? formatDate(new Date(startDate)) : 'ไม่จำกัด'} ถึง {endDate ? formatDate(new Date(endDate)) : 'ปัจจุบัน'}
                            </div>
                        )}
                    </CardContent>
                </Card>

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
