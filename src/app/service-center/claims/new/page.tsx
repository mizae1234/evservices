// Create New Claim Page
// Form for creating a new service claim

'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui';
import { Header } from '@/components/layouts';
import ClaimForm, { ClaimFormData } from '@/components/claims/ClaimForm';
import { ArrowLeft } from 'lucide-react';

export default function NewClaimPage() {
    const router = useRouter();
    const [isSaving, setIsSaving] = useState(false);
    const [submitError, setSubmitError] = useState<string | null>(null);

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
                    // ไม่ block การสร้าง claim แม้ upload ล้มเหลว
                }
            }

            router.push('/service-center/claims');
        } catch (error) {
            console.error('Error creating claim:', error);
            setSubmitError('เกิดข้อผิดพลาดในการสร้างใบงาน');
        } finally {
            setIsSaving(false);
        }
    };

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
                    onSubmit={handleSubmit}
                    isSaving={isSaving}
                    submitError={submitError}
                />
            </div>
        </>
    );
}
