// Reusable Claim Form Component
// Encapsulates all form fields, master data fetching, validation, and auto-complete logic

'use client';

import { useState, useEffect } from 'react';
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
import { CarModel, Branch } from '@/types';
import { Save, Send } from 'lucide-react';

export interface ClaimFormData {
    ServiceDate: string;
    CustomerName: string;
    CarModel: string;
    CarRegister: string;
    VinNo: string;
    ProjectType: string;
    InventoryItemID: number | null;
    ClaimDetail: string;
    Amount: string;
    IsCheckMileage: boolean;
    Mileage: string;
    LastMileage: string;
    MileageOption: string;
    CustomMileage: string;
    BranchID: string;
}

interface ClaimFormProps {
    initialData?: Partial<ClaimFormData>;
    onSubmit: (formData: ClaimFormData, files: File[], submitNow: boolean) => Promise<void>;
    isSaving: boolean;
    submitError?: string | null;
    title?: string;
}

interface VehicleData {
    InventoryItemID: number;
    VinNo: string;
    RegisterNo: string;
    ProjectType: string;
    Model: string;
    CustomerName: string;
}

const defaultFormData: ClaimFormData = {
    ServiceDate: new Date().toISOString().split('T')[0], // default วันนี้
    CustomerName: '',
    CarModel: '',
    CarRegister: '',
    VinNo: '',
    ProjectType: '',
    InventoryItemID: null,
    ClaimDetail: '',
    Amount: '',
    IsCheckMileage: true,
    Mileage: '',
    LastMileage: '',
    MileageOption: '',
    CustomMileage: '',
    BranchID: '',
};

