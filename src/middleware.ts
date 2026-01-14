// Middleware for route protection
// Handles role-based access control

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getToken } from 'next-auth/jwt';

export async function middleware(request: NextRequest) {
    const token = await getToken({
        req: request,
        secret: process.env.NEXTAUTH_SECRET,
    });

    const { pathname } = request.nextUrl;

    // Public routes that don't require authentication
    const publicRoutes = ['/auth/login', '/api/auth', '/api/mileages', '/api/car-models', '/api/branches'];
    const isPublicRoute = publicRoutes.some((route) => pathname.startsWith(route));

    // Allow public routes
    if (isPublicRoute) {
        // Redirect to dashboard if already logged in
        if (token && pathname === '/auth/login') {
            const redirectUrl = token.role === 'ADMIN' ? '/admin/overview' : '/service-center/dashboard';
            return NextResponse.redirect(new URL(redirectUrl, request.url));
        }
        return NextResponse.next();
    }

    // Check if user is authenticated
    if (!token) {
        const loginUrl = new URL('/auth/login', request.url);
        loginUrl.searchParams.set('callbackUrl', pathname);
        return NextResponse.redirect(loginUrl);
    }

    // Role-based route protection
    if (pathname.startsWith('/admin')) {
        // Admin routes require ADMIN role
        if (token.role !== 'ADMIN') {
            return NextResponse.redirect(new URL('/service-center/dashboard', request.url));
        }
    }

    if (pathname.startsWith('/service-center')) {
        // Service center routes allow SERVICE_CENTER and ADMIN roles
        if (token.role !== 'SERVICE_CENTER' && token.role !== 'ADMIN') {
            return NextResponse.redirect(new URL('/auth/login', request.url));
        }
    }

    // Redirect root to appropriate dashboard
    if (pathname === '/') {
        const redirectUrl = token.role === 'ADMIN' ? '/admin/overview' : '/service-center/dashboard';
        return NextResponse.redirect(new URL(redirectUrl, request.url));
    }

    return NextResponse.next();
}

export const config = {
    matcher: [
        /*
         * Match all request paths except for:
         * - _next/static (static files)
         * - _next/image (image optimization files)
         * - favicon.ico (favicon file)
         * - public folder
         */
        '/((?!_next/static|_next/image|favicon.ico|uploads).*)',
    ],
};
