// TypeScript types for the application

// ==========================================
// User & Auth Types
// ==========================================

export type UserRole = 'ADMIN' | 'SERVICE_CENTER';

export interface User {
    UserID: number;
    Email: string;
    FullName: string;
    Phone?: string;
    RoleID: number;
    BranchID?: number;
    IsActive: boolean;
    Role: {
        RoleCode: string;
        RoleName: string;
    };
    Branch?: {
        BranchID: number;
        BranchName: string;
    };
}

export interface SessionUser {
    id: string;
    email: string;
    name: string;
    role: UserRole;
    branchId?: number;
    branchName?: string;
}

// ==========================================
// Claim Types
// ==========================================

export type ClaimStatus = 0 | 1 | 2 | 3 | 4;

export const CLAIM_STATUS = {
    DRAFT: 0 as const,
    PENDING: 1 as const,
    APPROVED: 2 as const,
    REJECTED: 3 as const,
    NEED_INFO: 4 as const,
};

export interface Claim {
    ClaimID: number;
    ClaimNo: string;
    ClaimDate: Date;
    ClaimDetail?: string;
    Amount: number;
    BranchID: number;
    CarModel: string;
    CarRegister: string;
    CustomerName: string;
    IsCheckMileage: boolean;
    Mileage: number;
    LastMileage: number;
    Status: ClaimStatus;
    DocUrl?: string;
    DocName?: string;
    S3Path?: string;
    ApprovalNote?: string;
    ApprovedDate?: Date;
    ApprovedBy?: number;
    IsActive: boolean;
    CreateBy: number;
    CreateDate: Date;
    UpdateBy?: number;
    UpdateDate?: Date;
    Branch?: ServiceBranch;
    Creator?: User;
    Files?: ClaimFile[];
    Logs?: ClaimLog[];
}

export interface ClaimFormData {
    CustomerName: string;
    CarModel: string;
    CarRegister: string;
    ClaimDetail: string;
    Amount: number;
    IsCheckMileage: boolean;
    Mileage: number;
    LastMileage: number;
}

export interface ClaimFile {
    FileID: number;
    ClaimID: number;
    FileName: string;
    FileType: string;
    FileSize: number;
    FilePath: string;
    S3Path?: string;
    IsActive: boolean;
    CreateBy: number;
    CreateDate: Date;
}

export interface ClaimLog {
    LogID: number;
    ClaimID: number;
    Action: ClaimAction;
    Description?: string;
    OldStatus?: number;
    NewStatus?: number;
    ActionBy: number;
    ActionDate: Date;
    User?: {
        FullName: string;
    };
}

export type ClaimAction = 'CREATED' | 'SUBMITTED' | 'APPROVED' | 'REJECTED' | 'INFO_REQUESTED' | 'UPDATED';

// ==========================================
// Master Data Types
// ==========================================

export interface ServiceBranch {
    BranchID: number;
    BranchCode: string;
    BranchName: string;
    Address?: string;
    Phone?: string;
    IsActive: boolean;
}

export type Branch = ServiceBranch;

export interface CarModel {
    ModelID: number;
    ModelCode: string;
    ModelName: string;
    Brand?: string;
    IsActive: boolean;
}

// ==========================================
// API Response Types
// ==========================================

export interface ApiResponse<T = unknown> {
    success: boolean;
    data?: T;
    error?: string;
    message?: string;
}

export interface PaginatedResponse<T> {
    success: boolean;
    data: T[];
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
}

// ==========================================
// Dashboard Stats Types
// ==========================================

export interface DashboardStats {
    total: number;
    draft: number;
    pending: number;
    approved: number;
    rejected: number;
    needInfo: number;
}

// ==========================================
// Filter Types
// ==========================================

export interface ClaimFilter {
    status?: ClaimStatus;
    branchId?: number;
    startDate?: string;
    endDate?: string;
    search?: string;
    page?: number;
    pageSize?: number;
}
