// NextAuth Type Declarations

import { UserRole } from '@/types';
import 'next-auth';

declare module 'next-auth' {
    interface Session {
        user: {
            id: string;
            email: string;
            name: string;
            role: UserRole;
            branchId?: number;
            branchName?: string;
        };
    }

    interface User {
        id: string;
        email: string;
        name: string;
        role: UserRole;
        branchId?: number;
        branchName?: string;
    }
}

declare module 'next-auth/jwt' {
    interface JWT {
        id: string;
        role: UserRole;
        branchId?: number;
        branchName?: string;
    }
}
