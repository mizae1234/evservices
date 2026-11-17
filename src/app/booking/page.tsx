// Customer Self-Booking (public, mobile): คนขับจองคิวเอง → เลือกสาขาที่เปิดจอง → ระบบเสนอ 5 ช่วงเวลา → ติดตาม/ยกเลิกการจอง

'use client';

export const dynamic = 'force-dynamic';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, CalendarClock, CheckCircle2, ChevronLeft, Clock, Loader2, MapPin, Phone, Search, Sparkles, User, XCircle } from 'lucide-react';
import { computeMileageWindow } from '@/lib/mileage-rule';
import { getPlateWarnings } from '@/lib/plate-warning';

interface Branch { BranchID: number; BranchName: string; Address: string | null; Phone: string | null }
interface ServiceType { ServiceTypeID: number; Code: string; Name: string; RequiresMileage: boolean }
interface MileageOpt { mileageId: number; value: number; label: string; duration: number }
interface Options { branches: Branch[]; serviceTypes: ServiceType[]; mileageOptions: Record<number, MileageOpt[]> }
interface BookingView {
    bookingNo: string; status: number; statusLabel: string; date: string; startTime: string; endTime: string;
    branchName: string; serviceName: string | null; carRegister: string; canCancel: boolean;
    expired: boolean; started: boolean; closed: boolean;
}
interface Availability { full: boolean; todayFull?: boolean; nextAvailableDate: string | null; horizonDays: number; lastBookableDate: string; forService?: boolean; limitedByMileage?: boolean }
interface Slot { date: string; bayId: number; startTime: string; endTime: string }
interface Suggest {
    durationMinutes: number; autoApprove: boolean; slots: Slot[];
    mileage: { maxDays: number; remainingKm: number; urgent: boolean; lastBookableDate: string } | null;
}
interface LookupData {
    carRegister: string; hasActiveBooking: boolean; verified?: boolean; bookingKey?: string; booking?: BookingView;
    vehicle: { found: boolean; registerNo?: string; carModel: string | null; customerNameMasked: string; hasName: boolean };
}

type Step = 'loading' | 'identify' | 'details' | 'slots' | 'status';

const inputCls = 'w-full rounded-xl border border-emerald-200 bg-white px-4 py-3 text-base text-gray-900 placeholder-gray-400 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-200';
const primaryBtn = 'inline-flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-3.5 text-base font-semibold text-white shadow-sm transition hover:bg-emerald-700 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50';
const ghostBtn = 'inline-flex w-full items-center justify-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-3 text-base font-medium text-gray-700 transition hover:bg-gray-50 disabled:opacity-50';
const KEY_STORAGE = 'evbook:key';

/** วันนี้ตามเวลาไทย (YYYY-MM-DD) */
function getTodayStr() {
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok' }).format(new Date());
}

