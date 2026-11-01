// Next.js instrumentation: เริ่มงานตั้งเวลาฝั่ง server (ยกเลิกคิวค้างทุกเที่ยงคืน)

export async function register() {
    if (process.env.NEXT_RUNTIME === 'nodejs') {
        const { startQueueMidnightJob } = await import('./lib/queue-maintenance');
        startQueueMidnightJob();
    }
}
