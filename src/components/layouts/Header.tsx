// Header Component
// Top header with user info, breadcrumb, and notification bell

'use client';

import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { Bell, User, Check, CheckCheck } from 'lucide-react';
import { useState, useEffect, useRef, useCallback } from 'react';

interface Notification {
    NotificationID: number;
    Type: string;
    Title: string;
    Message: string;
    BookingID: number | null;
    IsRead: boolean;
    CreateDate: string;
    Booking?: {
        BookingID: number;
        BookingDate: string;
        BranchID: number;
    } | null;
}

interface HeaderProps {
    title?: string;
    subtitle?: string;
}

export function Header({ title, subtitle }: HeaderProps) {
    const { data: session } = useSession();
    const router = useRouter();
    const [notifications, setNotifications] = useState<Notification[]>([]);
    const [unreadCount, setUnreadCount] = useState(0);
    const [isOpen, setIsOpen] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);

    const fetchNotifications = useCallback(async () => {
        try {
            const res = await fetch('/api/notifications');
            const data = await res.json();
            if (data.success) {
                setNotifications(data.data);
                setUnreadCount(data.unreadCount);
            }
        } catch (err) {
            console.error('Failed to fetch notifications:', err);
        }
    }, []);

    // Initial fetch + auto-refresh every 5 minutes
    useEffect(() => {
        fetchNotifications();
        const interval = setInterval(fetchNotifications, 5 * 60 * 1000);
        return () => clearInterval(interval);
    }, [fetchNotifications]);

    // Close dropdown on outside click
    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        }
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const handleBellClick = () => {
        setIsOpen(!isOpen);
        if (!isOpen) fetchNotifications();
    };

    const markAsRead = async (notificationId: number) => {
        try {
            await fetch('/api/notifications', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ notificationId }),
            });
            setNotifications(prev =>
                prev.map(n => n.NotificationID === notificationId ? { ...n, IsRead: true } : n)
            );
            setUnreadCount(prev => Math.max(0, prev - 1));
        } catch (err) {
            console.error('Failed to mark as read:', err);
        }
    };

    const markAllAsRead = async () => {
        setIsLoading(true);
        try {
            await fetch('/api/notifications', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ markAll: true }),
            });
            setNotifications(prev => prev.map(n => ({ ...n, IsRead: true })));
            setUnreadCount(0);
        } catch (err) {
            console.error('Failed to mark all as read:', err);
        } finally {
            setIsLoading(false);
        }
    };

    const getTypeIcon = (type: string) => {
        switch (type) {
            case 'BOOKING_APPROVED': return '✅';
            case 'BOOKING_CANCELLED': return '❌';
            case 'BOOKING_RESCHEDULED': return '📅';
            case 'BOOKING_NEW': return '📥';
            default: return '🔔';
        }
    };

    const timeAgo = (dateStr: string) => {
        const now = new Date();
        const date = new Date(dateStr);
        const diff = Math.floor((now.getTime() - date.getTime()) / 1000);
        if (diff < 60) return 'เมื่อสักครู่';
        if (diff < 3600) return `${Math.floor(diff / 60)} นาทีก่อน`;
        if (diff < 86400) return `${Math.floor(diff / 3600)} ชั่วโมงก่อน`;
        if (diff < 604800) return `${Math.floor(diff / 86400)} วันก่อน`;
        return date.toLocaleDateString('th-TH', { day: 'numeric', month: 'short' });
    };

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
                <div className="relative" ref={dropdownRef}>
                    <button
                        onClick={handleBellClick}
                        className="relative p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                    >
                        <Bell className="w-5 h-5" />
                        {unreadCount > 0 && (
                            <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center px-1">
                                {unreadCount > 99 ? '99+' : unreadCount}
                            </span>
                        )}
                    </button>

                    {/* Dropdown */}
                    {isOpen && (
                        <div className="absolute right-0 mt-2 w-96 bg-white rounded-xl shadow-2xl border border-gray-200 z-50 overflow-hidden">
                            {/* Header */}
                            <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between bg-gray-50">
                                <h3 className="font-bold text-gray-900 text-sm">การแจ้งเตือน</h3>
                                {unreadCount > 0 && (
                                    <button
                                        onClick={markAllAsRead}
                                        disabled={isLoading}
                                        className="text-xs text-blue-600 hover:text-blue-800 font-medium flex items-center gap-1"
                                    >
                                        <CheckCheck className="w-3.5 h-3.5" />
                                        อ่านทั้งหมด
                                    </button>
                                )}
                            </div>

                            {/* List */}
                            <div className="max-h-96 overflow-y-auto">
                                {notifications.length === 0 ? (
                                    <div className="py-10 text-center text-gray-400 text-sm">
                                        <Bell className="w-8 h-8 mx-auto mb-2 opacity-30" />
                                        ยังไม่มีการแจ้งเตือน
                                    </div>
                                ) : (
                                    notifications.map(noti => (
                                        <button
                                            key={noti.NotificationID}
                                            onClick={() => {
                                                if (!noti.IsRead) markAsRead(noti.NotificationID);
                                                setIsOpen(false);
                                                if (noti.Booking?.BookingDate) {
                                                    const dateStr = noti.Booking.BookingDate.split('T')[0];
                                                    router.push(`/service-center/bookings?date=${dateStr}`);
                                                } else {
                                                    router.push('/service-center/bookings');
                                                }
                                            }}
                                            className={`w-full text-left px-4 py-3 border-b border-gray-50 hover:bg-blue-50/50 transition-colors ${
                                                !noti.IsRead ? 'bg-blue-50/30' : ''
                                            }`}
                                        >
                                            <div className="flex gap-3">
                                                <span className="text-lg flex-shrink-0 mt-0.5">{getTypeIcon(noti.Type)}</span>
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex items-start justify-between gap-2">
                                                        <p className={`text-sm leading-snug ${!noti.IsRead ? 'font-bold text-gray-900' : 'text-gray-700'}`}>
                                                            {noti.Title}
                                                        </p>
                                                        {!noti.IsRead && (
                                                            <span className="w-2 h-2 bg-blue-500 rounded-full flex-shrink-0 mt-1.5" />
                                                        )}
                                                    </div>
                                                    <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{noti.Message}</p>
                                                    <p className="text-[10px] text-gray-400 mt-1">{timeAgo(noti.CreateDate)}</p>
                                                </div>
                                            </div>
                                        </button>
                                    ))
                                )}
                            </div>
                        </div>
                    )}
                </div>

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