function formatThaiDate(ymd: string) {
    const [y, m, d] = ymd.split('-').map(Number);
    return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('th-TH', { timeZone: 'UTC', weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' });
}

async function api<T>(url: string, init?: RequestInit): Promise<{ ok: boolean; data?: T; error?: string; code?: string; message?: string }> {
    try {
        const res = await fetch(url, init);
        const json = await res.json().catch(() => null);
        if (!json) return { ok: false, error: 'เกิดข้อผิดพลาด กรุณาลองใหม่' };
        return json.success ? { ok: true, data: json.data, message: json.message } : { ok: false, error: json.error, code: json.code };
    } catch {
        return { ok: false, error: 'เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ กรุณาลองใหม่' };
    }
}

function post(body: unknown): RequestInit {
    return { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
}

function Card({ children }: { children: React.ReactNode }) {
    return <div className="rounded-3xl border border-emerald-100 bg-white p-5 shadow-sm">{children}</div>;
}

function Row({ label, value }: { label: string; value: string }) {
    return (
        <div className="flex justify-between gap-3">
            <dt className="text-gray-500">{label}</dt>
            <dd className="text-right font-medium text-gray-900">{value}</dd>
        </div>
    );
}

function ErrorBox({ message }: { message: string }) {
    return (
        <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /> <span>{message}</span>
        </div>
    );
}

function StatusCard({ booking, onCancel, cancelling, onNew }: { booking: BookingView; onCancel: () => void; cancelling: boolean; onNew: () => void }) {
    const cancelled = booking.status === 2;
    const done = booking.status === 3 || booking.status === 4;
    const confirmed = booking.status === 1 && !booking.expired;
    const tone = cancelled || booking.expired ? 'from-gray-400 to-gray-500' : confirmed || done ? 'from-emerald-500 to-green-600' : 'from-amber-400 to-orange-500';
    const message = cancelled
        ? 'การจองนี้ถูกยกเลิกแล้ว'
        : booking.expired
            ? 'หากยังต้องการเข้ารับบริการ กรุณาจองเวลาใหม่'
            : done
                ? 'ขอบคุณที่ใช้บริการ'
                : booking.started
                    ? 'ถึงเวลานัดหมายแล้ว หากมาไม่ทัน กรุณาติดต่อสาขา'
                    : confirmed
                        ? 'การจองของคุณได้รับการยืนยันแล้ว กรุณามาตามเวลานัด'
                        : 'สาขากำลังตรวจสอบ เมื่ออนุมัติแล้วหน้านี้จะแจ้งว่ายืนยันการจอง';
    return (
        <div className="space-y-4">
            <div className={`rounded-2xl bg-gradient-to-br ${tone} p-6 text-center text-white shadow-lg`}>
                {cancelled || booking.expired ? <XCircle className="mx-auto h-10 w-10" /> : confirmed || done ? <CheckCircle2 className="mx-auto h-10 w-10" /> : <Clock className="mx-auto h-10 w-10" />}
                <p className="mt-2 text-2xl font-extrabold">{booking.statusLabel}</p>
                <p className="mt-1 text-sm opacity-90">{message}</p>
            </div>
            <Card>
                <dl className="space-y-3 text-sm">
                    <div className="flex justify-between"><dt className="text-gray-500">เลขที่การจอง</dt><dd className="font-semibold text-gray-900">{booking.bookingNo}</dd></div>
                    <div className="flex justify-between"><dt className="text-gray-500">ทะเบียน</dt><dd className="font-semibold text-gray-900">{booking.carRegister}</dd></div>
                    <div className="flex justify-between"><dt className="text-gray-500">วันที่</dt><dd className="font-semibold text-gray-900">{formatThaiDate(booking.date)}</dd></div>
                    <div className="flex justify-between"><dt className="text-gray-500">เวลา</dt><dd className="font-semibold text-gray-900">{booking.startTime} - {booking.endTime} น.</dd></div>
                    <div className="flex justify-between"><dt className="text-gray-500">สาขา</dt><dd className="text-right font-semibold text-gray-900">{booking.branchName}</dd></div>
                    {booking.serviceName && <div className="flex justify-between"><dt className="text-gray-500">บริการ</dt><dd className="text-right font-semibold text-gray-900">{booking.serviceName}</dd></div>}
                </dl>
            </Card>
            {booking.canCancel && (
                <button className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-red-200 bg-white px-4 py-3 text-base font-medium text-red-600 hover:bg-red-50 disabled:opacity-50" disabled={cancelling} onClick={() => { if (confirm('ยืนยันยกเลิกการจองนี้?')) onCancel(); }}>
                    {cancelling ? <Loader2 className="h-4 w-4 animate-spin" /> : <XCircle className="h-4 w-4" />} ยกเลิกการจองนี้
                </button>
            )}
            {!booking.canCancel && <button className={primaryBtn} onClick={onNew}>จองใหม่</button>}
            {booking.canCancel && <p className="text-center text-xs text-gray-500">ต้องการจองใหม่ กรุณายกเลิกการจองเดิมก่อน</p>}
        </div>
    );
}

export default function SelfBookingPage() {
    const [step, setStep] = useState<Step>('loading');
    const [options, setOptions] = useState<Options | null>(null);
    const [error, setError] = useState('');
    const [busy, setBusy] = useState(false);

    // identify
    const [plate, setPlate] = useState('');
    const [phone, setPhone] = useState('');
    const [lookup, setLookup] = useState<LookupData | null>(null);
    // details
    const [name, setName] = useState('');
    const [carModel, setCarModel] = useState('');
    const [branchId, setBranchId] = useState<number | ''>('');
    const [serviceTypeId, setServiceTypeId] = useState<number | ''>('');
    const [mileageId, setMileageId] = useState<number | ''>('');
    const [currentMileage, setCurrentMileage] = useState('');
    // slots
    const [availState, setAvailState] = useState<{ key: string; data: Availability } | null>(null);
    const [suggest, setSuggest] = useState<Suggest | null>(null);
    const [selected, setSelected] = useState<Slot | null>(null);
    // status
    const [bookingKey, setBookingKey] = useState<string | null>(null);
    const [booking, setBooking] = useState<BookingView | null>(null);
    const [cancelling, setCancelling] = useState(false);
    const [notice, setNotice] = useState('');
    const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

    const serviceType = options?.serviceTypes.find((s) => s.ServiceTypeID === serviceTypeId);
    const mileageOpts = useMemo(() => (serviceTypeId ? options?.mileageOptions[serviceTypeId] ?? [] : []), [options, serviceTypeId]);
    const mileageNum = Math.trunc(Number(currentMileage));
    const selectedMileage = mileageOpts.find((m) => m.mileageId === mileageId);
    const mileageWindow = serviceType?.RequiresMileage && selectedMileage && mileageNum > 0 ? computeMileageWindow(mileageNum, selectedMileage.value) : null;

    const showStatus = useCallback((key: string, b: BookingView) => {
        setBookingKey(key);
        setBooking(b);
        setStep('status');
        try { localStorage.setItem(KEY_STORAGE, key); } catch { /* ignore */ }
    }, []);

    // โหลดตัวเลือก + กลับมาดูคิวเดิมถ้ามี key ใน localStorage
    useEffect(() => {
        (async () => {
            const opt = await api<Options>('/api/public/booking/options');
            if (!opt.ok || !opt.data) { setError(opt.error || 'โหลดข้อมูลไม่สำเร็จ'); setStep('identify'); return; }
            setOptions(opt.data);
            let saved: string | null = null;
            try { saved = localStorage.getItem(KEY_STORAGE); } catch { /* ignore */ }
            if (saved) {
                const st = await api<{ booking: BookingView }>(`/api/public/booking/${encodeURIComponent(saved)}`);
                if (st.ok && st.data && (st.data.booking.canCancel || st.data.booking.expired)) { showStatus(saved, st.data.booking); return; }
            }
            setStep('identify');
        })();
    }, [showStatus]);

    // ติดตามสถานะ: สาขาอนุมัติแล้วหน้านี้เปลี่ยนเป็น "ยืนยันการจองแล้ว" เอง
    useEffect(() => {
        if (step !== 'status' || !bookingKey || booking?.closed) return;
        const tick = async () => {
            const st = await api<{ booking: BookingView }>(`/api/public/booking/${encodeURIComponent(bookingKey)}`);
            if (st.ok && st.data) {
                setBooking((prev) => {
                    if (prev && prev.status === 0 && st.data!.booking.status === 1) setNotice('สาขาอนุมัติการจองของคุณแล้ว ✅');
                    return st.data!.booking;
                });
            }
        };
        pollRef.current = setInterval(tick, 8000);
        return () => { if (pollRef.current) clearInterval(pollRef.current); };
    }, [step, bookingKey, booking?.closed]);

    // เตือนล่วงหน้าเมื่อสาขาที่เลือกไม่มีที่นัดหมายว่าง: เช็คใหม่ทุกครั้งที่เปลี่ยนสาขา/บริการ/ระยะเช็ค/เลขไมล์
    // (เลือกบริการแล้วใช้เวลางานจริง + วันสูงสุดตามเลขไมล์ ก่อนหน้านั้นดูแบบกว้างๆ)
    const needMileage = !!serviceType?.RequiresMileage;
    const availReady = !serviceTypeId || !needMileage || (!!mileageId && mileageNum > 0 && !mileageWindow?.exceeded);
    const availKey = (() => {
        if (!branchId || !availReady) return '';
        const q = new URLSearchParams({ branchId: String(branchId) });
        if (serviceTypeId) {
            q.set('serviceTypeId', String(serviceTypeId));
            if (needMileage) { q.set('mileageId', String(mileageId)); q.set('currentMileage', String(mileageNum)); }
            if (carModel) q.set('carModel', carModel);
        }
        return q.toString();
    })();
    // ผลเช็คเก่าของเงื่อนไขอื่นไม่แสดง (ผูกกับ availKey ปัจจุบันเท่านั้น)
    const avail = availState && availState.key === availKey ? availState.data : null;
    useEffect(() => {
        if (!availKey) return;
        let cancelled = false;
        const t = setTimeout(() => {
            api<Availability>(`/api/public/booking/availability?${availKey}`).then((r) => { if (!cancelled && r.ok && r.data) setAvailState({ key: availKey, data: r.data }); });
        }, 400); // รอให้พิมพ์เลขไมล์เสร็จก่อน
        return () => { cancelled = true; clearTimeout(t); };
    }, [availKey]);

    const plateWarnings = getPlateWarnings(plate);

    const doLookup = async (e?: React.FormEvent) => {
        e?.preventDefault();
        if (busy || plate.trim().length < 2) return;
        setError(''); setBusy(true);
        const withPhone = lookup?.hasActiveBooking && phone.length === 10;
        const r = await api<LookupData>('/api/public/booking/lookup', post({ carRegister: plate, phone: withPhone ? phone : '' }));
        setBusy(false);
        if (!r.ok || !r.data) { setError(r.error || 'ตรวจสอบไม่สำเร็จ'); return; }
        if (r.data.hasActiveBooking && r.data.verified && r.data.bookingKey && r.data.booking) { showStatus(r.data.bookingKey, r.data.booking); return; }
        if (r.data.hasActiveBooking && withPhone) setError('เบอร์โทรไม่ตรงกับที่ใช้จองไว้ กรุณาตรวจสอบอีกครั้ง หรือติดต่อสาขา');
        setLookup(r.data);
        setCarModel(r.data.vehicle.carModel ?? '');
    };

    const goDetails = () => { setError(''); setStep('details'); };

    const doSuggest = async () => {
        setError(''); setBusy(true); setSelected(null);
        const r = await api<Suggest>('/api/public/booking/suggest', post({
            branchId, serviceTypeId, mileageId: serviceType?.RequiresMileage ? mileageId : null, currentMileage: mileageNum, carModel,
        }));
        setBusy(false);
        if (!r.ok || !r.data) { setError(r.error || 'ค้นหาเวลาว่างไม่สำเร็จ'); return; }
        setSuggest(r.data);
        setStep('slots');
    };

    const doConfirm = async () => {
        if (!selected) return;
        setError(''); setBusy(true);
        const r = await api<{ bookingKey: string; booking: BookingView }>('/api/public/booking', post({
            carRegister: plate, phone, customerName: name, carModel, branchId, serviceTypeId,
            mileageId: serviceType?.RequiresMileage ? mileageId : null, currentMileage: mileageNum,
            bayId: selected.bayId, date: selected.date, startTime: selected.startTime,
        }));
        setBusy(false);
        if (!r.ok || !r.data) {
            setError(r.error || 'จองไม่สำเร็จ');
            if (r.code === 'SLOT_TAKEN') await doSuggest(); // เวลาถูกจองไปแล้ว → ขอตัวเลือกใหม่
            return;
        }
        setNotice(r.message ?? '');
        showStatus(r.data.bookingKey, r.data.booking);
    };

    const doCancel = async () => {
        if (!bookingKey) return;
        setCancelling(true);
        const r = await api<{ booking: BookingView }>(`/api/public/booking/${encodeURIComponent(bookingKey)}/cancel`, { method: 'POST' });
        setCancelling(false);
        if (r.ok && r.data) { setBooking(r.data.booking); setNotice(''); try { localStorage.removeItem(KEY_STORAGE); } catch { /* ignore */ } }
        else setError(r.error || 'ยกเลิกไม่สำเร็จ');
    };

    const resetAll = () => {
        try { localStorage.removeItem(KEY_STORAGE); } catch { /* ignore */ }
        setStep('identify'); setPlate(''); setPhone(''); setName(''); setCarModel(''); setBooking(null); setBookingKey(null); setLookup(null); setSuggest(null); setSelected(null);
        setError(''); setNotice(''); setServiceTypeId(''); setMileageId(''); setCurrentMileage('');
    };

    const identifyReady =
        !!lookup && !lookup.hasActiveBooking && phone.length === 10 &&
        (lookup.vehicle.hasName || name.trim().length > 0) && (lookup.vehicle.found || carModel.trim().length > 0);

    const detailsReady =
        !!branchId && !avail?.full && !!serviceTypeId &&
        (!serviceType?.RequiresMileage || (!!mileageId && mileageNum > 0 && !mileageWindow?.exceeded));

    return (
        <div className="min-h-screen bg-gradient-to-b from-emerald-50 via-white to-white">
            <div className="mx-auto max-w-md space-y-5 px-4 py-6">
                <header className="text-center">
                    <div className="mx-auto mb-2 flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-600 text-white shadow-md"><CalendarClock className="h-7 w-7" /></div>
                    <h1 className="text-2xl font-bold text-emerald-900">จองเข้ารับบริการ</h1>
                    <p className="text-sm text-emerald-700">จองเองได้ง่ายๆ ใน 1 นาที</p>
                </header>

                {step === 'loading' && <div className="flex justify-center py-16"><Loader2 className="h-8 w-8 animate-spin text-emerald-600" /></div>}

                {step === 'identify' && (
                    <Card>
                        <div className="space-y-5">
                            <form onSubmit={doLookup} className="space-y-3">
                                <label htmlFor="plate" className="block text-sm font-medium text-emerald-900">ค้นหาทะเบียนรถ</label>
                                <input id="plate" className={`${inputCls} text-center text-xl font-semibold tracking-wide`} placeholder="เช่น กข 1234" value={plate}
                                    onChange={(e) => { setPlate(e.target.value); if (lookup) { setLookup(null); setError(''); } }} autoComplete="off" autoCapitalize="characters" />
                                {plateWarnings.length > 0 && (
                                    <div className="flex items-start gap-2 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800">
                                        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                                        <div>
                                            <p className="font-semibold">กรุณาตรวจสอบทะเบียนที่พิมพ์</p>
                                            <ul className="mt-1 list-disc space-y-0.5 pl-5">{plateWarnings.map((w) => <li key={w}>{w}</li>)}</ul>
                                        </div>
                                    </div>
                                )}
                                {error && (
                                    <div className="flex items-start gap-2 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800">
                                        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />{error}
                                    </div>
                                )}
                                {!lookup && (
                                    <button type="submit" className={primaryBtn} disabled={busy || plate.trim().length < 2}>
                                        {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <Search className="h-5 w-5" />} ค้นหาข้อมูล
                                    </button>
                                )}
                            </form>

                            {lookup?.hasActiveBooking && (
                                <div className="space-y-3 rounded-2xl border border-amber-200 bg-amber-50/70 p-4">
                                    <p className="flex items-center gap-2 font-semibold text-amber-800"><CalendarClock className="h-5 w-5" />รถคันนี้มีการจองอยู่แล้ว</p>
                                    <p className="text-sm text-amber-800">กรอกเบอร์โทรที่ใช้จอง เพื่อดูสถานะหรือยกเลิกการจองเดิม</p>
                                    <input className={inputCls} inputMode="numeric" maxLength={10} placeholder="เบอร์โทร 10 หลัก" value={phone} onChange={(e) => setPhone(e.target.value.replace(/\D/g, ''))} />
                                    <button type="button" className={primaryBtn} disabled={busy || phone.length !== 10} onClick={() => doLookup()}>
                                        {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : null} ดูการจองของฉัน
                                    </button>
                                </div>
                            )}

                            {lookup && !lookup.hasActiveBooking && (
                                <>
                                    {lookup.vehicle.found ? (
                                        <div className="space-y-1 rounded-2xl border border-emerald-200 bg-emerald-50/60 p-4">
                                            <p className="flex items-center gap-2 font-semibold text-emerald-800"><Sparkles className="h-5 w-5" />ข้อมูลลูกค้า</p>
                                            <dl className="space-y-1.5 text-sm">
                                                {lookup.vehicle.hasName && <Row label="ชื่อ-นามสกุล" value={lookup.vehicle.customerNameMasked} />}
                                                <Row label="ทะเบียนรถ" value={lookup.vehicle.registerNo ?? lookup.carRegister} />
                                                <Row label="รุ่นรถ" value={lookup.vehicle.carModel ?? '-'} />
                                            </dl>
                                            <p className="text-xs text-gray-500">{lookup.vehicle.hasName ? 'ระบบจะใช้ข้อมูลนี้ให้อัตโนมัติ ไม่ต้องกรอกซ้ำ' : 'ไม่พบชื่อผู้ใช้รถคันนี้ในระบบ กรุณากรอกชื่อของคุณด้านล่าง'}</p>
                                        </div>
                                    ) : (
                                        // ไม่พบ (หรือ EV7 เรียกไม่สำเร็จ): กรอกเองได้เสมอ ไม่แสดงข้อความเตือน
                                        <p className="flex items-center gap-2 text-sm font-medium text-emerald-800"><User className="h-4 w-4" />กรุณากรอกข้อมูลของคุณ</p>
                                    )}

                                    {!lookup.vehicle.hasName && (
                                        <div className="space-y-2">
                                            <label className="flex items-center gap-2 text-sm font-medium text-emerald-800"><User className="h-4 w-4" />ชื่อ-นามสกุล <span className="text-red-500">*</span></label>
                                            <input className={inputCls} placeholder="ชื่อ-นามสกุลผู้นำรถเข้าใช้บริการ" maxLength={100} value={name} onChange={(e) => setName(e.target.value)} />
                                        </div>
                                    )}
                                    {!lookup.vehicle.found && (
                                        <div className="space-y-2">
                                            <label className="block text-sm font-medium text-emerald-900">รุ่นรถ <span className="text-red-500">*</span></label>
                                            <input className={inputCls} placeholder="เช่น BYD Dolphin" maxLength={100} value={carModel} onChange={(e) => setCarModel(e.target.value)} />
                                        </div>
                                    )}

                                    <div className="space-y-1.5">
                                        <label htmlFor="phone" className="flex items-center gap-2 text-sm font-medium text-emerald-900"><Phone className="h-4 w-4" />เบอร์โทรติดต่อ <span className="text-red-500">*</span></label>
                                        <input id="phone" className={inputCls} inputMode="numeric" maxLength={10} placeholder="เบอร์โทร 10 หลัก" value={phone} onChange={(e) => setPhone(e.target.value.replace(/\D/g, ''))} />
                                        <p className="text-xs text-gray-500">ใช้สำหรับยืนยัน/ติดต่อกลับเรื่องการจอง และดูสถานะการจองภายหลัง</p>
                                    </div>

                                    <div className="space-y-2 pt-1">
                                        <button type="button" className={primaryBtn} disabled={!identifyReady} onClick={goDetails}>ถัดไป</button>
                                        <button type="button" onClick={() => { setLookup(null); setError(''); }} className="inline-flex w-full items-center justify-center gap-1 text-sm text-gray-500 hover:text-emerald-700">
                                            <ChevronLeft className="h-4 w-4" />แก้ไขทะเบียน
                                        </button>
                                    </div>
                                </>
                            )}
                            {lookup?.hasActiveBooking && (
                                <button type="button" onClick={() => { setLookup(null); setError(''); setPhone(''); }} className="inline-flex w-full items-center justify-center gap-1 text-sm text-gray-500 hover:text-emerald-700">
                                    <ChevronLeft className="h-4 w-4" />แก้ไขทะเบียน
                                </button>
                            )}
                        </div>
                    </Card>
                )}

                {step === 'details' && options && lookup && (
                    <Card>
                        <div className="space-y-4">
                            <button className="inline-flex items-center gap-1 text-sm text-gray-500" onClick={() => { setStep('identify'); setError(''); }}><ChevronLeft className="h-4 w-4" /> ย้อนกลับ</button>
                            <div className="rounded-xl bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
                                <p className="font-semibold">ทะเบียน {lookup.carRegister}</p>
                                <p>{[carModel, lookup.vehicle.hasName ? lookup.vehicle.customerNameMasked : name].filter(Boolean).join(' · ')} · โทร {phone}</p>
                            </div>

                            <label className="block">
                                <span className="mb-1.5 flex items-center gap-1.5 text-sm font-medium text-gray-700"><MapPin className="h-4 w-4" /> สาขา (เฉพาะที่เปิดให้จอง)</span>
                                <select className={inputCls} value={branchId} onChange={(e) => setBranchId(e.target.value ? Number(e.target.value) : '')}>
                                    <option value="">เลือกสาขา</option>
                                    {options.branches.map((b) => <option key={b.BranchID} value={b.BranchID}>{b.BranchName}</option>)}
                                </select>
                                {options.branches.length === 0 && <p className="mt-1 text-xs text-amber-600">ขณะนี้ยังไม่มีสาขาที่เปิดให้จองออนไลน์</p>}
                            </label>
                            {avail?.full && (
                                <div className="flex items-start gap-2 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2.5 text-sm text-amber-800">
                                    <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                                    <span>
                                        {avail.forService
                                            ? avail.limitedByMileage
                                                ? `สาขานี้ไม่มีเวลาว่างสำหรับบริการนี้ภายในวันที่ ${formatThaiDate(avail.lastBookableDate)} (ช่วงที่รถยังไม่เกินระยะเช็คตามเลขไมล์ของคุณ) กรุณาเลือกสาขาอื่น หรือติดต่อสาขาโดยตรง`
                                                : `สาขานี้ไม่มีเวลาว่างสำหรับบริการนี้ในช่วง ${avail.horizonDays} วันข้างหน้า กรุณาเลือกสาขาอื่น หรือติดต่อสาขาโดยตรง`
                                            : `สาขานี้ที่นัดหมายเต็มในช่วง ${avail.horizonDays} วันข้างหน้า กรุณาเลือกสาขาอื่น หรือติดต่อสาขาโดยตรง`}
                                    </span>
                                </div>
                            )}
                            {avail && !avail.full && avail.todayFull && avail.nextAvailableDate && avail.nextAvailableDate > getTodayStr() && (
                                <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50/70 px-3 py-2.5 text-sm text-amber-800">
                                    <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                                    <span>วันนี้ที่นัดหมายของสาขานี้เต็มแล้ว ที่ว่างเร็วสุดคือ {formatThaiDate(avail.nextAvailableDate)}</span>
                                </div>
                            )}

                            <label className="block">
                                <span className="mb-1.5 block text-sm font-medium text-gray-700">ประเภทบริการ</span>
                                <select className={inputCls} value={serviceTypeId} onChange={(e) => { setServiceTypeId(e.target.value ? Number(e.target.value) : ''); setMileageId(''); }}>
                                    <option value="">เลือกบริการ</option>
                                    {options.serviceTypes.map((s) => <option key={s.ServiceTypeID} value={s.ServiceTypeID}>{s.Name}{s.Code === 'MILEAGE_CHECK' ? ' (ยืนยันทันที)' : ''}</option>)}
                                </select>
                            </label>

                            {serviceType?.RequiresMileage && (
                                <>
                                    <label className="block">
                                        <span className="mb-1.5 block text-sm font-medium text-gray-700">เลขไมล์ปัจจุบัน (กิโลเมตร)</span>
                                        <input className={inputCls} inputMode="numeric" placeholder="ระบุเลขไมล์ปัจจุบันของรถยนต์" value={currentMileage} onChange={(e) => setCurrentMileage(e.target.value.replace(/\D/g, '').slice(0, 6))} />
                                    </label>
                                    <div>
                                        <span className="mb-1.5 block text-sm font-medium text-gray-700">ระยะเช็คที่ต้องการ</span>
                                        <div className="grid grid-cols-2 gap-2">
                                            {mileageOpts.map((m) => {
                                                const disabled = mileageNum > 0 && m.value <= mileageNum;
                                                const active = mileageId === m.mileageId;
                                                return (
                                                    <button key={m.mileageId} type="button" disabled={disabled} onClick={() => setMileageId(m.mileageId)}
                                                        className={`rounded-xl border px-3 py-2.5 text-sm font-medium transition ${active ? 'border-emerald-600 bg-emerald-600 text-white' : 'border-emerald-200 bg-white text-gray-800'} ${disabled ? 'cursor-not-allowed opacity-40' : ''}`}>
                                                        {m.label}
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    </div>
                                    {mileageWindow && !mileageWindow.exceeded && (
                                        <div className={`flex items-start gap-2 rounded-xl border px-3 py-2.5 text-sm ${mileageWindow.urgent ? 'border-amber-300 bg-amber-50 text-amber-800' : 'border-emerald-200 bg-emerald-50 text-emerald-800'}`}>
                                            <Sparkles className="mt-0.5 h-4 w-4 shrink-0" />
                                            <span>
                                                {mileageWindow.maxDays === 0
                                                    ? `เหลืออีก ${mileageWindow.remainingKm.toLocaleString()} กม. ถึงระยะเช็ค ควรเข้าบริการวันนี้ เพื่อไม่ให้เกินระยะ`
                                                    : `เหลืออีก ${mileageWindow.remainingKm.toLocaleString()} กม. ควรจองภายใน ${mileageWindow.maxDays} วัน เพื่อไม่ให้เกินระยะเช็ค`}
                                            </span>
                                        </div>
                                    )}
                                </>
                            )}

                            {error && <ErrorBox message={error} />}
                            <button className={primaryBtn} disabled={busy || !detailsReady} onClick={doSuggest}>
                                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CalendarClock className="h-4 w-4" />} ดูเวลาที่จองได้
                            </button>
                        </div>
                    </Card>
                )}

                {step === 'slots' && suggest && (
                    <Card>
                        <div className="space-y-4">
                            <button className="inline-flex items-center gap-1 text-sm text-gray-500" onClick={() => { setStep('details'); setError(''); }}><ChevronLeft className="h-4 w-4" /> ย้อนกลับ</button>
                            <div>
                                <h2 className="text-base font-semibold text-gray-900">เลือกเวลาที่สะดวก</h2>
                                <p className="text-xs text-gray-500">ใช้เวลาให้บริการประมาณ {suggest.durationMinutes} นาที · {suggest.autoApprove ? 'ยืนยันการจองทันที' : 'ต้องรอสาขาอนุมัติ'}</p>
                            </div>
                            {suggest.mileage?.urgent && (
                                <div className="flex items-start gap-2 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2.5 text-sm text-amber-800">
                                    <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                                    <span>เลขไมล์ใกล้ถึงระยะเช็ค ระบบจึงแสดงเฉพาะวันที่จองได้ไม่เกิน {formatThaiDate(suggest.mileage.lastBookableDate)}</span>
                                </div>
                            )}
                            {suggest.slots.length === 0 ? (
                                <div className="space-y-3">
                                    <ErrorBox message="ไม่มีเวลาว่างในช่วงที่รถยังไม่เกินระยะเช็ค กรุณาติดต่อสาขาโดยตรง หรือเลือกสาขาอื่น" />
                                    <button className={ghostBtn} onClick={() => setStep('details')}>เปลี่ยนสาขา/ข้อมูล</button>
                                </div>
                            ) : (
                                <div className="space-y-2">
                                    {suggest.slots.map((s) => {
                                        const active = selected?.date === s.date && selected.startTime === s.startTime && selected.bayId === s.bayId;
                                        return (
                                            <button key={`${s.date}-${s.startTime}-${s.bayId}`} onClick={() => setSelected(s)}
                                                className={`flex w-full items-center justify-between rounded-2xl border px-4 py-3 text-left transition ${active ? 'border-emerald-600 bg-emerald-50 ring-2 ring-emerald-200' : 'border-gray-200 bg-white'}`}>
                                                <div>
                                                    <p className="text-sm font-semibold text-gray-900">{formatThaiDate(s.date)}</p>
                                                    <p className="text-sm text-gray-600">{s.startTime} - {s.endTime} น.</p>
                                                </div>
                                                {active && <CheckCircle2 className="h-5 w-5 text-emerald-600" />}
                                            </button>
                                        );
                                    })}
                                </div>
                            )}
                            {error && <ErrorBox message={error} />}
                            {suggest.slots.length > 0 && (
                                <button className={primaryBtn} disabled={busy || !selected} onClick={doConfirm}>
                                    {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />} ยืนยันการจอง
                                </button>
                            )}
                        </div>
                    </Card>
                )}

                {step === 'status' && booking && (
                    <div className="space-y-3">
                        {notice && <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-center text-sm font-medium text-emerald-800">{notice}</div>}
                        {error && <ErrorBox message={error} />}
                        <StatusCard booking={booking} onCancel={doCancel} cancelling={cancelling} onNew={resetAll} />
                    </div>
                )}
            </div>
        </div>
    );
}
