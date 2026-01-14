// Utility functions for the application

import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Merge Tailwind CSS classes with proper precedence
 */
export function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs));
}

/**
 * Format number as Thai Baht currency
 */
export function formatCurrency(amount: number): string {
    return new Intl.NumberFormat('th-TH', {
        style: 'currency',
        currency: 'THB',
    }).format(amount);
}

/**
 * Format date to Thai locale
 */
export function formatDate(date: Date | string): string {
    const d = new Date(date);
    return d.toLocaleDateString('th-TH', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
    });
}

/**
 * Format date with time
 */
export function formatDateTime(date: Date | string): string {
    const d = new Date(date);
    return d.toLocaleString('th-TH', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    });
}

/**
 * Generate claim number with format CLM-YYYY-XXXX
 * @param lastSequence - The last sequence number used (for the current year)
 * @returns New claim number with incremented sequence
 */
export function generateClaimNo(lastSequence: number = 0): string {
    const year = new Date().getFullYear();
    const nextSequence = (lastSequence + 1).toString().padStart(4, '0');
    return `CLM-${year}-${nextSequence}`;
}

/**
 * Parse claim number to extract year and sequence
 * @param claimNo - Claim number in format CLM-YYYY-XXXX
 * @returns Object with year and sequence, or null if invalid
 */
export function parseClaimNo(claimNo: string): { year: number; sequence: number } | null {
    const match = claimNo.match(/^CLM-(\d{4})-(\d{4})$/);
    if (!match) return null;
    return {
        year: parseInt(match[1]),
        sequence: parseInt(match[2]),
    };
}

/**
 * Get status text in Thai
 */
export function getStatusText(status: number): string {
    const statusMap: Record<number, string> = {
        0: 'แบบร่าง',
        1: 'รออนุมัติ',
        2: 'อนุมัติแล้ว',
        3: 'ปฏิเสธ',
        4: 'ขอข้อมูลเพิ่ม',
    };
    return statusMap[status] || 'ไม่ทราบสถานะ';
}

/**
 * Get status color class
 */
export function getStatusColor(status: number): string {
    const colorMap: Record<number, string> = {
        0: 'bg-gray-100 text-gray-800',
        1: 'bg-yellow-100 text-yellow-800',
        2: 'bg-green-100 text-green-800',
        3: 'bg-red-100 text-red-800',
        4: 'bg-blue-100 text-blue-800',
    };
    return colorMap[status] || 'bg-gray-100 text-gray-800';
}

/**
 * Get action text in Thai
 */
export function getActionText(action: string): string {
    const actionMap: Record<string, string> = {
        CREATED: 'สร้างใบงาน',
        SUBMITTED: 'ส่งอนุมัติ',
        APPROVED: 'อนุมัติ',
        REJECTED: 'ปฏิเสธ',
        INFO_REQUESTED: 'ขอข้อมูลเพิ่ม',
        UPDATED: 'แก้ไขข้อมูล',
    };
    return actionMap[action] || action;
}

/**
 * Format file size
 */
export function formatFileSize(bytes: number): string {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

/**
 * Validate file type
 */
export function isValidFileType(filename: string): boolean {
    const allowedExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.pdf', '.doc', '.docx'];
    const ext = filename.toLowerCase().substring(filename.lastIndexOf('.'));
    return allowedExtensions.includes(ext);
}

/**
 * Truncate text with ellipsis
 */
export function truncateText(text: string, maxLength: number): string {
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength) + '...';
}
