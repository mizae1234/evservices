// Loading Components

import { cn } from '@/lib/utils';

interface SpinnerProps {
    size?: 'sm' | 'md' | 'lg';
    className?: string;
}

export function Spinner({ size = 'md', className }: SpinnerProps) {
    const sizes = {
        sm: 'w-4 h-4',
        md: 'w-8 h-8',
        lg: 'w-12 h-12',
    };

    return (
        <div
            className={cn(
                'animate-spin rounded-full border-2 border-gray-200 border-t-blue-600',
                sizes[size],
                className
            )}
        />
    );
}

interface LoadingPageProps {
    message?: string;
}

export function LoadingPage({ message = 'กำลังโหลด...' }: LoadingPageProps) {
    return (
        <div className="flex flex-col items-center justify-center min-h-[400px] gap-4">
            <Spinner size="lg" />
            <p className="text-gray-500">{message}</p>
        </div>
    );
}

export function LoadingOverlay() {
    return (
        <div className="fixed inset-0 bg-white/80 flex items-center justify-center z-50">
            <Spinner size="lg" />
        </div>
    );
}
