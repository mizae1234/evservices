// Sidebar Component
// Navigation sidebar with role-based menu items and mobile responsive toggle

'use client';

import { useState, useEffect } from 'react';
import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { useSession, signOut } from 'next-auth/react';
import { cn } from '@/lib/utils';
import {
    LayoutDashboard,
    FileText,
    FilePlus,
    CheckSquare,
    History,
    LogOut,
    Building,
    Car,
    FileSpreadsheet,
    Users,
    User,
    Clock,
    Menu,
    X,
} from 'lucide-react';

interface MenuItem {
    label: string;
    href: string;
    icon: React.ReactNode;
    roles: string[];
}

const menuItems: MenuItem[] = [
    // Service Center Items
    {
        label: 'Dashboard',
        href: '/service-center/dashboard',
        icon: <LayoutDashboard className="w-5 h-5" />,
        roles: ['SERVICE_CENTER', 'ADMIN'],
    },
    {
        label: 'รายการใบงาน',
        href: '/service-center/claims',
        icon: <FileText className="w-5 h-5" />,
        roles: ['SERVICE_CENTER', 'ADMIN'],
    },
    {
        label: 'สร้างใบงานใหม่',
        href: '/service-center/claims/new',
        icon: <FilePlus className="w-5 h-5" />,
        roles: ['SERVICE_CENTER', 'ADMIN'],
    },
    // Admin Items
    {
        label: 'Admin Dashboard',
        href: '/admin/overview',
        icon: <LayoutDashboard className="w-5 h-5" />,
        roles: ['ADMIN'],
    },
    {
        label: 'อนุมัติใบงาน',
        href: '/admin/approvals',
        icon: <CheckSquare className="w-5 h-5" />,
        roles: ['ADMIN'],
    },
    {
        label: 'ประวัติใบงาน',
        href: '/admin/history',
        icon: <History className="w-5 h-5" />,
        roles: ['ADMIN'],
    },
    {
        label: 'รายงาน',
        href: '/admin/reports',
        icon: <FileSpreadsheet className="w-5 h-5" />,
        roles: ['ADMIN'],
    },
    {
        label: 'รายงานอนุมัติ (TAT)',
        href: '/admin/reports/turnaround-time',
        icon: <Clock className="w-5 h-5" />,
        roles: ['ADMIN'],
    },
    {
        label: 'จัดการผู้ใช้',
        href: '/admin/users',
        icon: <Users className="w-5 h-5" />,
        roles: ['ADMIN'],
    },
    // Profile (all users)
    {
        label: 'โปรไฟล์',
        href: '/profile',
        icon: <User className="w-5 h-5" />,
        roles: ['SERVICE_CENTER', 'ADMIN'],
    },
];

