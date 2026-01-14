// Admin Layout
// Wraps all admin pages with sidebar and header

'use client';

import { SessionProvider } from 'next-auth/react';
import { Sidebar, Header } from '@/components/layouts';

export default function AdminLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <SessionProvider>
            <div className="min-h-screen bg-gray-50">
                <Sidebar />
                <div className="ml-64 min-h-screen flex flex-col">
                    <main className="flex-1 p-6">{children}</main>
                </div>
            </div>
        </SessionProvider>
    );
}
