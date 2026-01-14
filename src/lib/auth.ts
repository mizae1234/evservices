// NextAuth.js Configuration
// Handles authentication with Credentials provider

import { NextAuthOptions } from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';
import bcrypt from 'bcryptjs';
import prisma from './prisma';
import { SessionUser, UserRole } from '@/types';

export const authOptions: NextAuthOptions = {
    providers: [
        CredentialsProvider({
            name: 'Credentials',
            credentials: {
                email: { label: 'Email', type: 'email' },
                password: { label: 'Password', type: 'password' },
            },
            async authorize(credentials) {
                if (!credentials?.email || !credentials?.password) {
                    throw new Error('กรุณากรอก Email และ Password');
                }

                const user = await prisma.cM_User.findUnique({
                    where: { Email: credentials.email },
                    include: {
                        Role: true,
                        Branch: true,
                    },
                });

                if (!user) {
                    throw new Error('ไม่พบบัญชีผู้ใช้นี้');
                }

                if (!user.IsActive) {
                    throw new Error('บัญชีนี้ถูกระงับการใช้งาน');
                }

                const isPasswordValid = await bcrypt.compare(
                    credentials.password,
                    user.PasswordHash
                );

                if (!isPasswordValid) {
                    throw new Error('รหัสผ่านไม่ถูกต้อง');
                }

                return {
                    id: user.UserID.toString(),
                    email: user.Email,
                    name: user.FullName,
                    role: user.Role.RoleCode as UserRole,
                    branchId: user.BranchID || undefined,
                    branchName: user.Branch?.BranchName || undefined,
                };
            },
        }),
    ],
    callbacks: {
        async jwt({ token, user }) {
            if (user) {
                token.id = user.id;
                token.role = (user as SessionUser).role;
                token.branchId = (user as SessionUser).branchId;
                token.branchName = (user as SessionUser).branchName;
            }
            return token;
        },
        async session({ session, token }) {
            if (session.user) {
                (session.user as SessionUser).id = token.id as string;
                (session.user as SessionUser).role = token.role as UserRole;
                (session.user as SessionUser).branchId = token.branchId as number | undefined;

                // ดึงข้อมูลล่าสุดจาก DB ทุกครั้ง
                if (session.user.email) {
                    const freshUser = await prisma.cM_User.findUnique({
                        where: { Email: session.user.email },
                        include: { Branch: true },
                    });
                    if (freshUser) {
                        session.user.name = freshUser.FullName;
                        (session.user as SessionUser).branchId = freshUser.BranchID || undefined;
                        (session.user as SessionUser).branchName = freshUser.Branch?.BranchName || undefined;
                    }
                }
            }
            return session;
        },
    },
    pages: {
        signIn: '/login',
        error: '/login',
    },
    session: {
        strategy: 'jwt',
        maxAge: 24 * 60 * 60, // 24 hours
    },
    secret: process.env.NEXTAUTH_SECRET,
};
