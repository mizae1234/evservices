// Badge Component
// Displays status or labels with color coding

import * as React from 'react';
import { cn } from '@/lib/utils';

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
    variant?: 'default' | 'success' | 'warning' | 'danger' | 'info' | 'secondary';
    size?: 'sm' | 'md';
}

const Badge = React.forwardRef<HTMLSpanElement, BadgeProps>(
    ({ className, variant = 'default', size = 'md', ...props }, ref) => {
        const variants = {
            default: 'bg-gray-100 text-gray-800',
            success: 'bg-green-100 text-green-800',
            warning: 'bg-yellow-100 text-yellow-800',
            danger: 'bg-red-100 text-red-800',
            info: 'bg-blue-100 text-blue-800',
            secondary: 'bg-purple-100 text-purple-800',
        };

        const sizes = {
            sm: 'px-2 py-0.5 text-xs',
            md: 'px-2.5 py-1 text-xs',
        };

        return (
            <span
                ref={ref}
                className={cn(
                    'inline-flex items-center font-medium rounded-full',
                    variants[variant],
                    sizes[size],
                    className
                )}
                {...props}
            />
        );
    }
);

Badge.displayName = 'Badge';

// Status Badge - specific for claim statuses
interface StatusBadgeProps {
    status: number;
    className?: string;
}

export function StatusBadge({ status, className }: StatusBadgeProps) {
    const statusConfig: Record<number, { label: string; variant: BadgeProps['variant'] }> = {
        0: { label: 'แบบร่าง', variant: 'default' },
        1: { label: 'รออนุมัติ', variant: 'warning' },
        2: { label: 'อนุมัติแล้ว', variant: 'success' },
        3: { label: 'ปฏิเสธ', variant: 'danger' },
        4: { label: 'ขอข้อมูลเพิ่ม', variant: 'info' },
    };

    const config = statusConfig[status] || { label: 'ไม่ทราบ', variant: 'default' as const };

    return (
        <Badge variant={config.variant} className={className}>
            {config.label}
        </Badge>
    );
}

export { Badge };
