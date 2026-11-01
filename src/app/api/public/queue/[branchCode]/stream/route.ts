// Public SSE: แจ้ง Monitor ว่าคิวของสาขามีการเปลี่ยนแปลง (client ไป fetch snapshot ใหม่)
// ใช้ in-memory pub/sub จึงรองรับเฉพาะ deploy แบบ instance เดียว

import { NextRequest } from 'next/server';
import { resolvePublicBranch } from '@/lib/queue-public';
import { subscribeQueueCall, subscribeQueueChange } from '@/lib/queue-events';
import { getClientIp, rateLimit } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request: NextRequest, { params }: { params: Promise<{ branchCode: string }> }) {
    if (!rateLimit(`sse:${getClientIp(request)}`, 30, 60_000)) {
        return new Response('Too Many Requests', { status: 429 });
    }
    const { branchCode } = await params;
    const branch = await resolvePublicBranch(branchCode, 'monitor', request.nextUrl.searchParams.get('t'));
    if (!branch) return new Response('Not found', { status: 404 });

    const encoder = new TextEncoder();
    let cleanup = () => {};

    const stream = new ReadableStream({
        start(controller) {
            const send = (chunk: string) => {
                try { controller.enqueue(encoder.encode(chunk)); } catch { cleanup(); }
            };
            send('retry: 3000\n\n: connected\n\n');
            const unsubscribe = subscribeQueueChange(branch.BranchID, () => send('event: update\ndata: 1\n\n'));
            const unsubscribeCall = subscribeQueueCall(branch.BranchID, (payload) => send(`event: call\ndata: ${JSON.stringify(payload)}\n\n`));
            const heartbeat = setInterval(() => send(': ping\n\n'), 25_000);
            cleanup = () => {
                clearInterval(heartbeat);
                unsubscribe();
                unsubscribeCall();
                try { controller.close(); } catch { /* already closed */ }
            };
            request.signal.addEventListener('abort', cleanup);
        },
        cancel() {
            cleanup();
        },
    });

    return new Response(stream, {
        headers: {
            'Content-Type': 'text/event-stream; charset=utf-8',
            'Cache-Control': 'no-cache, no-transform',
            Connection: 'keep-alive',
            'X-Accel-Buffering': 'no',
        },
    });
}