export default function ClaimForm({
    initialData,
    onSubmit,
    isSaving,
    submitError,
    title = 'ข้อมูลใบงาน',
}: ClaimFormProps) {
    const { data: session } = useSession();
    const [carModels, setCarModels] = useState<CarModel[]>([]);
    const [branches, setBranches] = useState<Branch[]>([]);
    const [files, setFiles] = useState<File[]>([]);
    const [errors, setErrors] = useState<Record<string, string>>({});

    const [formData, setFormData] = useState<ClaimFormData>({
        ...defaultFormData,
    });

    // Vehicle lookup autocomplete state
    const [vehicleSuggestions, setVehicleSuggestions] = useState<VehicleData[]>([]);
    const [showSuggestions, setShowSuggestions] = useState(false);
    const [isSearching, setIsSearching] = useState(false);

    // Options สำหรับระยะเช็ค - ดึงจาก database
    const [mileageOptions, setMileageOptions] = useState<{ value: string; label: string }[]>([]);

    useEffect(() => {
        fetchCarModels();
        fetchBranches();
        fetchMileageOptions();
    }, []);

    // Set initial data if passed (useful in Edit mode)
    useEffect(() => {
        if (initialData) {
            setFormData(prev => ({
                ...prev,
                ...initialData,
            }));
        }
    }, [initialData]);

    // Handle Branch default when session is loaded (if not in Edit Mode with a set BranchID)
    useEffect(() => {
        if (session?.user?.branchId && !initialData?.BranchID && !formData.BranchID) {
            setFormData(prev => ({ ...prev, BranchID: session.user.branchId!.toString() }));
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [session, initialData]);

    // Map mileage options once loaded to set MileageOption & CustomMileage correctly if only Mileage is provided
    useEffect(() => {
        if (mileageOptions.length > 0 && initialData?.Mileage && !formData.MileageOption) {
            const mileageVal = initialData.Mileage.toString();
            const mileageNum = parseInt(mileageVal);
            const hasOption = mileageOptions.some(opt => parseInt(opt.value) === mileageNum);

            if (hasOption) {
                setFormData(prev => ({
                    ...prev,
                    MileageOption: mileageVal,
                    Mileage: mileageVal,
                }));
            } else {
                setFormData(prev => ({
                    ...prev,
                    MileageOption: 'other',
                    CustomMileage: mileageVal,
                    Mileage: mileageVal,
                }));
            }
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [mileageOptions, initialData?.Mileage]);

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
        if (errors[name]) {
            setErrors((prev) => ({ ...prev, [name]: '' }));
        }
    };

    // Vehicle search
    const searchVehicles = async (query: string) => {
        if (query.length < 4) {
            setVehicleSuggestions([]);
            setShowSuggestions(false);
            return;
        }

        setIsSearching(true);
        try {
            const res = await fetch(`/api/vehicles/lookup?q=${encodeURIComponent(query)}`);
            const data = await res.json();
            if (data.success && data.data.length > 0) {
                setVehicleSuggestions(data.data);
                setShowSuggestions(true);
            } else {
                setVehicleSuggestions([]);
                setShowSuggestions(false);
            }
        } catch (error) {
            console.error('Error searching vehicles:', error);
        } finally {
            setIsSearching(false);
        }
    };

    const handleCarRegisterChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const value = e.target.value;
        setFormData((prev) => ({ ...prev, CarRegister: value }));
        if (errors.CarRegister) {
            setErrors((prev) => ({ ...prev, CarRegister: '' }));
        }
        searchVehicles(value);
    };

    const handleVehicleSelect = (vehicle: VehicleData) => {
        setFormData((prev) => ({
            ...prev,
            CarRegister: vehicle.RegisterNo,
            VinNo: vehicle.VinNo,
            ProjectType: vehicle.ProjectType,
            CustomerName: vehicle.CustomerName,
            CarModel: vehicle.Model,
            InventoryItemID: vehicle.InventoryItemID,
        }));
        setShowSuggestions(false);
        setVehicleSuggestions([]);
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
        if (!formData.Amount && formData.Amount !== '0') {
            newErrors.Amount = 'กรุณากรอกจำนวนเงิน';
        } else if (parseFloat(formData.Amount) < 0) {
            newErrors.Amount = 'จำนวนเงินต้องไม่ติดลบ';
        }

        if (!formData.LastMileage) {
            newErrors.LastMileage = 'กรุณากรอกไมล์ล่าสุด';
        }
        if (!formData.MileageOption) {
            newErrors.MileageOption = 'กรุณาเลือกระยะ';
        }
        if (formData.MileageOption === 'other' && !formData.CustomMileage) {
            newErrors.CustomMileage = 'กรุณาระบุระยะ';
        }

        if (session?.user?.role === 'ADMIN' && !formData.BranchID) {
            newErrors.BranchID = 'กรุณาเลือกสาขา';
        }

        setErrors(newErrors);
        return Object.keys(newErrors).length === 0;
    };

    const handleSubmit = async (submitNow: boolean) => {
        if (!validate()) return;
        await onSubmit(formData, files, submitNow);
    };

    const carModelOptions = carModels.map((model) => {
        const fullName = model.Brand ? `${model.Brand} ${model.ModelName}` : model.ModelName;
        return {
            value: fullName,
            label: fullName,
        };
    });

    const branchOptions = branches.map((branch) => ({
        value: branch.BranchID.toString(),
        label: branch.BranchName,
    }));

    const isAdmin = session?.user?.role === 'ADMIN';

    return (
        <Card>
            <CardHeader>
                <CardTitle>{title}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
                {(submitError || errors.submit) && (
                    <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
                        {submitError || errors.submit}
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
                            disabled={!isAdmin}
                            error={errors.BranchID}
                            required={isAdmin}
                        />
                        <Input
                            label="วันที่เข้ารับบริการ"
                            name="ServiceDate"
                            type="date"
                            value={formData.ServiceDate}
                            onChange={handleChange}
                            required
                        />
                    </div>
                </div>

                {/* Vehicle Information */}
                <div className="pt-4 border-t border-gray-100">
                    <h3 className="text-sm font-semibold text-gray-700 mb-4">ข้อมูลรถยนต์</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {/* Car Register with Autocomplete */}
                        <div className="relative">
                            <Input
                                label="ทะเบียนรถ"
                                name="CarRegister"
                                value={formData.CarRegister}
                                onChange={handleCarRegisterChange}
                                onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
                                error={errors.CarRegister}
                                placeholder="พิมพ์ทะเบียนเพื่อค้นหา..."
                                required
                            />
                            {isSearching && (
                                <div className="absolute right-3 top-9">
                                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
                                </div>
                            )}
                            {showSuggestions && vehicleSuggestions.length > 0 && (
                                <div className="absolute z-10 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                                    {vehicleSuggestions.map((vehicle) => (
                                        <button
                                            key={vehicle.InventoryItemID}
                                            type="button"
                                            onClick={() => handleVehicleSelect(vehicle)}
                                            className="w-full px-4 py-3 text-left hover:bg-blue-50 border-b border-gray-100 last:border-b-0"
                                        >
                                            <div className="font-medium text-gray-900">{vehicle.RegisterNo}</div>
                                            <div className="text-sm text-gray-500">
                                                {vehicle.Model} • {vehicle.CustomerName}
                                            </div>
                                            <div className="text-xs text-gray-400">
                                                VIN: {vehicle.VinNo} | {vehicle.ProjectType}
                                            </div>
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>
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
                            label="VIN No."
                            name="VinNo"
                            value={formData.VinNo}
                            onChange={handleChange}
                            placeholder="เลขตัวถัง"
                        />
                        <Input
                            label="Project Type"
                            name="ProjectType"
                            value={formData.ProjectType}
                            onChange={handleChange}
                            placeholder="Owner / Rental / Fleet"
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

                {/* Mileage Check */}
                <div className="pt-4 border-t border-gray-100">
                    <h3 className="text-sm font-semibold text-gray-700 mb-4">ข้อมูลระยะทาง</h3>
                    <div className="space-y-4">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <Input
                                label="ไมล์ล่าสุด"
                                name="LastMileage"
                                type="number"
                                value={formData.LastMileage}
                                onChange={handleChange}
                                error={errors.LastMileage}
                                placeholder="เช่น 45000"
                                required
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
                                    if (errors.MileageOption) {
                                        setErrors(prev => ({ ...prev, MileageOption: '' }));
                                    }
                                }}
                                options={mileageOptions}
                                placeholder="เลือกระยะทาง"
                                error={errors.MileageOption}
                                required
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
                                        if (errors.CustomMileage) {
                                            setErrors(prev => ({ ...prev, CustomMileage: '' }));
                                        }
                                    }}
                                    error={errors.CustomMileage}
                                    placeholder="เช่น 15000"
                                    required
                                />
                            </div>
                        )}
                    </div>
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
                    isLoading={isSaving}
                >
                    <Save className="w-4 h-4 mr-2" />
                    บันทึกแบบร่าง
                </Button>
                <Button
                    onClick={() => handleSubmit(true)}
                    isLoading={isSaving}
                >
                    <Send className="w-4 h-4 mr-2" />
                    ส่งเพื่ออนุมัติ
                </Button>
            </CardFooter>
        </Card>
    );
}
