// Edit Claim Page
// Edit an existing claim

'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import {
    Card,
    CardContent,
    CardHeader,
    CardTitle,
    CardFooter,
    Button,
    Input,
    Select,
    Textarea,
    LoadingPage,
    FileUpload,
} from '@/components/ui';
import { Header } from '@/components/layouts';
import { Claim, CarModel, CLAIM_STATUS, Branch } from '@/types';
import { ArrowLeft, Save, Send } from 'lucide-react';

export default function EditClaimPage() {
    const params = useParams();
    const router = useRouter();
    const { data: session } = useSession();
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [claim, setClaim] = useState<Claim | null>(null);
    const [carModels, setCarModels] = useState<CarModel[]>([]);
    const [branches, setBranches] = useState<Branch[]>([]);
    const [errors, setErrors] = useState<Record<string, string>>({});
    const [files, setFiles] = useState<File[]>([]);

    const [formData, setFormData] = useState({
        CustomerName: '',
        CarModel: '',
        CarRegister: '',
        ClaimDetail: '',
        Amount: '',
        IsCheckMileage: false,
        Mileage: '',
        LastMileage: '',
        MileageOption: '',
        CustomMileage: '',
        BranchID: '',
    });

    // Options สำหรับระยะเช็ค - ดึงจาก database
    const [mileageOptions, setMileageOptions] = useState<{ value: string; label: string }[]>([]);
    const [mileageValues, setMileageValues] = useState<number[]>([]);

    useEffect(() => {
        fetchData();
        fetchBranches();
        fetchMileageOptions();
    }, [params.id]);

    const fetchMileageOptions = async () => {
        try {
            const res = await fetch('/api/mileages');
            const data = await res.json();
            if (data.success) {
                setMileageOptions(data.data);
                setMileageValues(data.values || []);
            }
        } catch (error) {
            console.error('Error fetching mileage options:', error);
        }
    };

    const fetchData = async () => {
        try {
            const [claimRes, modelsRes, mileageRes] = await Promise.all([
                fetch(`/api/claims/${params.id}`),
                fetch('/api/car-models'),
                fetch('/api/mileages'),
            ]);

            const claimData = await claimRes.json();
            const modelsData = await modelsRes.json();
            const mileageData = await mileageRes.json();

            // Get valid mileage values from API
            const validMileageValues = mileageData.success ? mileageData.values : [];

            if (claimData.success) {
                const c = claimData.data;
                setClaim(c);

                // Determine mileage option dynamically based on API values
                let mileageOption = '';
                let customMileage = '';
                const mileageVal = c.Mileage?.toString() || '';
                const mileageNum = parseInt(mileageVal);

                if (validMileageValues.includes(mileageNum)) {
                    mileageOption = mileageVal;
                } else if (mileageVal) {
                    mileageOption = 'other';
                    customMileage = mileageVal;
                }

                setFormData({
                    CustomerName: c.CustomerName || '',
                    CarModel: c.CarModel || '',
                    CarRegister: c.CarRegister || '',
                    ClaimDetail: c.ClaimDetail || '',
                    Amount: c.Amount?.toString() || '',
                    IsCheckMileage: c.IsCheckMileage || false,
                    Mileage: mileageVal,
                    LastMileage: c.LastMileage?.toString() || '',
                    MileageOption: mileageOption,
                    CustomMileage: customMileage,
                    BranchID: c.BranchID?.toString() || '',
                });
            }

            if (modelsData.success) {
                setCarModels(modelsData.data);
            }

            if (mileageData.success) {
                setMileageOptions(mileageData.data);
                setMileageValues(mileageData.values || []);
            }
        } catch (error) {
            console.error('Error fetching data:', error);
        } finally {
            setIsLoading(false);
        }
    };

    const fetchBranches = async () => {
        try {
            const res = await fetch('/api/branches');
            const data = await res.json();
            if (data.success) setBranches(data.data);
        } catch (error) {
            console.error('Error fetching branches:', error);
        }
    };

    const carModelOptions = carModels.map((m) => ({
        value: m.ModelName,
        label: m.ModelName,
    }));

    const branchOptions = branches.map((branch) => ({
        value: branch.BranchID.toString(),
        label: branch.BranchName,
    }));

    const handleChange = (
        e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
    ) => {
        const { name, value, type } = e.target;
        setFormData((prev) => ({
            ...prev,
            [name]: type === 'checkbox' ? (e.target as HTMLInputElement).checked : value,
        }));
        if (errors[name]) {
            setErrors((prev) => ({ ...prev, [name]: '' }));
        }
    };

    const validate = () => {
        const newErrors: Record<string, string> = {};

        if (!formData.CustomerName.trim()) {
            newErrors.CustomerName = 'กรุณากรอกชื่อลูกค้า';
        }
        if (!formData.CarModel.trim()) {
            newErrors.CarModel = 'กรุณาเลือกรุ่นรถ';
        }
        if (!formData.CarRegister.trim()) {
            newErrors.CarRegister = 'กรุณากรอกทะเบียนรถ';
        } else if (/\s/.test(formData.CarRegister)) {
            newErrors.CarRegister = 'กรุณากรอกทะเบียนรถติดกัน ไม่มีช่องว่าง';
        }
        if (!formData.Amount || parseFloat(formData.Amount) <= 0) {
            newErrors.Amount = 'กรุณากรอกจำนวนเงิน';
        }
        // Validate Branch for Admin
        if (session?.user?.role === 'ADMIN' && !formData.BranchID) {
            newErrors.BranchID = 'กรุณาเลือกสาขา';
        }

        setErrors(newErrors);
        return Object.keys(newErrors).length === 0;
    };

    const handleSubmit = async (submitNow: boolean) => {
        if (!validate() || !claim) return;

        setIsSaving(true);
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
                setErrors({ submit: data.error || 'เกิดข้อผิดพลาด' });
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
                    // Don't block navigation even if upload fails
                }
            }

            router.push(`/service-center/claims/${claim.ClaimID}`);
        } catch (error) {
            console.error('Error updating claim:', error);
            setErrors({ submit: 'เกิดข้อผิดพลาดในการบันทึก' });
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

            <div className="mt-6">
                <Button variant="ghost" onClick={() => router.back()} className="mb-4">
                    <ArrowLeft className="w-4 h-4 mr-2" />
                    กลับ
                </Button>

                <Card>
                    <CardHeader>
                        <CardTitle>แก้ไขข้อมูลเคลม</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-6">
                        {errors.submit && (
                            <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
                                <p className="text-red-700">{errors.submit}</p>
                            </div>
                        )}

                        {/* Branch Selection (Only enabled for ADMIN) */}
                        <div>
                            <h3 className="text-sm font-semibold text-gray-700 mb-4">ข้อมูลทั่วไป</h3>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <Select
                                    label="สาขา"
                                    name="BranchID"
                                    value={formData.BranchID}
                                    onChange={handleChange}
                                    options={branchOptions}
                                    placeholder="เลือกสาขา"
                                    disabled={!isAdmin} // Disable if not admin
                                    error={errors.BranchID}
                                    required={isAdmin}
                                />
                            </div>
                        </div>

                        {/* Customer Information */}
                        <div className="pt-4 border-t border-gray-100">
                            <h3 className="text-sm font-semibold text-gray-700 mb-4">ข้อมูลลูกค้า</h3>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <Input
                                    label="ชื่อลูกค้า"
                                    name="CustomerName"
                                    value={formData.CustomerName}
                                    onChange={handleChange}
                                    error={errors.CustomerName}
                                    required
                                />
                            </div>
                        </div>

                        {/* Vehicle Information */}
                        <div className="pt-4 border-t border-gray-100">
                            <h3 className="text-sm font-semibold text-gray-700 mb-4">ข้อมูลรถยนต์</h3>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <Select
                                    label="รุ่นรถ"
                                    name="CarModel"
                                    value={formData.CarModel}
                                    onChange={handleChange}
                                    options={carModelOptions}
                                    placeholder="เลือกรุ่นรถ"
                                    error={errors.CarModel}
                                    required
                                />
                                <Input
                                    label="ทะเบียนรถ"
                                    name="CarRegister"
                                    value={formData.CarRegister}
                                    onChange={handleChange}
                                    error={errors.CarRegister}
                                    placeholder="กท1234"
                                    required
                                />
                            </div>
                        </div>

                        {/* Mileage Check */}
                        <div className="pt-4 border-t border-gray-100">
                            <h3 className="text-sm font-semibold text-gray-700 mb-4">ข้อมูลระยะทาง</h3>
                            <div className="mb-4">
                                <label className="flex items-center gap-2 cursor-pointer">
                                    <input
                                        type="checkbox"
                                        name="IsCheckMileage"
                                        checked={formData.IsCheckMileage}
                                        onChange={handleChange}
                                        className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                                    />
                                    <span className="text-sm text-gray-700">ตรวจเช็คระยะทาง</span>
                                </label>
                            </div>
                            {formData.IsCheckMileage && (
                                <div className="space-y-4">
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        <Input
                                            label="ไมล์ล่าสุด"
                                            name="LastMileage"
                                            type="number"
                                            value={formData.LastMileage}
                                            onChange={handleChange}
                                            placeholder="เช่น 45000"
                                        />
                                        <Select
                                            label="ระยะ"
                                            name="MileageOption"
                                            value={formData.MileageOption}
                                            onChange={(e) => {
                                                const value = e.target.value;
                                                setFormData(prev => ({
                                                    ...prev,
                                                    MileageOption: value,
                                                    Mileage: value !== 'other' ? value : prev.CustomMileage,
                                                }));
                                            }}
                                            options={mileageOptions}
                                            placeholder="เลือกระยะทาง"
                                        />
                                    </div>
                                    {formData.MileageOption === 'other' && (
                                        <div className="md:w-1/2">
                                            <Input
                                                label="ระบุระยะ (กิโลเมตร)"
                                                name="CustomMileage"
                                                type="number"
                                                value={formData.CustomMileage}
                                                onChange={(e) => {
                                                    const value = e.target.value;
                                                    setFormData(prev => ({
                                                        ...prev,
                                                        CustomMileage: value,
                                                        Mileage: value,
                                                    }));
                                                }}
                                                placeholder="เช่น 15000"
                                            />
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>

                        {/* Claim Details */}
                        <div className="pt-4 border-t border-gray-100">
                            <h3 className="text-sm font-semibold text-gray-700 mb-4">รายละเอียดเคลม</h3>
                            <div className="grid grid-cols-1 gap-4">
                                <Textarea
                                    label="รายละเอียด"
                                    name="ClaimDetail"
                                    value={formData.ClaimDetail}
                                    onChange={handleChange}
                                    rows={4}
                                    placeholder="อธิบายปัญหาหรือบริการที่ต้องการเคลม..."
                                />
                                <div className="md:w-1/2">
                                    <Input
                                        label="จำนวนเงิน (บาท)"
                                        name="Amount"
                                        type="number"
                                        value={formData.Amount}
                                        onChange={handleChange}
                                        error={errors.Amount}
                                        placeholder="0.00"
                                        required
                                    />
                                </div>
                            </div>
                        </div>

                        {/* File Upload */}
                        <div className="pt-4 border-t border-gray-100">
                            <h3 className="text-sm font-semibold text-gray-700 mb-4">เอกสารแนบเพิ่มเติม</h3>
                            <FileUpload onFilesChange={setFiles} />
                            <p className="text-xs text-gray-500 mt-2">
                                * ไฟล์ที่เคยอัปโหลดแล้วจะแสดงในหน้ารายละเอียด สามารถเพิ่มไฟล์ใหม่ได้ที่นี่
                            </p>
                        </div>
                    </CardContent>
                    <CardFooter className="flex justify-between">
                        <Button variant="secondary" onClick={() => router.back()}>
                            ยกเลิก
                        </Button>
                        <div className="flex gap-3">
                            <Button
                                variant="outline"
                                onClick={() => handleSubmit(false)}
                                isLoading={isSaving}
                            >
                                <Save className="w-4 h-4 mr-2" />
                                บันทึก
                            </Button>
                            <Button
                                onClick={() => handleSubmit(true)}
                                isLoading={isSaving}
                            >
                                <Send className="w-4 h-4 mr-2" />
                                บันทึกและส่งอนุมัติ
                            </Button>
                        </div>
                    </CardFooter>
                </Card>
            </div>
        </>
    );
}
