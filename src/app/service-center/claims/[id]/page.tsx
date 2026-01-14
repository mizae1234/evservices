// Claim Detail Page
// Shows claim details, status timeline, and actions

'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
    Card,
    CardContent,
    CardHeader,
    CardTitle,
    Button,
    StatusBadge,
    Timeline,
    LoadingPage,
} from '@/components/ui';
import { Header } from '@/components/layouts';
import { formatDate, formatDateTime, formatCurrency } from '@/lib/utils';
import { Claim, CLAIM_STATUS } from '@/types';
import { ArrowLeft, Edit, Send, FileText, Car, User, Calendar, DollarSign, Download } from 'lucide-react';

export default function ClaimDetailPage() {
    const params = useParams();
    const router = useRouter();
    const [claim, setClaim] = useState<Claim | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isSubmitting, setIsSubmitting] = useState(false);

    useEffect(() => {
        fetchClaim();
    }, [params.id]);

    const fetchClaim = async () => {
        try {
            const res = await fetch(`/api/claims/${params.id}`);
            const data = await res.json();
            if (data.success) {
                setClaim(data.data);
            }
        } catch (error) {
            console.error('Error fetching claim:', error);
        } finally {
            setIsLoading(false);
        }
    };

    const handleSubmit = async () => {
        if (!claim) return;
        setIsSubmitting(true);

        try {
            const res = await fetch(`/api/claims/${claim.ClaimID}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    ...claim,
                    submitNow: true,
                }),
            });

            const data = await res.json();
            if (data.success) {
                fetchClaim();
            }
        } catch (error) {
            console.error('Error submitting claim:', error);
        } finally {
            setIsSubmitting(false);
        }
    };

    if (isLoading) return <LoadingPage />;

    if (!claim) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[400px]">
                <p className="text-gray-500 mb-4">ไม่พบใบงาน</p>
                <Button onClick={() => router.back()}>กลับ</Button>
            </div>
        );
    }

    const canEdit = claim.Status === CLAIM_STATUS.DRAFT || claim.Status === CLAIM_STATUS.NEED_INFO;
    const canSubmit = claim.Status === CLAIM_STATUS.DRAFT || claim.Status === CLAIM_STATUS.NEED_INFO;

    return (
        <>
            <Header title={`ใบงาน ${claim.ClaimNo}`} subtitle={formatDateTime(claim.ClaimDate)} />

            <div className="mt-6">
                <Button variant="ghost" onClick={() => router.push('/service-center/dashboard')} className="mb-4">
                    <ArrowLeft className="w-4 h-4 mr-2" />
                    กลับ
                </Button>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    {/* Main Content */}
                    <div className="lg:col-span-2 space-y-6">
                        {/* Status Card */}
                        <Card>
                            <CardContent className="p-6">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-4">
                                        <div className="p-3 bg-blue-100 rounded-xl">
                                            <FileText className="w-6 h-6 text-blue-600" />
                                        </div>
                                        <div>
                                            <h2 className="text-xl font-bold text-gray-900">{claim.ClaimNo}</h2>
                                            <p className="text-gray-500">สร้างเมื่อ {formatDateTime(claim.ClaimDate)}</p>
                                        </div>
                                    </div>
                                    <StatusBadge status={claim.Status} />
                                </div>

                                {claim.ApprovalNote && (
                                    <div className="mt-4 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
                                        <p className="text-sm font-medium text-yellow-800">หมายเหตุจากผู้อนุมัติ:</p>
                                        <p className="text-sm text-yellow-700 mt-1">{claim.ApprovalNote}</p>
                                    </div>
                                )}

                                {(canEdit || canSubmit) && (
                                    <div className="mt-4 flex gap-3">
                                        {canEdit && (
                                            <Button
                                                variant="outline"
                                                onClick={() => router.push(`/service-center/claims/${claim.ClaimID}/edit`)}
                                            >
                                                <Edit className="w-4 h-4 mr-2" />
                                                แก้ไข
                                            </Button>
                                        )}
                                        {canSubmit && (
                                            <Button onClick={handleSubmit} isLoading={isSubmitting}>
                                                <Send className="w-4 h-4 mr-2" />
                                                ส่งเพื่ออนุมัติ
                                            </Button>
                                        )}
                                    </div>
                                )}

                                {/* Download Approval Document */}
                                {claim.Status === CLAIM_STATUS.APPROVED && (
                                    <div className="mt-4">
                                        <Button
                                            variant="primary"
                                            onClick={() => window.open(`/api/claims/${claim.ClaimID}/pdf`, '_blank')}
                                            className="bg-green-600 hover:bg-green-700"
                                        >
                                            <Download className="w-4 h-4 mr-2" />
                                            ดาวน์โหลดเอกสารอนุมัติ
                                        </Button>
                                    </div>
                                )}
                            </CardContent>
                        </Card>

                        {/* Customer & Vehicle Info */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <Card>
                                <CardHeader>
                                    <CardTitle className="flex items-center gap-2">
                                        <User className="w-5 h-5" />
                                        ข้อมูลลูกค้า
                                    </CardTitle>
                                </CardHeader>
                                <CardContent>
                                    <dl className="space-y-3">
                                        <div>
                                            <dt className="text-sm text-gray-500">ชื่อลูกค้า</dt>
                                            <dd className="font-medium text-gray-900">{claim.CustomerName}</dd>
                                        </div>
                                    </dl>
                                </CardContent>
                            </Card>

                            <Card>
                                <CardHeader>
                                    <CardTitle className="flex items-center gap-2">
                                        <Car className="w-5 h-5" />
                                        ข้อมูลรถยนต์
                                    </CardTitle>
                                </CardHeader>
                                <CardContent>
                                    <dl className="space-y-3">
                                        <div>
                                            <dt className="text-sm text-gray-500">รุ่นรถ</dt>
                                            <dd className="font-medium text-gray-900">{claim.CarModel}</dd>
                                        </div>
                                        <div>
                                            <dt className="text-sm text-gray-500">ทะเบียนรถ</dt>
                                            <dd className="font-medium text-gray-900">{claim.CarRegister}</dd>
                                        </div>
                                        {claim.IsCheckMileage && (
                                            <div className="flex gap-6">
                                                <div>
                                                    <dt className="text-sm text-gray-500">เลขไมล์ปัจจุบัน</dt>
                                                    <dd className="font-medium text-gray-900">
                                                        {claim.Mileage.toLocaleString()} กม.
                                                    </dd>
                                                </div>
                                                <div>
                                                    <dt className="text-sm text-gray-500">เลขไมล์ครั้งก่อน</dt>
                                                    <dd className="font-medium text-gray-900">
                                                        {claim.LastMileage.toLocaleString()} กม.
                                                    </dd>
                                                </div>
                                            </div>
                                        )}
                                    </dl>
                                </CardContent>
                            </Card>
                        </div>

                        {/* Claim Details */}
                        <Card>
                            <CardHeader>
                                <CardTitle className="flex items-center gap-2">
                                    <DollarSign className="w-5 h-5" />
                                    รายละเอียดงานบริการ
                                </CardTitle>
                            </CardHeader>
                            <CardContent>
                                <dl className="space-y-4">
                                    <div>
                                        <dt className="text-sm text-gray-500">รายละเอียด</dt>
                                        <dd className="mt-1 text-gray-900 whitespace-pre-wrap">
                                            {claim.ClaimDetail || '-'}
                                        </dd>
                                    </div>
                                    <div className="pt-4 border-t border-gray-100">
                                        <dt className="text-sm text-gray-500">จำนวนเงิน</dt>
                                        <dd className="text-2xl font-bold text-gray-900">
                                            {formatCurrency(Number(claim.Amount))}
                                        </dd>
                                    </div>
                                </dl>
                            </CardContent>
                        </Card>

                        {/* Attached Files */}
                        {claim.Files && claim.Files.length > 0 && (
                            <Card>
                                <CardHeader>
                                    <CardTitle>เอกสารแนบ ({claim.Files.length})</CardTitle>
                                </CardHeader>
                                <CardContent>
                                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                        {claim.Files.map((file) => (
                                            <a
                                                key={file.FileID}
                                                href={file.FilePath}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="p-4 bg-gray-50 rounded-lg text-center hover:bg-blue-50 hover:border-blue-200 border border-transparent transition-colors cursor-pointer"
                                            >
                                                <FileText className="w-8 h-8 text-gray-400 mx-auto mb-2" />
                                                <p className="text-sm text-gray-700 truncate">{file.FileName}</p>
                                                <p className="text-xs text-blue-600 mt-1">คลิกเพื่อดู</p>
                                            </a>
                                        ))}
                                    </div>
                                </CardContent>
                            </Card>
                        )}
                    </div>

                    {/* Timeline Sidebar */}
                    <div>
                        <Card>
                            <CardHeader>
                                <CardTitle className="flex items-center gap-2">
                                    <Calendar className="w-5 h-5" />
                                    ประวัติการดำเนินการ
                                </CardTitle>
                            </CardHeader>
                            <CardContent>
                                <Timeline logs={claim.Logs || []} />
                            </CardContent>
                        </Card>
                    </div>
                </div>
            </div>
        </>
    );
}
