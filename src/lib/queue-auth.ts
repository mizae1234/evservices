// Auth helper สำหรับ queue admin APIs: ADMIN ทุกสาขา, SERVICE_CENTER เฉพาะสาขาตัวเอง, CS ไม่มีสิทธิ์

import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { canManageQueue } from '@/lib/queue-status';

export async function getQueueUser() {
    const session = await getServerSession(authOptions);
    const user = session?.user;
    if (!user) return { error: 'Unauthorized' as const, status: 401 as const };
    const role = user.role as string;
    if (role !== 'ADMIN' && role !== 'SERVICE_CENTER') return { error: 'ไม่มีสิทธิ์จัดการคิว' as const, status: 403 as const };
    const branchId = user.branchId != null ? Number(user.branchId) : null;
    return {
        user: { id: Number(user.id), name: user.name || user.email || 'user', role, branchId },
        guard: (queueBranchId: number) => canManageQueue({ role, branchId }, queueBranchId),
    };
}
