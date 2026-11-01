// Customer Check-in (public): ลูกค้าสแกน QR ประจำสาขา → กรอกทะเบียน → ตรวจสอบข้อมูล → เช็คอิน → ติดตามสถานะคิว

'use client';

export const dynamic = 'force-dynamic';

import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import {
    AlertCircle, CalendarClock, Car, CheckCircle2, ChevronLeft, Clock, Loader2, RefreshCw, Search, Sparkles, Ticket, User,
} from 'lucide-react';
import { QUEUE_STATUS_LABEL, QueueStatus } from '@/lib/queue-status';

interface ServiceTypeOption { ServiceTypeID: number; Name: string }
interface Info { branchName: string; serviceTypes: ServiceTypeOption[] }
interface TicketView {
    queueLabel: string; status: QueueStatus; statusLabel: string; serviceTypeName: string | null;
    checkInAt: string; aheadCount: number; expired: boolean; needsReview: boolean; branchName?: string;
}
type Lookup =
    | { kind: 'ticket'; ticketKey: string; ticket: TicketView }
    | { kind: 'booking'; booking: { bookingNo: string; bookingDate: string; carRegister: string; startTime: string; endTime: string; serviceTypeId: number | null; serviceTypeName: string | null; carModel: string; customerName: string; customerPhone: string } }
    | { kind: 'vehicle'; vehicle: { carRegister: string; carModel: string | null; customerName: string } }
    | { kind: 'new' };

const STEPS: QueueStatus[] = ['WAITING_CALL', 'WAITING_REPAIR', 'IN_REPAIR', 'WAITING_PAYMENT'];
const STATUS_MESSAGE: Record<QueueStatus, string> = {
    WAITING_CALL: 'เช็คอินเรียบร้อยแล้ว เจ้าหน้าที่จะเรียกคิวตามลำดับ',
    WAITING_REPAIR: 'เจ้าหน้าที่ตรวจรับรถเรียบร้อยแล้ว กำลังรอเข้าช่องให้บริการ',
    IN_REPAIR: 'รถของคุณอยู่ระหว่างการให้บริการ',
    WAITING_PAYMENT: 'งานเสร็จเรียบร้อย กรุณากลับมาที่เคาน์เตอร์เพื่อชำระเงิน',
    DONE: 'เสร็จสิ้นการให้บริการ ขอบคุณที่ใช้บริการ',
    CANCELLED: 'คิวนี้ถูกยกเลิกแล้ว',
    NO_SHOW: 'เรียกคิวแล้วไม่พบลูกค้า หากยังต้องการรับบริการ กรุณาเช็คอินใหม่หรือติดต่อเจ้าหน้าที่',
};

const inputCls = 'w-full rounded-xl border border-emerald-200 bg-white px-4 py-3 text-base text-gray-900 placeholder-gray-400 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-200';
const primaryBtn = 'inline-flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-3.5 text-base font-semibold text-white shadow-sm transition hover:bg-emerald-700 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50';

function formatThaiDate(ymd: string) {
    const [y, m, d] = ymd.split('-').map(Number);
    return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('th-TH', { timeZone: 'UTC', day: 'numeric', month: 'long', year: 'numeric' });
}

function formatTime(iso: string) {
    return new Date(iso).toLocaleTimeString('th-TH', { timeZone: 'Asia/Bangkok', hour: '2-digit', minute: '2-digit' });
}

