// Admin Claim Review Page
// Review and approve/reject claims

'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
    Card,
    CardContent,
    CardHeader,
    CardTitle,
    Button,
    Textarea,
    StatusBadge,
    Timeline,
    LoadingPage,
    ConfirmModal,
} from '@/components/ui';
import { Header } from '@/components/layouts';
import { formatDate, formatDateTime, formatCurrency } from '@/lib/utils';
import { Claim, CLAIM_STATUS } from '@/types';
import {
    ArrowLeft,
    Check,
    X,
    AlertCircle,
    FileText,
    Car,
    User,
    Calendar,
    DollarSign,
    Building,
    FileDown,
} from 'lucide-react';

export default function AdminClaimReviewPage() {
    const params = useParams();
    const router = useRouter();
    const [claim, setClaim] = useState<Claim | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isProcessing, setIsProcessing] = useState(false);
    const [note, setNote] = useState('');
    const [showApproveModal, setShowApproveModal] = useState(false);
    const [showRejectModal, setShowRejectModal] = useState(false);
    const [showInfoModal, setShowInfoModal] = useState(false);

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

    const handleApprove = async () => {
        if (!claim) return;
        setIsProcessing(true);

        try {
            const res = await fetch(`/api/claims/${claim.ClaimID}/approve`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ note }),
            });

            const data = await res.json();
            if (data.success) {
                setShowApproveModal(false);
                fetchClaim();
            }
        } catch (error) {
            console.error('Error approving claim:', error);
        } finally {
            setIsProcessing(false);
        }
    };

    const handleReject = async () => {
        if (!claim || !note.trim()) return;
        setIsProcessing(true);

        try {
            const res = await fetch(`/api/claims/${claim.ClaimID}/reject`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ note }),
            });

            const data = await res.json();
            if (data.success) {
                setShowRejectModal(false);
                fetchClaim();
            }
        } catch (error) {
            console.error('Error rejecting claim:', error);
        } finally {
            setIsProcessing(false);
        }
    };

    const handleRequestInfo = async () => {
        if (!claim || !note.trim()) return;
        setIsProcessing(true);

        try {
            const res = await fetch(`/api/claims/${claim.ClaimID}/request-info`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ note }),
            });

            const data = await res.json();
            if (data.success) {
                setShowInfoModal(false);
                fetchClaim();
            }
        } catch (error) {
            console.error('Error requesting info:', error);
        } finally {
            setIsProcessing(false);
        }
    };

    if (isLoading) return <LoadingPage />;

    if (!claim) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[400px]">
                <p className="text-gray-500 mb-4">ไม่พบเคลม</p>
                <Button onClick={() => router.back()}>กลับ</Button>
            </div>
        );
    }

    const claimStatus = Number(claim.Status);
    const canApprove = claimStatus === CLAIM_STATUS.PENDING;

    return (
        <>
            <Header title={`ตรวจสอบเคลม ${claim.ClaimNo}`} subtitle={formatDateTime(claim.ClaimDate)} />

            <div className="mt-6">
                <Button variant="ghost" onClick={() => router.back()} className="mb-4">
                    <ArrowLeft className="w-4 h-4 mr-2" />
                    กลับ
                </Button>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    {/* Main Content */}
                    <div className="lg:col-span-2 space-y-6">
                        {/* Status Card with Actions */}
                        <Card className={canApprove ? 'ring-2 ring-yellow-400' : ''}>
                            <CardContent className="p-6">
                                <div className="flex items-center justify-between mb-4">
                                    <div className="flex items-center gap-4">
                                        <div className="p-3 bg-blue-100 rounded-xl">
                                            <FileText className="w-6 h-6 text-blue-600" />
                                        </div>
                                        <div>
                                            <h2 className="text-xl font-bold text-gray-900">{claim.ClaimNo}</h2>
                                            <div className="flex items-center gap-2 mt-1 text-sm text-gray-500">
                                                <Building className="w-4 h-4" />
                                                {claim.Branch?.BranchName}
                                            </div>
                                        </div>
                                    </div>
                                    <StatusBadge status={claim.Status} />
                                </div>

                                {claim.ApprovalNote && claimStatus !== CLAIM_STATUS.PENDING && (
                                    <div className="mb-4 p-4 bg-gray-50 border border-gray-200 rounded-lg">
                                        <p className="text-sm font-medium text-gray-700">หมายเหตุ:</p>
                                        <p className="text-sm text-gray-600 mt-1">{claim.ApprovalNote}</p>
                                    </div>
                                )}

                                {canApprove && (
                                    <div className="flex gap-3 pt-4 border-t border-gray-100">
                                        <Button
                                            variant="primary"
                                            onClick={() => setShowApproveModal(true)}
                                            className="bg-green-600 hover:bg-green-700"
                                        >
                                            <Check className="w-4 h-4 mr-2" />
                                            อนุมัติ
                                        </Button>
                                        <Button
                                            variant="danger"
                                            onClick={() => {
                                                setNote('');
                                                setShowRejectModal(true);
                                            }}
                                        >
                                            <X className="w-4 h-4 mr-2" />
                                            ปฏิเสธ
                                        </Button>
                                        <Button
                                            variant="secondary"
                                            onClick={() => {
                                                setNote('');
                                                setShowInfoModal(true);
                                            }}
                                        >
                                            <AlertCircle className="w-4 h-4 mr-2" />
                                            ขอข้อมูลเพิ่ม
                                        </Button>
                                    </div>
                                )}

                                {claimStatus === CLAIM_STATUS.APPROVED && (
                                    <div className="flex gap-3 pt-4 border-t border-gray-100">
                                        <a
                                            href={`/api/claims/${claim.ClaimID}/pdf`}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="inline-flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                                        >
                                            <FileDown className="w-4 h-4" />
                                            พิมพ์เอกสารอนุมัติ
                                        </a>
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
                                        <div>
                                            <dt className="text-sm text-gray-500">ผู้สร้างเคลม</dt>
                                            <dd className="text-gray-700">{claim.Creator?.FullName}</dd>
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
                                    รายละเอียดเคลม
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
                                        <dd className="text-3xl font-bold text-gray-900">
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

            {/* Approve Modal */}
            <ConfirmModal
                isOpen={showApproveModal}
                onClose={() => setShowApproveModal(false)}
                onConfirm={handleApprove}
                title="ยืนยันการอนุมัติ"
                message={`ต้องการอนุมัติเคลม ${claim.ClaimNo} จำนวน ${formatCurrency(Number(claim.Amount))} หรือไม่?`}
                confirmText="อนุมัติ"
                variant="info"
                isLoading={isProcessing}
            />

            {/* Reject Modal */}
            {showRejectModal && (
                <div className="fixed inset-0 z-50 overflow-y-auto">
                    <div className="fixed inset-0 bg-black/50" onClick={() => setShowRejectModal(false)} />
                    <div className="flex min-h-full items-center justify-center p-4">
                        <div className="relative w-full max-w-md bg-white rounded-xl shadow-xl p-6">
                            <h3 className="text-lg font-semibold text-gray-900 mb-4">ปฏิเสธเคลม</h3>
                            <Textarea
                                label="เหตุผลในการปฏิเสธ"
                                value={note}
                                onChange={(e) => setNote(e.target.value)}
                                placeholder="กรุณาระบุเหตุผล..."
                                rows={4}
                                required
                            />
                            <div className="flex gap-3 mt-6 justify-end">
                                <Button variant="secondary" onClick={() => setShowRejectModal(false)}>
                                    ยกเลิก
                                </Button>
                                <Button
                                    variant="danger"
                                    onClick={handleReject}
                                    isLoading={isProcessing}
                                    disabled={!note.trim()}
                                >
                                    ปฏิเสธ
                                </Button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Request Info Modal */}
            {showInfoModal && (
                <div className="fixed inset-0 z-50 overflow-y-auto">
                    <div className="fixed inset-0 bg-black/50" onClick={() => setShowInfoModal(false)} />
                    <div className="flex min-h-full items-center justify-center p-4">
                        <div className="relative w-full max-w-md bg-white rounded-xl shadow-xl p-6">
                            <h3 className="text-lg font-semibold text-gray-900 mb-4">ขอข้อมูลเพิ่มเติม</h3>
                            <Textarea
                                label="ข้อมูลที่ต้องการ"
                                value={note}
                                onChange={(e) => setNote(e.target.value)}
                                placeholder="ระบุข้อมูลที่ต้องการเพิ่มเติม..."
                                rows={4}
                                required
                            />
                            <div className="flex gap-3 mt-6 justify-end">
                                <Button variant="secondary" onClick={() => setShowInfoModal(false)}>
                                    ยกเลิก
                                </Button>
                                <Button
                                    onClick={handleRequestInfo}
                                    isLoading={isProcessing}
                                    disabled={!note.trim()}
                                >
                                    ส่งคำขอ
                                </Button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
