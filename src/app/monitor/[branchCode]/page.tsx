// Customer Monitor (public, big screen): แสดงเฉพาะเลขคิวและสถานะ อัปเดต realtime ด้วย SSE + polling สำรอง

'use client';

export const dynamic = 'force-dynamic';

import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { Clock, Volume2, VolumeX, WifiOff } from 'lucide-react';
import { QUEUE_STATUS_LABEL, QueueStatus } from '@/lib/queue-status';

interface Snapshot { branchName: string; queues: { label: string; status: QueueStatus; plate: string; service?: string }[]; channels?: Record<string, { name: string; no: string }> }
interface CallEvent { id: string; label: string; plate?: string; channel?: { name: string; no: string } }

const COLUMNS: { status: QueueStatus; header: string; chip: string }[] = [
    { status: 'WAITING_CALL', header: 'bg-emerald-500', chip: 'border-emerald-200 text-emerald-800' },
    { status: 'WAITING_REPAIR', header: 'bg-teal-500', chip: 'border-teal-200 text-teal-800' },
    { status: 'IN_REPAIR', header: 'bg-green-600', chip: 'border-green-300 text-green-800' },
    { status: 'WAITING_PAYMENT', header: 'bg-lime-600', chip: 'border-lime-300 text-lime-800' },
];

const THAI_DIGITS = ['ศูนย์', 'หนึ่ง', 'สอง', 'สาม', 'สี่', 'ห้า', 'หก', 'เจ็ด', 'แปด', 'เก้า'];
const THAI_LETTERS: Record<string, string> = { A: 'เอ', B: 'บี', C: 'ซี', D: 'ดี', E: 'อี', F: 'เอฟ', G: 'จี', H: 'เอช', I: 'ไอ', J: 'เจ', K: 'เค', L: 'แอล', M: 'เอ็ม', N: 'เอ็น', O: 'โอ', P: 'พี', Q: 'คิว', R: 'อาร์', S: 'เอส', T: 'ที', U: 'ยู', V: 'วี', W: 'ดับเบิลยู', X: 'เอ็กซ์', Y: 'วาย', Z: 'แซด' };

function speakableNumber(no: string) {
    return Array.from(no).map((c) => (/\d/.test(c) ? THAI_DIGITS[Number(c)] : THAI_LETTERS[c.toUpperCase()] ?? c)).join(' ');
}

function speakableLabel(label: string) {
    return Array.from(label).map((c) => (/\d/.test(c) ? THAI_DIGITS[Number(c)] : THAI_LETTERS[c.toUpperCase()] ?? c)).join(' ');
}

function playChime(ctx: AudioContext) {
    const t0 = ctx.currentTime;
    [659.25, 523.25].forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0.0001, t0 + i * 0.35);
        gain.gain.exponentialRampToValueAtTime(0.4, t0 + i * 0.35 + 0.03);
        gain.gain.exponentialRampToValueAtTime(0.0001, t0 + i * 0.35 + 0.6);
        osc.connect(gain).connect(ctx.destination);
        osc.start(t0 + i * 0.35);
        osc.stop(t0 + i * 0.35 + 0.65);
    });
}

function useBangkokClock() {
    const [now, setNow] = useState<Date | null>(null);
    useEffect(() => {
        const tick = () => setNow(new Date());
        const first = setTimeout(tick, 0);
        const timer = setInterval(tick, 1000);
        return () => { clearTimeout(first); clearInterval(timer); };
    }, []);
    return now;
}

