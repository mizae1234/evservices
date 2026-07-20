// Create New Claim Page
// Form for creating a new service claim (supports pre-filling from booking queue)

'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button, LoadingPage } from '@/components/ui';
import { Header } from '@/components/layouts';
import ClaimForm, { ClaimFormData } from '@/components/claims/ClaimForm';
import { ArrowLeft } from 'lucide-react';

function NewClaimPageContent() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const bookingId = searchParams.get('bookingId');

    const [isSaving, setIsSaving] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [submitError, setSubmitError] = useState<string | null>(null);
    const [initialFormData, setInitialFormData] = useState<Partial<ClaimFormData> | null>(null);

    useEffect(() => {
        if (bookingId) {
            fetchBookingDetail(bookingId);
        }
    }, [bookingId]);

    const fetchBookingDetail = async (id: string) => {
        setIsLoading(true);
        try {
            const res = await fetch(`/api/bookings/${id}`);
            const data = await res.json();
            if (data.success) {
                const b = data.data;
                setInitialFormData({
                    ServiceDate: b.BookingDate ? new Date(b.BookingDate).toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
                    CustomerName: b.CustomerName || '',
                    CarModel: b.CarModel || '',
                    CarRegister: b.CarRegister || '',
                    VinNo: b.VinNo || '',
                    ProjectType: b.ProjectType || '',
                    InventoryItemID: b.InventoryItemID || null,
                    ClaimDetail: b.ClaimDetail || '',
                    Amount: '',
                    IsCheckMileage: b.ServiceType ? b.ServiceType.RequiresMileage : true,
                    Mileage: b.Mileage?.toString() || '',
                    LastMileage: b.LastMileage?.toString() || '',
                    BranchID: b.BranchID?.toString() || '',
                    BookingType: b.BookingType || 'EV7',
                });
            } else {
                setSubmitError('ไม่สามารถโหลดข้อมูลการจองคิวได้');
            }
        } catch (err) {
            console.error('Error fetching booking detail:', err);
            setSubmitError('เกิดข้อผิดพลาดในการดึงข้อมูลการจองคิว');
        } finally {
            setIsLoading(false);
        }
    };

    const handleSubmit = async (formData: ClaimFormData, files: File[], submitNow: boolean) => {
        setIsSaving(true);
        setSubmitError(null);
        try {
            // 1. สร้าง Claim ก่อน (ไม่ต้องส่ง file paths)
            const res = await fetch('/api/claims', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    ...formData,
                    submitNow,
                }),
            });

            const data = await res.json();

            if (!data.success) {
                setSubmitError(data.error || 'เกิดข้อผิดพลาด');
                setIsSaving(false);
                return;
            }

            const claimId = data.data.ClaimID;

            // 2. Upload files ไป S3 และบันทึกลง CM_ClaimFile (ถ้ามี)
            if (files.length > 0) {
                const uploadFormData = new FormData();
                files.forEach((file) => {
                    uploadFormData.append('files', file);
                });
                uploadFormData.append('claimId', claimId.toString());

                const uploadRes = await fetch('/api/claims/files', {
                    method: 'POST',
                    body: uploadFormData,
                });

                const uploadData = await uploadRes.json();

                if (!uploadData.success) {
                    console.error('File upload error:', uploadData.message);
                }
            }

            // 3. ถ้าแปลงมาจากใบจองคิว ให้บันทึกการแปลงและเปลี่ยนสถานะคิวเป็นเปิดใบเคลมแล้ว (Status = 3)
            if (bookingId) {
                await fetch(`/api/bookings/${bookingId}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        status: 3, // Claimed
                        claimId: claimId,
                    }),
                });
            }

            router.push('/service-center/claims');
        } catch (error) {
            console.error('Error creating claim:', error);
            setSubmitError('เกิดข้อผิดพลาดในการสร้างใบงาน');
        } finally {
            setIsSaving(false);
        }
    };

    if (isLoading) return <LoadingPage />;

    return (
        <>
            <Header title="สร้างใบงานใหม่" subtitle="กรอกข้อมูลเพื่อสร้างรายการใบงาน" />

            <div className="mt-6 max-w-4xl">
                <Button
                    variant="ghost"
                    onClick={() => router.back()}
                    className="mb-4"
                >
                    <ArrowLeft className="w-4 h-4 mr-2" />
                    กลับ
                </Button>

                <ClaimForm
                    initialData={initialFormData || undefined}
                    onSubmit={handleSubmit}
                    isSaving={isSaving}
                    submitError={submitError}
                />
            </div>
        </>
    );
}

export default function NewClaimPage() {
    return (
        <Suspense fallback={<LoadingPage />}>
            <NewClaimPageContent />
        </Suspense>
    );
}
