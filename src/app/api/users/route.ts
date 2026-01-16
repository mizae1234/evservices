// Users API Route
// GET - List all users (Admin only)
// POST - Create new user (Admin only)

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import bcrypt from 'bcryptjs';

// Helper: Get default password from email (prefix before @)
function getDefaultPassword(email: string): string {
    return email.split('@')[0];
}

// GET /api/users - Get all users
export async function GET(request: NextRequest) {
    try {
        const session = await getServerSession(authOptions);

        if (!session?.user) {
            return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
        }

        // Admin only
        if (session.user.role !== 'ADMIN') {
            return NextResponse.json({ success: false, error: 'Access denied' }, { status: 403 });
        }

        const searchParams = request.nextUrl.searchParams;
        const search = searchParams.get('search') || '';
        const page = parseInt(searchParams.get('page') || '1');
        const pageSize = parseInt(searchParams.get('pageSize') || '20');
        const skip = (page - 1) * pageSize;

        const where: Record<string, unknown> = {};
        if (search) {
            where.OR = [
                { Email: { contains: search } },
                { FullName: { contains: search } },
            ];
        }

        const [users, total] = await Promise.all([
            prisma.cM_User.findMany({
                where,
                include: {
                    Role: true,
                    Branch: true,
                },
                orderBy: { CreateDate: 'desc' },
                skip,
                take: pageSize,
            }),
            prisma.cM_User.count({ where }),
        ]);

        return NextResponse.json({
            success: true,
            data: users.map(u => ({
                UserID: u.UserID,
                Email: u.Email,
                FullName: u.FullName,
                Phone: u.Phone,
                RoleID: u.RoleID,
                BranchID: u.BranchID,
                IsActive: u.IsActive,
                CreateDate: u.CreateDate,
                Role: {
                    RoleCode: u.Role.RoleCode,
                    RoleName: u.Role.RoleName,
                },
                Branch: u.Branch ? {
                    BranchID: u.Branch.BranchID,
                    BranchName: u.Branch.BranchName,
                } : null,
            })),
            total,
            page,
            pageSize,
            totalPages: Math.ceil(total / pageSize),
        });
    } catch (error) {
        console.error('Error fetching users:', error);
        return NextResponse.json(
            { success: false, error: 'Failed to fetch users' },
            { status: 500 }
        );
    }
}

// POST /api/users - Create new user
export async function POST(request: NextRequest) {
    try {
        const session = await getServerSession(authOptions);

        if (!session?.user) {
            return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
        }

        // Admin only
        if (session.user.role !== 'ADMIN') {
            return NextResponse.json({ success: false, error: 'Access denied' }, { status: 403 });
        }

        const body = await request.json();
        const { Email, FullName, Phone, RoleID, BranchID } = body;

        // Validation
        if (!Email || !FullName || !RoleID) {
            return NextResponse.json(
                { success: false, error: 'Email, FullName, and RoleID are required' },
                { status: 400 }
            );
        }

        // Check if email already exists
        const existingUser = await prisma.cM_User.findUnique({
            where: { Email },
        });

        if (existingUser) {
            return NextResponse.json(
                { success: false, error: 'อีเมลนี้ถูกใช้งานแล้ว' },
                { status: 400 }
            );
        }

        // Generate default password from email prefix
        const defaultPassword = getDefaultPassword(Email);
        const hashedPassword = await bcrypt.hash(defaultPassword, 10);

        const user = await prisma.cM_User.create({
            data: {
                Email,
                FullName,
                Phone: Phone || null,
                RoleID: parseInt(RoleID),
                BranchID: BranchID ? parseInt(BranchID) : null,
                PasswordHash: hashedPassword,
                IsActive: true,
            },
            include: {
                Role: true,
                Branch: true,
            },
        });

        return NextResponse.json({
            success: true,
            data: {
                UserID: user.UserID,
                Email: user.Email,
                FullName: user.FullName,
                defaultPassword, // Return so admin can inform user
            },
            message: `สร้างผู้ใช้สำเร็จ รหัสผ่านเริ่มต้น: ${defaultPassword}`,
        });
    } catch (error) {
        console.error('Error creating user:', error);
        return NextResponse.json(
            { success: false, error: 'Failed to create user' },
            { status: 500 }
        );
    }
}
