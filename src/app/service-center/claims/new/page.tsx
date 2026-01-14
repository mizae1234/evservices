// Create New Claim Page
// Form for creating a new service claim

'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
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
    FileUpload,
} from '@/components/ui';
import { Header } from '@/components/layouts';
import { CarModel, Branch } from '@/types';
import { ArrowLeft, Save, Send } from 'lucide-react';

export default function NewClaimPage() {
    const router = useRouter();
    const { data: session } = useSession();
    const [isLoading, setIsLoading] = useState(false);
    const [carModels, setCarModels] = useState<CarModel[]>([]);
    const [branches, setBranches] = useState<Branch[]>([]);
    const [files, setFiles] = useState<File[]>([]);
    const [errors, setErrors] = useState<Record<string, string>>({});

    const [formData, setFormData] = useState({
        CustomerName: '',
        CarModel: '',
        CarRegister: '',
        ClaimDetail: '',
        Amount: '',
        IsCheckMileage: false,
        Mileage: '',
        LastMileage: '',
        MileageOption: '', // เลือกระยะเช็ค
        CustomMileage: '', // กรอกระยะเอง (เมื่อเลือก 'อื่นๆ')
        BranchID: '', // Selected branch
    });

    // Options สำหรับระยะเช็ค - ดึงจาก database
    const [mileageOptions, setMileageOptions] = useState<{ value: string; label: string }[]>([]);

    useEffect(() => {
        fetchCarModels();
        fetchBranches();
        fetchMileageOptions();
    }, []);

    useEffect(() => {
        if (session?.user) {
            // If user has a branch assigned, default to it
            // ADMIN can change it, SERVICE_CENTER cannot
            if (session.user.branchId) {
                setFormData(prev => ({ ...prev, BranchID: session.user.branchId!.toString() }));
            }
        }
    }, [session]);

    const fetchCarModels = async () => {
        try {
            const res = await fetch('/api/car-models');
            const data = await res.json();
            if (data.success) setCarModels(data.data);
        } catch (error) {
            console.error('Error fetching car models:', error);
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

    const fetchMileageOptions = async () => {
        try {
            const res = await fetch('/api/mileages');
            const data = await res.json();
            if (data.success) setMileageOptions(data.data);
        } catch (error) {
            console.error('Error fetching mileage options:', error);
        }
    };

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
        const { name, value, type } = e.target;
        setFormData((prev) => ({
            ...prev,
            [name]: type === 'checkbox' ? (e.target as HTMLInputElement).checked : value,
        }));
        // Clear error when user types
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
        if (!validate()) return;

        setIsLoading(true);
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
                setErrors({ submit: data.error || 'เกิดข้อผิดพลาด' });
                setIsLoading(false);
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
            setErrors({ submit: 'เกิดข้อผิดพลาดในการสร้างใบงาน' });
        } finally {
            setIsLoading(false);
        }
    };

    const carModelOptions = carModels.map((model) => ({
        value: `${model.Brand} ${model.ModelName}`,
        label: `${model.Brand} ${model.ModelName}`,
    }));

    const branchOptions = branches.map((branch) => ({
        value: branch.BranchID.toString(),
        label: branch.BranchName,
    }));

    const isAdmin = session?.user?.role === 'ADMIN';

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

                {errors.submit && (
                    <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
                        {errors.submit}
                    </div>
                )}

                <Card>
                    <CardHeader>
                        <CardTitle>ข้อมูลใบงาน</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-6">
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
                                    placeholder="นาย/นาง/นางสาว ชื่อ นามสกุล"
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
                            <h3 className="text-sm font-semibold text-gray-700 mb-4">รายละเอียดงานบริการ</h3>
                            <div className="grid grid-cols-1 gap-4">
                                <Textarea
                                    label="รายละเอียด"
                                    name="ClaimDetail"
                                    value={formData.ClaimDetail}
                                    onChange={handleChange}
                                    placeholder="รายละเอียดการบริการ เช่น เปลี่ยนถ่ายน้ำมันเครื่อง, เปลี่ยนผ้าเบรค..."
                                    rows={4}
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
                            <h3 className="text-sm font-semibold text-gray-700 mb-4">เอกสารแนบ</h3>
                            <FileUpload onFilesChange={setFiles} />
                        </div>
                    </CardContent>
                    <CardFooter className="flex justify-end gap-3 pt-6 border-t border-gray-100">
                        <Button
                            variant="outline"
                            onClick={() => handleSubmit(false)}
                            isLoading={isLoading}
                        >
                            <Save className="w-4 h-4 mr-2" />
                            บันทึกแบบร่าง
                        </Button>
                        <Button
                            onClick={() => handleSubmit(true)}
                            isLoading={isLoading}
                        >
                            <Send className="w-4 h-4 mr-2" />
                            ส่งเพื่ออนุมัติ
                        </Button>
                    </CardFooter>
                </Card>
            </div>
        </>
    );
}
