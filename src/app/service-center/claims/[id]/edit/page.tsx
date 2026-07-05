// Edit Claim Page
// Edit an existing claim

'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { Button, LoadingPage } from '@/components/ui';
import { Header } from '@/components/layouts';
import ClaimForm, { ClaimFormData } from '@/components/claims/ClaimForm';
import { Claim, CLAIM_STATUS } from '@/types';
import { ArrowLeft } from 'lucide-react';

export default function EditClaimPage() {
    const params = useParams();
    const router = useRouter();
    const { data: session } = useSession();
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [claim, setClaim] = useState<Claim | null>(null);
    const [submitError, setSubmitError] = useState<string | null>(null);
    const [initialFormData, setInitialFormData] = useState<Partial<ClaimFormData> | null>(null);

    useEffect(() => {
        if (params.id) {
            fetchData();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [params.id]);

    const fetchData = async () => {
        try {
            const res = await fetch(`/api/claims/${params.id}`);
            const claimData = await res.json();

            if (claimData.success) {
                const c = claimData.data;
                setClaim(c);

                setInitialFormData({
                    ServiceDate: c.ServiceDate
                        ? new Date(c.ServiceDate).toISOString().split('T')[0]
                        : (c.ClaimDate ? new Date(c.ClaimDate).toISOString().split('T')[0] : ''),
                    CustomerName: c.CustomerName || '',
                    CarModel: c.CarModel || '',
                    CarRegister: c.CarRegister || '',
                    VinNo: c.VinNo || '',
                    ProjectType: c.ProjectType || '',
                    InventoryItemID: c.InventoryItemID || null,
                    ClaimDetail: c.ClaimDetail || '',
                    Amount: c.Amount?.toString() || '',
                    IsCheckMileage: true,
                    Mileage: c.Mileage?.toString() || '',
                    LastMileage: c.LastMileage?.toString() || '',
                    BranchID: c.BranchID?.toString() || '',
                });
            }
        } catch (error) {
            console.error('Error fetching data:', error);
        } finally {
            setIsLoading(false);
        }
    };

    const handleSubmit = async (formData: ClaimFormData, files: File[], submitNow: boolean) => {
        if (!claim) return;

        setIsSaving(true);
        setSubmitError(null);
        try {
            const res = await fetch(`/api/claims/${claim.ClaimID}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    ...formData,
                    submitNow,
                }),
            });

            const data = await res.json();

            if (!data.success) {
                setSubmitError(data.error || 'เกิดข้อผิดพลาดในการบันทึก');
                setIsSaving(false);
                return;
            }

            // Upload new files if any
            if (files.length > 0) {
                const uploadFormData = new FormData();
                files.forEach((file) => {
                    uploadFormData.append('files', file);
                });
                uploadFormData.append('claimId', claim.ClaimID.toString());

                const uploadRes = await fetch('/api/claims/files', {
                    method: 'POST',
                    body: uploadFormData,
                });

                const uploadData = await uploadRes.json();

                if (!uploadData.success) {
                    console.error('File upload error:', uploadData.message);
                }
            }

            router.push(`/service-center/claims/${claim.ClaimID}`);
        } catch (error) {
            console.error('Error updating claim:', error);
            setSubmitError('เกิดข้อผิดพลาดในการบันทึก');
        } finally {
            setIsSaving(false);
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

    // Check if can edit
    const claimStatus = Number(claim.Status);
    const canEdit = claimStatus === CLAIM_STATUS.DRAFT || claimStatus === CLAIM_STATUS.NEED_INFO;
    const isAdmin = session?.user?.role === 'ADMIN';

    if (!canEdit && !isAdmin) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[400px]">
                <p className="text-gray-500 mb-4">ไม่สามารถแก้ไขใบงานที่ส่งไปแล้ว</p>
                <Button onClick={() => router.back()}>กลับ</Button>
            </div>
        );
    }

    return (
        <>
            <Header title={`แก้ไขเคลม ${claim.ClaimNo}`} />

            <div className="mt-6 max-w-4xl">
                <Button variant="ghost" onClick={() => router.back()} className="mb-4">
                    <ArrowLeft className="w-4 h-4 mr-2" />
                    กลับ
                </Button>

                {initialFormData && (
                    <ClaimForm
                        initialData={initialFormData}
                        onSubmit={handleSubmit}
                        isSaving={isSaving}
                        submitError={submitError}
                        title="แก้ไขข้อมูลเคลม"
                    />
                )}
            </div>
        </>
    );
}
