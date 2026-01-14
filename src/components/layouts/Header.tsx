// Header Component
// Top header with user info and breadcrumb

'use client';

import { useSession } from 'next-auth/react';
import { Bell, User } from 'lucide-react';

interface HeaderProps {
    title?: string;
    subtitle?: string;
}

export function Header({ title, subtitle }: HeaderProps) {
    const { data: session } = useSession();

    return (
        <header className="h-16 bg-white border-b border-gray-200 px-6 flex items-center justify-between">
            {/* Left - Title */}
            <div>
                {title && <h1 className="text-xl font-semibold text-gray-900">{title}</h1>}
                {subtitle && <p className="text-sm text-gray-500">{subtitle}</p>}
            </div>

            {/* Right - User & Notifications */}
            <div className="flex items-center gap-4">
                {/* Notifications */}
                <button className="relative p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">
                    <Bell className="w-5 h-5" />
                    <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full" />
                </button>

                {/* User */}
                <div className="flex items-center gap-3 pl-4 border-l border-gray-200">
                    <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center">
                        <User className="w-4 h-4 text-blue-600" />
                    </div>
                    <div className="hidden sm:block">
                        <p className="text-sm font-medium text-gray-900">{session?.user?.name}</p>
                        <p className="text-xs text-gray-500">
                            {session?.user?.role === 'ADMIN' ? 'ผู้ดูแลระบบ' : 'ศูนย์บริการ'}
                        </p>
                    </div>
                </div>
            </div>
        </header>
    );
}