export function Sidebar() {
    const pathname = usePathname();
    const { data: session } = useSession();
    const [isOpen, setIsOpen] = useState(false);

    const userRole = session?.user?.role || 'SERVICE_CENTER';

    const filteredItems = menuItems.filter((item) => item.roles.includes(userRole));

    // Close sidebar on route change (mobile)
    useEffect(() => {
        setIsOpen(false);
    }, [pathname]);

    // Close sidebar on resize to desktop
    useEffect(() => {
        const handleResize = () => {
            if (window.innerWidth >= 1024) {
                setIsOpen(false);
            }
        };
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    // Group items by section
    const serviceCenterItems = filteredItems.filter(
        (item) => item.href.startsWith('/service-center')
    );
    const adminItems = filteredItems.filter((item) => item.href.startsWith('/admin'));
    const profileItems = filteredItems.filter((item) => item.href.startsWith('/profile'));

    const sidebarContent = (
        <>
            {/* Logo */}
            <div className="p-6 border-b border-gray-100 flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-blue-600 rounded-lg flex items-center justify-center">
                        <Car className="w-6 h-6 text-white" />
                    </div>
                    <div>
                        <h1 className="font-bold text-gray-900">EV Services</h1>
                        <p className="text-xs text-gray-500">ระบบแจ้งงานบริการ</p>
                    </div>
                </div>
                {/* Close button - mobile only */}
                <button
                    onClick={() => setIsOpen(false)}
                    className="lg:hidden p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg"
                >
                    <X className="w-5 h-5" />
                </button>
            </div>

            {/* Navigation */}
            <nav className="flex-1 p-4 overflow-y-auto">
                {/* Service Center Section */}
                {serviceCenterItems.length > 0 && (
                    <div className="mb-6">
                        <p className="px-3 mb-2 text-xs font-semibold text-gray-400 uppercase tracking-wider">
                            ศูนย์บริการ
                        </p>
                        <ul className="space-y-1">
                            {serviceCenterItems.map((item) => (
                                <li key={item.href}>
                                    <Link
                                        href={item.href}
                                        className={cn(
                                            'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
                                            pathname === item.href
                                                ? 'bg-blue-50 text-blue-700'
                                                : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                                        )}
                                    >
                                        {item.icon}
                                        {item.label}
                                    </Link>
                                </li>
                            ))}
                        </ul>
                    </div>
                )}

                {/* Admin Section */}
                {adminItems.length > 0 && (
                    <div className="mb-6">
                        <p className="px-3 mb-2 text-xs font-semibold text-gray-400 uppercase tracking-wider">
                            ผู้ดูแลระบบ
                        </p>
                        <ul className="space-y-1">
                            {adminItems.map((item) => (
                                <li key={item.href}>
                                    <Link
                                        href={item.href}
                                        className={cn(
                                            'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
                                            pathname === item.href
                                                ? 'bg-blue-50 text-blue-700'
                                                : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                                        )}
                                    >
                                        {item.icon}
                                        {item.label}
                                    </Link>
                                </li>
                            ))}
                        </ul>
                    </div>
                )}

                {/* Profile Section */}
                {profileItems.length > 0 && (
                    <div className="mb-6">
                        <p className="px-3 mb-2 text-xs font-semibold text-gray-400 uppercase tracking-wider">
                            บัญชี
                        </p>
                        <ul className="space-y-1">
                            {profileItems.map((item) => (
                                <li key={item.href}>
                                    <Link
                                        href={item.href}
                                        className={cn(
                                            'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
                                            pathname === item.href
                                                ? 'bg-blue-50 text-blue-700'
                                                : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                                        )}
                                    >
                                        {item.icon}
                                        {item.label}
                                    </Link>
                                </li>
                            ))}
                        </ul>
                    </div>
                )}
            </nav>

            {/* User Info & Logout */}
            <div className="p-4 border-t border-gray-100">
                <div className="mb-3 px-3">
                    <p className="text-sm font-medium text-gray-900">{session?.user?.name}</p>
                    <p className="text-xs text-gray-500">{session?.user?.email}</p>
                    {session?.user?.branchName && (
                        <div className="flex items-center gap-1 mt-1 text-xs text-gray-500">
                            <Building className="w-3 h-3" />
                            {session.user.branchName}
                        </div>
                    )}
                </div>
                <button
                    onClick={() => signOut({ callbackUrl: '/login' })}
                    className="flex items-center gap-3 w-full px-3 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-50 hover:text-gray-900 rounded-lg transition-colors"
                >
                    <LogOut className="w-5 h-5" />
                    ออกจากระบบ
                </button>
            </div>
        </>
    );

    return (
        <>
            {/* Mobile Hamburger Button */}
            <button
                onClick={() => setIsOpen(true)}
                className="lg:hidden fixed top-4 left-4 z-50 p-2 bg-white border border-gray-200 rounded-lg shadow-sm text-gray-600 hover:text-gray-900 hover:bg-gray-50"
            >
                <Menu className="w-5 h-5" />
            </button>

            {/* Mobile Overlay */}
            {isOpen && (
                <div
                    className="lg:hidden fixed inset-0 z-40 bg-black/50 transition-opacity"
                    onClick={() => setIsOpen(false)}
                />
            )}

            {/* Sidebar - Desktop: always visible, Mobile: slide-in overlay */}
            <aside
                className={cn(
                    'fixed left-0 top-0 h-screen w-64 bg-white border-r border-gray-200 flex flex-col z-50 transition-transform duration-300',
                    // Desktop: always show
                    'lg:translate-x-0',
                    // Mobile: slide in/out
                    isOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
                )}
            >
                {sidebarContent}
            </aside>
        </>
    );
}
