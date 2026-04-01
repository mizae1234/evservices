// Profile Layout
// Wraps profile page with sidebar

'use client';

import { SessionProvider } from 'next-auth/react';
import { Sidebar } from '@/components/layouts';

export default function ProfileLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <SessionProvider>
            <div className="min-h-screen bg-gray-50">
                <Sidebar />
                <div className="lg:ml-64 min-h-screen flex flex-col">
                    <main className="flex-1 p-4 pt-16 lg:p-6 lg:pt-6">{children}</main>
                </div>
            </div>
        </SessionProvider>
    );
}