function TicketCard({ ticket, onRefresh, refreshing, onReset }: { ticket: TicketView; onRefresh: () => void; refreshing: boolean; onReset: () => void }) {
    const stepIndex = STEPS.indexOf(ticket.status);
    const closed = stepIndex === -1;
    return (
        <div className="space-y-5">
            <div className="rounded-2xl bg-gradient-to-br from-emerald-500 to-green-600 p-6 text-center text-white shadow-lg">
                <p className="text-sm text-emerald-50">หมายเลขคิวของคุณ</p>
                <p className="my-1 text-7xl font-extrabold tracking-wide">{ticket.queueLabel}</p>
                {ticket.serviceTypeName && <p className="text-sm text-emerald-50">{ticket.serviceTypeName}</p>}
                <p className="mt-2 text-xs text-emerald-100">เช็คอินเมื่อ {formatTime(ticket.checkInAt)} น.</p>
            </div>

            <div className="rounded-2xl border border-emerald-100 bg-white p-4 text-center shadow-sm">
                <p className="text-xs text-gray-500">สถานะปัจจุบัน</p>
                <p className="text-2xl font-bold text-emerald-700">{ticket.statusLabel}</p>
                <p className="mt-1 text-sm text-gray-600">{STATUS_MESSAGE[ticket.status]}</p>
                {ticket.status === 'WAITING_CALL' && (
                    <p className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-sm font-medium text-emerald-700">
                        <Clock className="h-4 w-4" />
                        {ticket.aheadCount > 0 ? `มีคิวรอก่อนหน้าคุณ ${ticket.aheadCount} คิว` : 'คุณอยู่ลำดับถัดไป เตรียมตัวได้เลย'}
                    </p>
                )}
                {ticket.needsReview && <p className="mt-3 text-xs text-amber-700">ไม่พบรายการจองของท่าน เจ้าหน้าที่จะตรวจสอบข้อมูลให้</p>}
            </div>

            {!closed && (
                <ol className="flex items-start justify-between px-1">
                    {STEPS.map((s, i) => (
                        <li key={s} className="flex flex-1 flex-col items-center text-center">
                            <div className="flex w-full items-center">
                                <div className={`h-0.5 flex-1 ${i === 0 ? 'bg-transparent' : i <= stepIndex ? 'bg-emerald-500' : 'bg-gray-200'}`} />
                                <div className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold ${i < stepIndex ? 'bg-emerald-500 text-white' : i === stepIndex ? 'bg-emerald-600 text-white ring-4 ring-emerald-200' : 'bg-gray-200 text-gray-500'}`}>
                                    {i < stepIndex ? '✓' : i + 1}
                                </div>
                                <div className={`h-0.5 flex-1 ${i === STEPS.length - 1 ? 'bg-transparent' : i < stepIndex ? 'bg-emerald-500' : 'bg-gray-200'}`} />
                            </div>
                            <span className={`mt-1 text-[11px] leading-tight ${i === stepIndex ? 'font-semibold text-emerald-700' : 'text-gray-500'}`}>{QUEUE_STATUS_LABEL[s]}</span>
                        </li>
                    ))}
                </ol>
            )}

            <div className="flex gap-2">
                <button type="button" onClick={onRefresh} className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl border border-emerald-200 bg-white px-4 py-3 text-sm font-medium text-emerald-700 hover:bg-emerald-50">
                    <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />รีเฟรชสถานะ
                </button>
                {closed && (
                    <button type="button" onClick={onReset} className="inline-flex flex-1 items-center justify-center rounded-xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-white hover:bg-emerald-700">เช็คอินใหม่</button>
                )}
            </div>
        </div>
    );
}

function CheckInContent() {
    const { branchCode } = useParams<{ branchCode: string }>();
    const searchParams = useSearchParams();
    const token = searchParams.get('t') || '';
    const urlTicket = searchParams.get('k') || '';
    const storageKey = `evq:${branchCode}`;
    const api = `/api/public/queue/${encodeURIComponent(branchCode)}`;

    const [info, setInfo] = useState<Info | null>(null);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [booting, setBooting] = useState(true);

    const [plate, setPlate] = useState('');
    const [lookup, setLookup] = useState<Lookup | null>(null);
    const [searching, setSearching] = useState(false);

    const [customerName, setCustomerName] = useState('');
    const [customerPhone, setCustomerPhone] = useState('');
    const [serviceTypeId, setServiceTypeId] = useState('');
    // เลือก "อื่นๆ" (ServiceTypeID ว่าง + พิมพ์รายละเอียดเอง)
    const [otherService, setOtherService] = useState(false);
    const [serviceOther, setServiceOther] = useState('');
    const [claimsBooking, setClaimsBooking] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const [ticketKey, setTicketKey] = useState<string | null>(null);
    const [ticket, setTicket] = useState<TicketView | null>(null);
    const [refreshing, setRefreshing] = useState(false);
    const infoLoaded = useRef(false);

    const saveTicket = useCallback((key: string) => {
        setTicketKey(key);
        try { localStorage.setItem(storageKey, JSON.stringify({ k: key, d: new Date().toDateString() })); } catch { /* ignore */ }
        const url = new URL(window.location.href);
        url.searchParams.set('k', key);
        window.history.replaceState(null, '', url.toString());
    }, [storageKey]);

    const clearTicket = useCallback(() => {
        setTicketKey(null);
        setTicket(null);
        setLookup(null);
        setPlate('');
        try { localStorage.removeItem(storageKey); } catch { /* ignore */ }
        const url = new URL(window.location.href);
        url.searchParams.delete('k');
        window.history.replaceState(null, '', url.toString());
    }, [storageKey]);

    const fetchTicket = useCallback(async (key: string, silent = false) => {
        if (!silent) setRefreshing(true);
        try {
            const res = await fetch(`${api}/ticket?t=${encodeURIComponent(token)}&k=${encodeURIComponent(key)}`, { cache: 'no-store' });
            const data = await res.json();
            if (data.success && !data.data.expired) {
                setTicket(data.data);
                return true;
            }
            if (res.status === 404 || (data.success && data.data.expired)) clearTicket();
        } catch {
            // เครือข่ายขัดข้องชั่วคราว: คงข้อมูลเดิมไว้
        } finally {
            if (!silent) setRefreshing(false);
        }
        return false;
    }, [api, token, clearTicket]);

    // โหลดข้อมูลสาขา + กู้คืนคิวเดิมจาก URL/เครื่อง (รีเฟรชแล้วไม่หาย)
    useEffect(() => {
        if (infoLoaded.current) return;
        infoLoaded.current = true;
        (async () => {
            try {
                const res = await fetch(`${api}/info?t=${encodeURIComponent(token)}`, { cache: 'no-store' });
                const data = await res.json();
                if (!data.success) {
                    setLoadError(data.error || 'ไม่สามารถโหลดข้อมูลได้');
                    return;
                }
                setInfo(data.data);
                let key = urlTicket;
                if (!key) {
                    try {
                        const saved = JSON.parse(localStorage.getItem(storageKey) || 'null');
                        if (saved?.k && saved.d === new Date().toDateString()) key = saved.k;
                    } catch { /* ignore */ }
                }
                if (key) {
                    const ok = await fetchTicket(key, true);
                    if (ok) saveTicket(key);
                }
            } catch {
                setLoadError('เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ กรุณาลองใหม่');
            } finally {
                setBooting(false);
            }
        })();
    }, [api, token, urlTicket, storageKey, fetchTicket, saveTicket]);

    // อัปเดตสถานะคิวอัตโนมัติ
    useEffect(() => {
        if (!ticketKey) return;
        const timer = setInterval(() => fetchTicket(ticketKey, true), 8000);
        return () => clearInterval(timer);
    }, [ticketKey, fetchTicket]);

    const doLookup = async (e: React.FormEvent) => {
        e.preventDefault();
        if (searching || !plate.trim()) return;
        setSearching(true);
        setError(null);
        try {
            const res = await fetch(`${api}/lookup`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ token, carRegister: plate }),
            });
            const data = await res.json();
            if (!data.success) {
                setError(data.error || 'ค้นหาข้อมูลไม่สำเร็จ');
                return;
            }
            const result = data.data as Lookup;
            if (result.kind === 'ticket') {
                setTicket(result.ticket);
                saveTicket(result.ticketKey);
                return;
            }
            if (result.kind === 'booking' && result.booking.serviceTypeId) setServiceTypeId(String(result.booking.serviceTypeId));
            setLookup(result);
        } catch {
            setError('เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ กรุณาลองใหม่');
        } finally {
            setSearching(false);
        }
    };

    const submit = async () => {
        if (submitting || !lookup) return;
        setSubmitting(true);
        setError(null);
        try {
            const res = await fetch(`${api}/checkin`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    token,
                    carRegister: plate,
                    customerName: lookup.kind === 'new' ? customerName : undefined,
                    customerPhone: needsPhone ? customerPhone : undefined,
                    serviceTypeId: !otherService && serviceTypeId ? Number(serviceTypeId) : null,
                    otherService: needsService && otherService,
                    serviceOther: needsService && otherService ? serviceOther.trim() : undefined,
                    claimsBooking: lookup.kind === 'new' ? claimsBooking : false,
                }),
            });
            const data = await res.json();
            if (data.success) {
                saveTicket(data.data.ticketKey);
                await fetchTicket(data.data.ticketKey, true);
            } else {
                setError(data.error || 'เช็คอินไม่สำเร็จ');
            }
        } catch {
            setError('เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ กรุณาลองใหม่');
        } finally {
            setSubmitting(false);
        }
    };

    const needsService = !!lookup && (lookup.kind !== 'booking' || !lookup.booking.serviceTypeId);
    // ลูกค้าที่มีการจอง (และมีเบอร์ในการจอง) ไม่ต้องกรอกเบอร์ซ้ำ
    const needsPhone = !!lookup && !(lookup.kind === 'booking' && lookup.booking.customerPhone);
    const canSubmit = !!lookup
        && (!needsPhone || customerPhone.length === 10)
        && (lookup.kind !== 'new' || customerName.trim().length > 0)
        && (!needsService || (otherService ? serviceOther.trim().length > 0 : !!serviceTypeId));

    return (
        <div className="min-h-screen bg-gradient-to-b from-emerald-50 via-white to-white">
            <div className="mx-auto w-full max-w-md px-4 pb-10 pt-8">
                <header className="mb-6 text-center">
                    <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-600 text-white shadow-md"><Ticket className="h-7 w-7" /></div>
                    <h1 className="text-2xl font-bold text-emerald-900">รับคิวเข้าศูนย์บริการ</h1>
                    <p className="text-sm text-emerald-700">{info?.branchName ?? ' '}</p>
                </header>

                <main className="rounded-3xl border border-emerald-100 bg-white p-5 shadow-sm">
                    {(booting && !loadError) && <div className="flex justify-center py-10 text-emerald-600"><Loader2 className="h-8 w-8 animate-spin" /></div>}

                    {loadError && (
                        <div className="flex items-start gap-2 rounded-xl bg-red-50 p-3 text-sm text-red-700"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />{loadError}</div>
                    )}

                    {!booting && info && ticket && (
                        <TicketCard ticket={ticket} refreshing={refreshing} onRefresh={() => ticketKey && fetchTicket(ticketKey)} onReset={clearTicket} />
                    )}

                    {!booting && info && !ticket && (
                        <div className="space-y-5">
                            {/* ขั้นที่ 1: ทะเบียนรถ */}
                            <form onSubmit={doLookup} className="space-y-3">
                                <label htmlFor="plate" className="block text-sm font-medium text-emerald-900">ค้นหาทะเบียนรถ</label>
                                <input
                                    id="plate"
                                    className={`${inputCls} text-center text-xl font-semibold tracking-wide`}
                                    placeholder="เช่น กข 1234"
                                    value={plate}
                                    onChange={(e) => { setPlate(e.target.value); if (lookup) setLookup(null); }}
                                    autoComplete="off"
                                    autoCapitalize="characters"
                                />
                                {!lookup && (
                                    <button type="submit" className={primaryBtn} disabled={searching || plate.trim().length < 2}>
                                        {searching ? <Loader2 className="h-5 w-5 animate-spin" /> : <Search className="h-5 w-5" />}
                                        ค้นหาข้อมูล
                                    </button>
                                )}
                            </form>

                            {error && (
                                <div className="flex items-start gap-2 rounded-xl bg-red-50 p-3 text-sm text-red-700"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />{error}</div>
                            )}

                            {/* ขั้นที่ 2: ผลการค้นหา */}
                            {lookup?.kind === 'booking' && (
                                <div className="space-y-3 rounded-2xl border border-emerald-200 bg-emerald-50/60 p-4">
                                    <p className="flex items-center gap-2 font-semibold text-emerald-800"><CalendarClock className="h-5 w-5" />พบการจองของคุณวันนี้</p>
                                    <dl className="space-y-1.5 text-sm">
                                        <Row label="เลขที่จอง" value={lookup.booking.bookingNo} />
                                        <Row label="ชื่อ-นามสกุล" value={lookup.booking.customerName} />
                                        <Row label="วันที่นัดหมาย" value={formatThaiDate(lookup.booking.bookingDate)} />
                                        <Row label="เวลานัดหมาย" value={`${lookup.booking.startTime} - ${lookup.booking.endTime} น.`} />
                                        <Row label="บริการ" value={lookup.booking.serviceTypeName ?? '-'} />
                                        <Row label="ทะเบียนรถ" value={lookup.booking.carRegister} />
                                        <Row label="รุ่นรถ" value={lookup.booking.carModel || '-'} />
                                    </dl>
                                </div>
                            )}
                            {lookup?.kind === 'vehicle' && (
                                <div className="space-y-1 rounded-2xl border border-emerald-200 bg-emerald-50/60 p-4">
                                    <p className="flex items-center gap-2 font-semibold text-emerald-800"><Sparkles className="h-5 w-5" />ข้อมูลลูกค้า</p>
                                    <dl className="space-y-1.5 text-sm">
                                        <Row label="ชื่อ-นามสกุล" value={lookup.vehicle.customerName || '-'} />
                                        <Row label="ทะเบียนรถ" value={lookup.vehicle.carRegister} />
                                        <Row label="รุ่นรถ" value={lookup.vehicle.carModel ?? '-'} />
                                    </dl>
                                    <p className="text-xs text-gray-500">ระบบจะใช้ข้อมูลนี้ให้อัตโนมัติ ไม่ต้องกรอกซ้ำ</p>
                                </div>
                            )}
                            {lookup?.kind === 'new' && (
                                <div className="space-y-3 rounded-2xl border border-emerald-100 bg-white p-1">
                                    <p className="flex items-center gap-2 text-sm font-medium text-emerald-800"><User className="h-4 w-4" />กรุณากรอกข้อมูลของคุณ</p>
                                    <input className={inputCls} placeholder="ชื่อ-นามสกุล" value={customerName} onChange={(e) => setCustomerName(e.target.value)} />
                                    <label className="flex items-center gap-2 text-sm text-gray-700">
                                        <input type="checkbox" className="h-4 w-4 accent-emerald-600" checked={claimsBooking} onChange={(e) => setClaimsBooking(e.target.checked)} />
                                        ฉันได้จองคิวล่วงหน้าไว้แล้ว
                                    </label>
                                </div>
                            )}

                            {needsPhone && (
                                <div className="space-y-1.5">
                                    <label htmlFor="phone" className="block text-sm font-medium text-emerald-900">เบอร์โทรติดต่อ <span className="text-red-500">*</span></label>
                                    <input id="phone" className={inputCls} inputMode="numeric" maxLength={10} placeholder="เบอร์โทร 10 หลัก" value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value.replace(/\D/g, ''))} />
                                    <p className="text-xs text-gray-500">ใช้สำหรับติดต่อกลับกรณีจำเป็นระหว่างรอรับบริการ</p>
                                </div>
                            )}

                            {needsService && (
                                <div className="space-y-2">
                                    <p className="text-sm font-medium text-emerald-900">เลือกประเภทบริการ</p>
                                    <div className="grid gap-2">
                                        {info.serviceTypes.map((s) => (
                                            <button
                                                key={s.ServiceTypeID}
                                                type="button"
                                                onClick={() => { setServiceTypeId(String(s.ServiceTypeID)); setOtherService(false); }}
                                                className={`flex items-center justify-between rounded-xl border px-4 py-3 text-left text-sm transition ${!otherService && serviceTypeId === String(s.ServiceTypeID) ? 'border-emerald-600 bg-emerald-50 font-semibold text-emerald-800 ring-2 ring-emerald-200' : 'border-gray-200 bg-white text-gray-700 hover:border-emerald-300'}`}
                                            >
                                                {s.Name}
                                                {!otherService && serviceTypeId === String(s.ServiceTypeID) && <CheckCircle2 className="h-5 w-5 text-emerald-600" />}
                                            </button>
                                        ))}
                                        <button
                                            type="button"
                                            onClick={() => { setOtherService(true); setServiceTypeId(''); }}
                                            className={`flex items-center justify-between rounded-xl border px-4 py-3 text-left text-sm transition ${otherService ? 'border-emerald-600 bg-emerald-50 font-semibold text-emerald-800 ring-2 ring-emerald-200' : 'border-gray-200 bg-white text-gray-700 hover:border-emerald-300'}`}
                                        >
                                            อื่นๆ
                                            {otherService && <CheckCircle2 className="h-5 w-5 text-emerald-600" />}
                                        </button>
                                    </div>
                                    {otherService && (
                                        <div className="space-y-1.5 pt-1">
                                            <label htmlFor="service-other" className="block text-sm font-medium text-emerald-900">ระบุบริการที่ต้องการ <span className="text-red-500">*</span></label>
                                            <input id="service-other" className={inputCls} maxLength={200} placeholder="เช่น คืนรถ, สอบถามข้อมูล" value={serviceOther} onChange={(e) => setServiceOther(e.target.value)} />
                                        </div>
                                    )}
                                </div>
                            )}

                            {lookup && (
                                <div className="space-y-2 pt-1">
                                    <button type="button" className={primaryBtn} disabled={!canSubmit || submitting} onClick={submit}>
                                        {submitting ? <Loader2 className="h-5 w-5 animate-spin" /> : <Car className="h-5 w-5" />}
                                        เช็คอินรับคิว
                                    </button>
                                    <button type="button" onClick={() => { setLookup(null); setError(null); }} className="inline-flex w-full items-center justify-center gap-1 text-sm text-gray-500 hover:text-emerald-700">
                                        <ChevronLeft className="h-4 w-4" />แก้ไขทะเบียน
                                    </button>
                                </div>
                            )}
                        </div>
                    )}
                </main>
                <p className="mt-4 text-center text-xs text-gray-400">ข้อมูลของคุณใช้เพื่อการให้บริการในศูนย์นี้เท่านั้น</p>
            </div>
        </div>
    );
}

function Row({ label, value }: { label: string; value: string }) {
    return (
        <div className="flex justify-between gap-3">
            <dt className="text-gray-500">{label}</dt>
            <dd className="text-right font-medium text-gray-900">{value}</dd>
        </div>
    );
}

export default function CheckInPage() {
    return (
        <Suspense fallback={<div className="flex min-h-screen items-center justify-center bg-emerald-50 text-emerald-600"><Loader2 className="h-8 w-8 animate-spin" /></div>}>
            <CheckInContent />
        </Suspense>
    );
}