function MonitorContent() {
    const { branchCode } = useParams<{ branchCode: string }>();
    const token = useSearchParams().get('t') || '';
    const [snap, setSnap] = useState<Snapshot | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [offline, setOffline] = useState(false);
    const now = useBangkokClock();
    const [soundOn, setSoundOn] = useState(false);
    const [calls, setCalls] = useState<CallEvent[]>([]);
    const [pulseId, setPulseId] = useState<string | null>(null);
    const soundOnRef = useRef(false);
    const audioRef = useRef<AudioContext | null>(null);
    const lastCallId = useRef<string | null>(null);
    const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const callsKey = `evq-calls:${branchCode}`;

    const load = useCallback(async () => {
        try {
            const res = await fetch(`/api/public/queue/${encodeURIComponent(branchCode)}/snapshot?t=${encodeURIComponent(token)}`, { cache: 'no-store' });
            const data = await res.json();
            if (data.success) {
                setSnap(data.data);
                setError(null);
                setOffline(false);
            } else {
                setError(data.error || 'ไม่สามารถโหลดข้อมูลได้');
            }
        } catch {
            setOffline(true);
        }
    }, [branchCode, token]);

    const announce = useCallback((call: CallEvent) => {
        if (lastCallId.current === call.id) return;
        lastCallId.current = call.id;
        // แสดงในแถบ "กำลังเรียกคิว" ด้านบนต่อเนื่อง (เก็บประวัติไว้ แม้รีเฟรชหน้า)
        setCalls(() => {
            const next = [call];
            try { localStorage.setItem(callsKey, JSON.stringify({ d: new Date().toDateString(), calls: next })); } catch { /* ignore */ }
            return next;
        });
        setPulseId(call.id);
        if (hideTimer.current) clearTimeout(hideTimer.current);
        hideTimer.current = setTimeout(() => setPulseId(null), 9000);
        if (!soundOnRef.current) return;
        try {
            if (audioRef.current) playChime(audioRef.current);
            if ('speechSynthesis' in window) {
                window.speechSynthesis.cancel();
                const where = call.channel ? ` ที่${call.channel.name}หมายเลข ${speakableNumber(call.channel.no)}` : '';
                const text = `ขอเชิญหมายเลข ${speakableLabel(call.label)}${where} ค่ะ`;
                [0, 1].forEach(() => {
                    const u = new SpeechSynthesisUtterance(text);
                    u.lang = 'th-TH';
                    u.rate = 0.9;
                    window.speechSynthesis.speak(u);
                });
            }
        } catch { /* เสียงใช้ไม่ได้ ยังมีการแสดงผลบนจอ */ }
    }, [callsKey]);

    const enableSound = () => {
        try {
            const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
            audioRef.current = audioRef.current ?? new Ctx();
            audioRef.current.resume();
            if ('speechSynthesis' in window) window.speechSynthesis.speak(new SpeechSynthesisUtterance(''));
        } catch { /* ignore */ }
        soundOnRef.current = true;
        setSoundOn(true);
    };

    useEffect(() => {
        const restore = setTimeout(() => {
            try {
                const saved = JSON.parse(localStorage.getItem(callsKey) || 'null');
                if (saved?.d === new Date().toDateString() && Array.isArray(saved.calls)) setCalls(saved.calls);
            } catch { /* ignore */ }
        }, 0);
        return () => clearTimeout(restore);
    }, [callsKey]);

    useEffect(() => {
        const first = setTimeout(load, 0);
        // SSE เป็นช่องทางหลัก; polling ทุก 15 วินาทีเป็นตัวสำรองเมื่อ SSE หลุด
        const es = new EventSource(`/api/public/queue/${encodeURIComponent(branchCode)}/stream?t=${encodeURIComponent(token)}`);
        es.addEventListener('update', () => load());
        es.addEventListener('call', (e) => {
            try { announce(JSON.parse((e as MessageEvent).data)); } catch { /* ignore */ }
        });
        es.onopen = () => load();
        const poll = setInterval(load, 15000);
        return () => {
            clearTimeout(first);
            es.close();
            clearInterval(poll);
        };
    }, [branchCode, token, load, announce]);

    if (error) {
        return <div className="flex min-h-screen items-center justify-center bg-emerald-50 text-3xl font-semibold text-emerald-800">{error}</div>;
    }

    const timeText = now?.toLocaleTimeString('th-TH', { timeZone: 'Asia/Bangkok', hour: '2-digit', minute: '2-digit', second: '2-digit' }) ?? '';
    const dateText = now?.toLocaleDateString('th-TH', { timeZone: 'Asia/Bangkok', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) ?? '';

    return (
        <div className="flex h-dvh flex-col overflow-hidden bg-gradient-to-b from-emerald-50 via-white to-emerald-50 p-4 lg:p-6">
            {/* ส่วนหัวเดียว: ชื่อสาขา + เวลา (ซ้าย) | คิวที่กำลังเรียก + ปุ่มเสียง (ขวา) */}
            <header className="mb-4 flex shrink-0 items-stretch justify-between gap-5 rounded-2xl border border-emerald-100 bg-white px-5 py-3 shadow-sm">
                <div className="flex min-w-0 items-center gap-6">
                    <div className="min-w-0">
                        <h1 className="text-2xl font-bold leading-tight text-emerald-900 lg:text-3xl xl:text-4xl">{snap?.branchName ?? ' '}</h1>
                        <p className="text-base text-emerald-700 lg:text-lg">สถานะคิวบริการ</p>
                    </div>
                    <div className="shrink-0 border-l border-emerald-100 pl-6">
                        <p className="flex items-center gap-2 text-3xl font-bold tabular-nums leading-none text-emerald-700 lg:text-4xl"><Clock className="h-7 w-7" />{timeText}</p>
                        <p className="mt-1.5 text-sm leading-none text-gray-500">{dateText}</p>
                        {offline && (
                            <span className="mt-1.5 inline-flex items-center gap-1.5 rounded-full bg-red-100 px-2.5 py-1 text-sm font-medium text-red-700"><WifiOff className="h-4 w-4" />ขาดการเชื่อมต่อ</span>
                        )}
                    </div>
                </div>

                <div className={`flex shrink-0 items-center gap-5 rounded-xl px-5 py-2 ${calls[0] ? 'bg-emerald-600 text-white' : 'bg-emerald-50 text-emerald-700'} ${calls[0] && pulseId === calls[0].id ? 'animate-pulse' : ''}`}>
                    <span className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-full ${calls[0] ? 'bg-white/20' : 'bg-emerald-100'}`}><Volume2 className="h-8 w-8" strokeWidth={2.5} /></span>
                    <div className="min-w-0">
                        <p className="text-base leading-tight">กำลังเรียกคิว</p>
                        {calls[0] ? (
                            <div className="flex items-end gap-4 whitespace-nowrap">
                                <span className="text-5xl font-extrabold leading-none tracking-wider">{calls[0].label}</span>
                                {calls[0].channel && (
                                    <div className="flex flex-col leading-tight">
                                        <span className="text-sm text-emerald-100">{calls[0].channel.name}</span>
                                        <span className="text-xl font-semibold text-white">หมายเลข {calls[0].channel.no}</span>
                                    </div>
                                )}
                                {calls[0].plate && (
                                    <div className="flex flex-col leading-tight">
                                        <span className="text-sm text-emerald-100">ทะเบียนรถ</span>
                                        <span className="text-xl font-semibold text-white">{calls[0].plate}</span>
                                    </div>
                                )}
                            </div>
                        ) : (
                            <p className="text-xl font-medium">ยังไม่มีการเรียกคิว</p>
                        )}
                    </div>
                    {/* แสดงเฉพาะก่อนเปิดเสียง (เบราว์เซอร์ต้องมีการแตะหนึ่งครั้ง) แตะแล้วปุ่มหายไป */}
                    {!soundOn && (
                        <button
                            type="button"
                            onClick={enableSound}
                            className="inline-flex shrink-0 animate-pulse items-center gap-1.5 rounded-full bg-amber-100 px-3 py-1.5 text-sm font-medium text-amber-800 ring-2 ring-amber-300"
                        >
                            <VolumeX className="h-4 w-4" />แตะเพื่อเปิดเสียง
                        </button>
                    )}
                </div>
            </header>

            <div className="grid min-h-0 flex-1 grid-cols-4 grid-rows-1 gap-4">
                {COLUMNS.map(({ status, header, chip }) => {
                    const items = (snap?.queues ?? []).filter((q) => q.status === status);
                    return (
                        <section key={status} className="flex min-h-0 flex-col overflow-hidden rounded-2xl border border-emerald-100 bg-white shadow-sm">
                            <h2 className={`shrink-0 px-2 py-3 text-center text-2xl font-bold text-white lg:text-3xl ${header}`}>
                                {QUEUE_STATUS_LABEL[status]}
                                <span className="ml-2 rounded-full bg-white/25 px-2.5 py-0.5 text-lg">{items.length}</span>
                            </h2>
                            <div className="min-h-0 flex-1 overflow-y-auto p-3 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                                <div className="grid grid-cols-2 gap-3">
                                    {items.map((q) => (
                                        <div
                                            key={q.label}
                                            className={`flex flex-col items-center justify-center whitespace-nowrap rounded-xl border-2 bg-emerald-50/50 px-1 py-3 font-extrabold leading-none tracking-wide text-[clamp(1.5rem,2.4vw,3rem)] ${chip}`}
                                        >
                                            <span>{q.label}</span>
                                            <span className="mt-1.5 text-[0.42em] font-semibold text-gray-600">{q.plate}</span>
                                            {q.service && <span className="mt-1 max-w-full truncate px-1 text-[0.3em] font-medium text-emerald-700">{q.service}</span>}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </section>
                    );
                })}
            </div>
        </div>
    );
}

export default function MonitorPage() {
    return (
        <Suspense fallback={<div className="min-h-screen bg-emerald-50" />}>
            <MonitorContent />
        </Suspense>
    );
}
