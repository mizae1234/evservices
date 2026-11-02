// Admin Queue Management (Kanban): จัดการคิวหน้าสาขาตามสาขาและวันที่

'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useSession } from 'next-auth/react';
import { QRCodeSVG } from 'qrcode.react';
import {
    AlertCircle, ArrowRight, Car, CheckCircle2, Clock, Copy, ExternalLink, Monitor, Phone, QrCode, Search, Smartphone,
    Volume2, UserX, X, CalendarCheck, Wrench, FileText, Settings, Printer,
} from 'lucide-react';
import { Badge, Button, Card, CardContent, Input, LoadingPage, Modal, Select, Textarea } from '@/components/ui';
import { Header } from '@/components/layouts';
import { cn, getBangkokDateString } from '@/lib/utils';
import {
    BOARD_STATUSES,
    QUEUE_STATUS_LABEL,
    QueueStatus,
    canTransition,
    getNextStatus,
} from '@/lib/queue-status';

interface QueueItem {
    QueueID: number;
    QueueLabel: string;
    Status: QueueStatus;
    CarRegister: string;
    CustomerName: string;
    CustomerPhone: string | null;
    CarModel: string | null;
    BookingType: string;
    NeedsReview: boolean;
    RepairDetail: string | null;
    Version: number;
    CheckInDate: string;
    ServiceType: { Name: string } | null;
    ServiceOther: string | null;
    Booking: { BookingNo: string; StartTime: string; EndTime: string; ClaimDetail: string | null; CarModel: string } | null;
}
interface BookingDetail { BookingNo: string; StartTime: string; EndTime: string; ProjectType: string | null; Mileage: number; ClaimDetail: string | null; CarModel: string; CustomerName: string; CustomerPhone: string | null }
interface ChannelSetting { channelName: string; channelNo: string }

// ช่องบริการที่ตั้งค่าได้ (รอเรียกคิว/รอเข้าซ่อม/กำลังซ่อม/รอชำระเงิน)
const CHANNEL_DEFAULT_NAME: Record<string, string> = {
    WAITING_CALL: 'ช่องบริการ',
    WAITING_REPAIR: 'ช่องบริการ',
    IN_REPAIR: 'ช่องบริการ',
    WAITING_PAYMENT: 'ช่องชำระเงิน',
};
interface QueueLog { LogID: number; FromStatus: string | null; ToStatus: string; ActionByName: string | null; Note: string | null; CreateDate: string }
interface BranchOption { BranchID: number; BranchName: string }

const BOARD_COLUMNS: QueueStatus[] = BOARD_STATUSES.filter((s) => s !== 'DONE');
const COLUMN_STYLE: Record<string, { box: string; head: string; dot: string }> = {
    WAITING_CALL: { box: 'bg-amber-50/70 border-amber-200', head: 'text-amber-800', dot: 'bg-amber-500' },
    WAITING_REPAIR: { box: 'bg-sky-50/70 border-sky-200', head: 'text-sky-800', dot: 'bg-sky-500' },
    IN_REPAIR: { box: 'bg-indigo-50/70 border-indigo-200', head: 'text-indigo-800', dot: 'bg-indigo-500' },
    WAITING_PAYMENT: { box: 'bg-violet-50/70 border-violet-200', head: 'text-violet-800', dot: 'bg-violet-500' },
};
const CLOSED_TABS: { status: QueueStatus; label: string }[] = [
    { status: 'DONE', label: 'เสร็จสิ้น' },
    { status: 'CANCELLED', label: 'ยกเลิก' },
    { status: 'NO_SHOW', label: 'ไม่พบลูกค้า' },
];

function timeOf(iso: string) {
    return new Date(iso).toLocaleTimeString('th-TH', { timeZone: 'Asia/Bangkok', hour: '2-digit', minute: '2-digit' });
}

function waitText(iso: string, now: number) {
    const mins = Math.max(0, Math.floor((now - new Date(iso).getTime()) / 60000));
    if (mins < 60) return `${mins} นาที`;
    return `${Math.floor(mins / 60)} ชม. ${mins % 60} นาที`;
}

function durationText(ms: number) {
    const mins = Math.max(0, Math.round(ms / 60000));
    if (mins < 1) return 'ไม่ถึง 1 นาที';
    if (mins < 60) return `${mins} นาที`;
    return `${Math.floor(mins / 60)} ชม. ${mins % 60} นาที`;
}

// คิวบริการ "อื่นๆ" (ไม่มีประเภทบริการ) ข้ามสถานะได้
const canSkipOf = (item: QueueItem) => !item.ServiceType;

function matches(item: QueueItem, q: string) {
    if (!q) return true;
    const n = q.trim().toLowerCase().replace(/\s/g, '');
    return [item.CarRegister, item.CustomerName, item.Booking?.BookingNo, item.QueueLabel, item.CustomerPhone]
        .some((v) => v && v.toLowerCase().replace(/\s/g, '').includes(n));
}

export default function QueuePage() {
    const { data: session, status: sessionStatus } = useSession();
    const isAdmin = session?.user?.role === 'ADMIN';

    const [branches, setBranches] = useState<BranchOption[]>([]);
    const [branchId, setBranchId] = useState('');
    const [date, setDate] = useState(getBangkokDateString());
    const [search, setSearch] = useState('');
    const [queues, setQueues] = useState<QueueItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [busyId, setBusyId] = useState<number | null>(null);
    const [links, setLinks] = useState<{ checkinUrl: string; monitorUrl: string } | null>(null);
    const [showQr, setShowQr] = useState(false);
    const [copied, setCopied] = useState<string | null>(null);
    const [now, setNow] = useState(0);
    const [closedTab, setClosedTab] = useState<QueueStatus>('DONE');
    const [dragging, setDragging] = useState<QueueItem | null>(null);
    const [calledId, setCalledId] = useState<number | null>(null);

    // modal รับเข้าซ่อม (ต้องบันทึกรายละเอียดงานซ่อม)
    const [detailFor, setDetailFor] = useState<QueueItem | null>(null);
    const [repairDetail, setRepairDetail] = useState('');
    const [modalError, setModalError] = useState<string | null>(null);
    // modal ดูรายละเอียด + ประวัติ
    const [viewing, setViewing] = useState<QueueItem | null>(null);
    const [logs, setLogs] = useState<QueueLog[]>([]);
    const [bookingDetail, setBookingDetail] = useState<BookingDetail | null>(null);
    // modal ตั้งค่าช่องบริการ
    const [showChannels, setShowChannels] = useState(false);
    const [channelForm, setChannelForm] = useState<Record<string, ChannelSetting>>({});
    const [channelSaving, setChannelSaving] = useState(false);
    const [channelError, setChannelError] = useState<string | null>(null);
    const dragId = useRef<number | null>(null);

    useEffect(() => {
        const tick = () => setNow(Date.now());
        const first = setTimeout(tick, 0);
        const timer = setInterval(tick, 30000);
        return () => { clearTimeout(first); clearInterval(timer); };
    }, []);

    useEffect(() => {
        if (!session?.user) return;
        if (isAdmin) {
            fetch('/api/branches', { cache: 'no-store' })
                .then((r) => r.json())
                .then((d) => {
                    if (d.success) {
                        setBranches(d.data);
                        setBranchId((prev) => prev || String(d.data[0]?.BranchID ?? ''));
                    }
                });
        } else if (session.user.branchId != null) {
            setBranchId(String(session.user.branchId));
        }
    }, [session, isAdmin]);

    const load = useCallback(async () => {
        if (!branchId) return;
        try {
            const res = await fetch(`/api/queue?branchId=${branchId}&date=${date}`, { cache: 'no-store' });
            const data = await res.json();
            if (data.success) {
                setQueues(data.data);
                setError(null);
            } else {
                setError(data.error || 'โหลดข้อมูลไม่สำเร็จ');
            }
        } catch {
            setError('เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ กำลังลองใหม่...');
        } finally {
            setLoading(false);
        }
    }, [branchId, date]);

    useEffect(() => {
        setLoading(true);
        load();
        const timer = setInterval(load, 5000);
        return () => clearInterval(timer);
    }, [load]);

    useEffect(() => {
        if (!branchId) return;
        fetch(`/api/queue/links?branchId=${branchId}`, { cache: 'no-store' })
            .then((r) => r.json())
            .then((d) => setLinks(d.success ? d.data : null))
            .catch(() => setLinks(null));
    }, [branchId]);

    const branchName = (isAdmin ? branches.find((b) => String(b.BranchID) === branchId)?.BranchName : session?.user?.branchName) || '';

    // พิมพ์โปสเตอร์ QR ขนาด A4: เปิดหน้าต่างใหม่ที่มีเฉพาะโปสเตอร์ (ไม่พิมพ์หน้าระบบทั้งหน้า)
    const printQr = () => {
        const svg = document.getElementById('qr-print-source')?.querySelector('svg')?.outerHTML;
        if (!svg) return;
        const esc = (t: string) => t.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
        const w = window.open('', '_blank', 'width=900,height=1200');
        if (!w) { setError('เบราว์เซอร์บล็อกหน้าต่างพิมพ์ กรุณาอนุญาต pop-up แล้วลองใหม่'); return; }
        w.document.write(`<!doctype html><html lang="th"><head><meta charset="utf-8"><title>QR Check-in ${esc(branchName)}</title>
<style>
@page { size: A4 portrait; margin: 0; }
* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; }
body { width: 210mm; height: 297mm; font-family: 'Sarabun','Noto Sans Thai','Thonburi','Tahoma',sans-serif; color: #064e3b; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
.page { width: 210mm; height: 297mm; padding: 16mm 18mm; display: flex; flex-direction: column; align-items: center; justify-content: space-between; background: linear-gradient(#ecfdf5, #fff 45%); }
.head { text-align: center; }
.badge { display: inline-block; background: #059669; color: #fff; font-size: 20pt; font-weight: 700; padding: 3mm 10mm; border-radius: 99px; }
h1 { margin: 8mm 0 2mm; font-size: 40pt; line-height: 1.15; }
.branch { font-size: 24pt; color: #047857; font-weight: 600; }
.qr { background: #fff; border: 3mm solid #059669; border-radius: 10mm; padding: 8mm; width: 128mm; height: 128mm; }
.qr svg { width: 100%; height: 100%; display: block; }
.scan { text-align: center; font-size: 30pt; font-weight: 700; margin-top: 2mm; }
.sub { text-align: center; font-size: 15pt; color: #4b5563; margin-top: 1mm; }
.steps { width: 100%; display: flex; gap: 6mm; }
.step { flex: 1; text-align: center; background: #fff; border: 0.6mm solid #a7f3d0; border-radius: 6mm; padding: 6mm 4mm; }
.num { width: 14mm; height: 14mm; margin: 0 auto 3mm; border-radius: 50%; background: #059669; color: #fff; font-size: 20pt; font-weight: 700; line-height: 14mm; }
.step b { display: block; font-size: 17pt; }
.step span { font-size: 13pt; color: #4b5563; }
.foot { font-size: 11pt; color: #6b7280; }
</style></head><body><div class="page">
<div class="head"><span class="badge">รับคิวเข้าศูนย์บริการ</span><h1>สแกน QR Code เพื่อรับคิว</h1><div class="branch">${esc(branchName)}</div></div>
<div><div class="qr">${svg}</div><div class="scan">ใช้กล้องมือถือสแกนได้เลย</div><div class="sub">ไม่ต้องติดตั้งแอปพลิเคชัน</div></div>
<div class="steps">
<div class="step"><div class="num">1</div><b>สแกน QR Code</b><span>เปิดหน้ารับคิวบนมือถือ</span></div>
<div class="step"><div class="num">2</div><b>กรอกทะเบียนรถ</b><span>และเลือกประเภทบริการ</span></div>
<div class="step"><div class="num">3</div><b>รอเรียกคิว</b><span>ดูหมายเลขคิวบนหน้าจอ</span></div>
</div>
<div class="foot">EV Services</div>
</div></body></html>`);
        w.document.close();
        w.onafterprint = () => w.close();
        // รอให้หน้าต่างวาดเสร็จก่อนเปิดหน้าต่างพิมพ์
        setTimeout(() => { w.focus(); w.print(); }, 400);
    };

    const copy = async (key: string, text: string) => {
        try {
            await navigator.clipboard.writeText(text);
            setCopied(key);
            setTimeout(() => setCopied(null), 1800);
        } catch {
            setError('คัดลอกไม่สำเร็จ');
        }
    };

    const postStatus = async (item: QueueItem, to: QueueStatus, extra?: { repairDetail?: string; note?: string }) => {
        if (busyId) return false;
        setBusyId(item.QueueID);
        try {
            const res = await fetch(`/api/queue/${item.QueueID}/status`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ to, expectedVersion: item.Version, ...extra }),
            });
            const data = await res.json();
            if (!data.success) {
                setError(data.error || 'เปลี่ยนสถานะไม่สำเร็จ');
                await load();
                return false;
            }
            setError(null);
            await load();
            return true;
        } catch {
            setError('เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ กรุณาลองใหม่');
            return false;
        } finally {
            setBusyId(null);
        }
    };

    const requestMove = (item: QueueItem, to: QueueStatus) => {
        const canSkip = canSkipOf(item);
        if (!canTransition(item.Status, to, canSkip)) {
            setError('เปลี่ยนสถานะได้ทีละขั้นไปข้างหน้าเท่านั้น');
            return;
        }
        if (!canSkip && item.Status === 'WAITING_CALL' && to === 'WAITING_REPAIR') {
            setDetailFor(item);
            setRepairDetail(item.RepairDetail || item.Booking?.ClaimDetail || '');
            setModalError(null);
            return;
        }
        postStatus(item, to);
    };

    const confirmRepair = async () => {
        if (!detailFor) return;
        if (!repairDetail.trim()) {
            setModalError('กรุณาบันทึกรายละเอียดงานซ่อม');
            return;
        }
        if (await postStatus(detailFor, 'WAITING_REPAIR', { repairDetail })) setDetailFor(null);
    };

    const cancelOrNoShow = (item: QueueItem, to: 'CANCELLED' | 'NO_SHOW') => {
        const label = to === 'CANCELLED' ? 'ยกเลิกคิว' : 'บันทึกว่าไม่พบลูกค้า';
        if (window.confirm(`${label} ${item.QueueLabel} ใช่หรือไม่?`)) postStatus(item, to);
    };

    // ประกาศเสียงเรียกคิวที่หน้า Monitor ของสาขา
    const callQueue = async (item: QueueItem) => {
        try {
            const res = await fetch(`/api/queue/${item.QueueID}/call`, { method: 'POST' });
            const data = await res.json();
            if (!data.success) {
                setError(data.error || 'ประกาศเรียกคิวไม่สำเร็จ');
                return;
            }
            setError(null);
            setCalledId(item.QueueID);
            setTimeout(() => setCalledId((cur) => (cur === item.QueueID ? null : cur)), 2500);
        } catch {
            setError('เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ กรุณาลองใหม่');
        }
    };

    const openDetail = async (item: QueueItem) => {
        setViewing(item);
        setLogs([]);
        setBookingDetail(null);
        try {
            const res = await fetch(`/api/queue/${item.QueueID}`, { cache: 'no-store' });
            const data = await res.json();
            if (data.success) {
                setLogs(data.data.Logs);
                setBookingDetail(data.data.Booking ?? null);
            }
        } catch { /* แสดงเฉพาะข้อมูลบนการ์ด */ }
    };

    const openChannels = async () => {
        setChannelError(null);
        const form: Record<string, ChannelSetting> = {};
        BOARD_COLUMNS.forEach((st) => { form[st] = { channelName: CHANNEL_DEFAULT_NAME[st], channelNo: '' }; });
        try {
            const res = await fetch(`/api/queue/channels?branchId=${branchId}`, { cache: 'no-store' });
            const data = await res.json();
            if (data.success) {
                (data.data as { status: string; channelName: string; channelNo: string }[]).forEach((c) => {
                    if (form[c.status]) form[c.status] = { channelName: c.channelName, channelNo: c.channelNo };
                });
            }
        } catch { /* ใช้ค่าเริ่มต้น */ }
        setChannelForm(form);
        setShowChannels(true);
    };

    const saveChannels = async () => {
        setChannelSaving(true);
        setChannelError(null);
        try {
            const res = await fetch('/api/queue/channels', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    branchId: Number(branchId),
                    channels: BOARD_COLUMNS.map((st) => ({ status: st, ...channelForm[st] })),
                }),
            });
            const data = await res.json();
            if (data.success) setShowChannels(false);
            else setChannelError(data.error || 'บันทึกไม่สำเร็จ');
        } catch {
            setChannelError('เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ กรุณาลองใหม่');
        } finally {
            setChannelSaving(false);
        }
    };

    if (sessionStatus === 'loading') return <LoadingPage />;

    const visible = queues.filter((q) => matches(q, search));
    const closedItems = visible.filter((q) => q.Status === closedTab);
    const closedCount = (s: QueueStatus) => visible.filter((q) => q.Status === s).length;
    const activeCount = visible.filter((q) => BOARD_COLUMNS.includes(q.Status)).length;

    const dropOn = (to: QueueStatus) => {
        const item = queues.find((q) => q.QueueID === dragId.current);
        dragId.current = null;
        setDragging(null);
        if (item && item.Status !== to) requestMove(item, to);
    };

    // ระยะเวลาที่ลูกค้าอยู่ในแต่ละสถานะ = เวลาของ log การเปลี่ยนสถานะ - log การเปลี่ยนสถานะก่อนหน้า (ข้ามการประกาศเรียกคิว)
    const ACTIVE: QueueStatus[] = ['WAITING_CALL', 'WAITING_REPAIR', 'IN_REPAIR', 'WAITING_PAYMENT'];
    const chrono = [...logs].sort((a, b) => new Date(a.CreateDate).getTime() - new Date(b.CreateDate).getTime());
    let lastChange: number | null = chrono.length ? new Date(chrono[0].CreateDate).getTime() : null;
    const spentById = new Map<number, number>();
    chrono.forEach((l, i) => {
        if (i === 0 || !l.FromStatus || l.FromStatus === l.ToStatus) return;
        const t = new Date(l.CreateDate).getTime();
        if (lastChange != null) spentById.set(l.LogID, t - lastChange);
        lastChange = t;
    });
    const logsWithDuration = [...chrono].reverse().map((l) => ({ log: l, spent: spentById.get(l.LogID) ?? null }));
    const totalMs = chrono.length && viewing
        ? (ACTIVE.includes(viewing.Status) ? (now || new Date(chrono[chrono.length - 1].CreateDate).getTime()) : new Date(chrono[chrono.length - 1].CreateDate).getTime()) - new Date(chrono[0].CreateDate).getTime()
        : null;

    return (
        <div>
            <Header title="จัดการคิวหน้าสาขา" subtitle="Queue Management" />
            <div className="space-y-4 p-4 lg:p-6">
                {/* แถบตัวกรอง + ลิงก์ */}
                <Card>
                    <CardContent className="space-y-4 p-4">
                        <div className="flex flex-wrap items-end gap-3">
                            {isAdmin && (
                                <div className="w-full sm:w-56">
                                    <Select
                                        label="สาขา"
                                        value={branchId}
                                        onChange={(e) => setBranchId(e.target.value)}
                                        options={branches.map((b) => ({ value: String(b.BranchID), label: b.BranchName }))}
                                    />
                                </div>
                            )}
                            <div className="w-full sm:w-44">
                                <Input label="วันที่" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
                            </div>
                            <div className="min-w-60 flex-1">
                                <label className="mb-1 block text-sm font-medium text-gray-700">ค้นหา</label>
                                <div className="relative">
                                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                                    <input
                                        value={search}
                                        onChange={(e) => setSearch(e.target.value)}
                                        placeholder="ทะเบียน / ชื่อลูกค้า / เลขที่จอง / เลขคิว"
                                        className="w-full rounded-lg border border-gray-300 bg-white py-2 pl-9 pr-9 text-gray-900 placeholder-gray-400 shadow-sm transition-colors focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                                    />
                                    {search && (
                                        <button type="button" onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-gray-400 hover:text-gray-600" aria-label="ล้างคำค้นหา"><X className="h-4 w-4" /></button>
                                    )}
                                </div>
                            </div>
                            <Button variant="outline" onClick={openChannels} disabled={!branchId} title="ตั้งค่าช่องบริการที่ใช้ประกาศเรียกคิว"><Settings className="mr-1.5 h-4 w-4" />ตั้งค่าช่องบริการ</Button>
                            <div className="pb-2 text-sm text-gray-500">คิวที่ดำเนินการอยู่ <span className="font-semibold text-gray-800">{activeCount}</span> คิว</div>
                        </div>

                        {links && (
                            <div className="grid gap-3 border-t border-gray-100 pt-4 sm:grid-cols-2">
                                <div className="flex items-center gap-3 rounded-xl border border-emerald-100 bg-emerald-50/60 p-3">
                                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-emerald-600 text-white"><Smartphone className="h-5 w-5" /></div>
                                    <div className="min-w-0 flex-1">
                                        <p className="text-sm font-semibold text-gray-900">หน้า Check-in ลูกค้า</p>
                                        <p className="text-xs text-gray-500">ให้ลูกค้าสแกน QR เพื่อรับคิว</p>
                                    </div>
                                    <div className="flex shrink-0 gap-1">
                                        <Button size="sm" variant="outline" onClick={() => setShowQr(true)} title="แสดง QR"><QrCode className="h-4 w-4" /></Button>
                                        <Button size="sm" variant="outline" onClick={() => copy('checkin', links.checkinUrl)} title="คัดลอกลิงก์">
                                            {copied === 'checkin' ? <CheckCircle2 className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4" />}
                                        </Button>
                                        <a href={links.checkinUrl} target="_blank" rel="noreferrer" title="เปิดหน้า" className="inline-flex h-8 items-center rounded-lg border border-gray-300 px-2 text-gray-700 hover:bg-gray-50"><ExternalLink className="h-4 w-4" /></a>
                                    </div>
                                </div>
                                <div className="flex items-center gap-3 rounded-xl border border-sky-100 bg-sky-50/60 p-3">
                                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-sky-600 text-white"><Monitor className="h-5 w-5" /></div>
                                    <div className="min-w-0 flex-1">
                                        <p className="text-sm font-semibold text-gray-900">จอ Monitor หน้าร้าน</p>
                                        <p className="text-xs text-gray-500">แสดงเลขคิวและสถานะบนจอใหญ่</p>
                                    </div>
                                    <div className="flex shrink-0 gap-1">
                                        <Button size="sm" variant="outline" onClick={() => copy('monitor', links.monitorUrl)} title="คัดลอกลิงก์">
                                            {copied === 'monitor' ? <CheckCircle2 className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4" />}
                                        </Button>
                                        <a href={links.monitorUrl} target="_blank" rel="noreferrer" title="เปิดหน้า" className="inline-flex h-8 items-center rounded-lg border border-gray-300 px-2 text-gray-700 hover:bg-gray-50"><ExternalLink className="h-4 w-4" /></a>
                                    </div>
                                </div>
                            </div>
                        )}
                    </CardContent>
                </Card>

                {error && (
                    <div className="flex items-start gap-2 rounded-lg bg-red-50 p-3 text-sm text-red-700">
                        <AlertCircle className="mt-0.5 h-4 w-4" />{error}
                    </div>
                )}

                {loading ? (
                    <LoadingPage />
                ) : (
                    <>
                        {/* Kanban 4 สถานะ: ความสูงคงที่ เลื่อนภายในคอลัมน์ */}
                        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
                            {BOARD_COLUMNS.map((status) => {
                                const items = visible.filter((q) => q.Status === status);
                                const style = COLUMN_STYLE[status];
                                const canDrop = dragging && canTransition(dragging.Status, status, canSkipOf(dragging));
                                return (
                                    <section
                                        key={status}
                                        className={cn('flex h-[720px] flex-col rounded-2xl border-2 transition', style.box, canDrop && 'ring-2 ring-blue-400')}
                                        onDragOver={(e) => e.preventDefault()}
                                        onDrop={() => dropOn(status)}
                                    >
                                        <div className="flex items-center justify-between px-4 pb-2 pt-3">
                                            <h3 className={cn('flex items-center gap-2 font-semibold', style.head)}>
                                                <span className={cn('h-2.5 w-2.5 rounded-full', style.dot)} />{QUEUE_STATUS_LABEL[status]}
                                            </h3>
                                            <Badge variant="secondary">{items.length}</Badge>
                                        </div>
                                        <div className="flex-1 space-y-2 overflow-y-auto px-3 pb-3">
                                            {items.map((item) => (
                                                <QueueCard
                                                    key={item.QueueID}
                                                    item={item}
                                                    now={now}
                                                    busy={busyId === item.QueueID}
                                                    onOpen={() => openDetail(item)}
                                                    onMove={requestMove}
                                                    onClose={cancelOrNoShow}
                                                    onCall={callQueue}
                                                    called={calledId === item.QueueID}
                                                    onDragStart={() => { dragId.current = item.QueueID; setDragging(item); }}
                                                    onDragEnd={() => setDragging(null)}
                                                />
                                            ))}
                                            {items.length === 0 && <p className="py-10 text-center text-sm text-gray-400">ไม่มีคิวในสถานะนี้</p>}
                                        </div>
                                    </section>
                                );
                            })}
                        </div>

                        {/* ปิดคิวแล้ว: เสร็จสิ้น / ยกเลิก / ไม่พบลูกค้า */}
                        <section
                            className={cn('rounded-2xl border-2 border-gray-200 bg-white transition', dragging && canTransition(dragging.Status, 'DONE', canSkipOf(dragging)) && 'border-green-400 ring-2 ring-green-300')}
                            onDragOver={(e) => e.preventDefault()}
                            onDrop={() => { if (closedTab !== 'DONE') setClosedTab('DONE'); dropOn('DONE'); }}
                        >
                            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-100 px-4 py-3">
                                <h3 className="font-semibold text-gray-800">คิวที่ปิดแล้ว</h3>
                                <div className="flex rounded-lg bg-gray-100 p-1">
                                    {CLOSED_TABS.map((t) => (
                                        <button
                                            key={t.status}
                                            type="button"
                                            onClick={() => setClosedTab(t.status)}
                                            className={cn('rounded-md px-3 py-1.5 text-sm font-medium transition', closedTab === t.status ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700')}
                                        >
                                            {t.label} <span className="ml-1 text-xs text-gray-400">{closedCount(t.status)}</span>
                                        </button>
                                    ))}
                                </div>
                            </div>
                            <div className="max-h-72 overflow-y-auto p-3">
                                {dragging && canTransition(dragging.Status, 'DONE', canSkipOf(dragging)) && (
                                    <p className="mb-3 rounded-lg border-2 border-dashed border-green-300 bg-green-50 py-4 text-center text-sm font-medium text-green-700">ลากมาวางที่นี่เพื่อปิดงานเป็น “เสร็จสิ้น”</p>
                                )}
                                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
                                    {closedItems.map((q) => (
                                        <button
                                            key={q.QueueID}
                                            type="button"
                                            onClick={() => openDetail(q)}
                                            className="flex items-center gap-3 rounded-xl border border-gray-200 bg-gray-50 p-3 text-left hover:border-gray-300 hover:bg-white"
                                        >
                                            <span className="rounded-lg bg-white px-2.5 py-1 text-lg font-bold text-gray-700 shadow-sm">{q.QueueLabel}</span>
                                            <span className="min-w-0 flex-1">
                                                <span className="block truncate text-sm font-medium text-gray-900">{q.CarRegister}</span>
                                                <span className="block truncate text-xs text-gray-500">{q.CustomerName} · {timeOf(q.CheckInDate)} น.</span>
                                            </span>
                                        </button>
                                    ))}
                                </div>
                                {closedItems.length === 0 && <p className="py-8 text-center text-sm text-gray-400">ไม่มีรายการ</p>}
                            </div>
                        </section>
                    </>
                )}
            </div>

            {/* QR Check-in */}
            <Modal isOpen={showQr && !!links} onClose={() => setShowQr(false)} title="QR Code สำหรับ Check-in" size="sm">
                {links && (
                    <div className="flex flex-col items-center gap-3">
                        {branchName && <p className="text-sm font-semibold text-gray-800">{branchName}</p>}
                        <div id="qr-print-source" className="rounded-2xl border border-emerald-100 bg-white p-3 shadow-sm"><QRCodeSVG value={links.checkinUrl} size={256} marginSize={2} /></div>
                        <p className="text-center text-xs text-gray-500">ให้ลูกค้าสแกนเพื่อรับคิว (ลิงก์ผูกกับสาขานี้เท่านั้น)</p>
                        <Button onClick={printQr}><Printer className="mr-1.5 h-4 w-4" />พิมพ์โปสเตอร์ QR (A4)</Button>
                    </div>
                )}
            </Modal>

            {/* บันทึกงานซ่อมก่อนรับเข้าซ่อม */}
            <Modal isOpen={!!detailFor} onClose={() => setDetailFor(null)} title={`บันทึกงานซ่อม ${detailFor?.QueueLabel ?? ''}`} size="lg">
                <div className="space-y-3">
                    <p className="text-sm text-gray-600">{detailFor?.CarRegister} · {detailFor?.CustomerName}</p>
                    <Textarea
                        label="รายละเอียดงานซ่อม"
                        rows={5}
                        value={repairDetail}
                        onChange={(e) => setRepairDetail(e.target.value)}
                        error={modalError || undefined}
                    />
                    <div className="flex justify-end gap-2">
                        <Button variant="outline" onClick={() => setDetailFor(null)}>ยกเลิก</Button>
                        <Button onClick={confirmRepair} isLoading={busyId === detailFor?.QueueID}>รับเข้าซ่อม</Button>
                    </div>
                </div>
            </Modal>

            {/* รายละเอียดคิว + ประวัติ */}
            <Modal isOpen={!!viewing} onClose={() => setViewing(null)} title={viewing ? `คิว ${viewing.QueueLabel}` : ''} size="lg">
                {viewing && (
                    <div className="space-y-4">
                        <div className="flex flex-wrap items-center gap-2">
                            <Badge variant="info">{QUEUE_STATUS_LABEL[viewing.Status]}</Badge>
                            {viewing.ServiceType ? <Badge variant="secondary">{viewing.ServiceType.Name}</Badge> : <Badge variant="warning">อื่นๆ</Badge>}
                            {viewing.Booking ? <Badge variant="success">จอง {viewing.Booking.BookingNo}</Badge> : <Badge variant="secondary">Walk-in</Badge>}
                            {viewing.NeedsReview && <Badge variant="warning">ไม่พบการจอง - ตรวจสอบ</Badge>}
                        </div>
                        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                            <Detail label="ทะเบียน" value={viewing.CarRegister} />
                            <Detail label="รุ่นรถ" value={viewing.CarModel || viewing.Booking?.CarModel || '-'} />
                            <Detail label="ลูกค้า" value={viewing.CustomerName} />
                            <Detail label="เบอร์โทร" value={viewing.CustomerPhone || '-'} />
                            <Detail label="เช็คอิน" value={`${timeOf(viewing.CheckInDate)} น.`} />
                            <Detail label="เวลานัด" value={viewing.Booking ? `${viewing.Booking.StartTime} - ${viewing.Booking.EndTime}` : '-'} />
                        </dl>
                        {!viewing.ServiceType && viewing.ServiceOther && (
                            <div className="rounded-lg bg-amber-50 p-3 text-sm">
                                <p className="mb-1 font-medium text-amber-800">บริการที่ลูกค้าระบุ (อื่นๆ)</p>
                                <p className="whitespace-pre-wrap text-amber-900">{viewing.ServiceOther}</p>
                            </div>
                        )}
                        {bookingDetail && (
                            <div className="rounded-lg border border-emerald-100 bg-emerald-50/60 p-3 text-sm">
                                <p className="mb-2 flex items-center gap-1.5 font-medium text-emerald-800"><CalendarCheck className="h-4 w-4" />ข้อมูลจากใบจอง {bookingDetail.BookingNo}</p>
                                <dl className="grid grid-cols-2 gap-x-4 gap-y-2">
                                    <Detail label="ผู้จอง" value={bookingDetail.CustomerName} />
                                    <Detail label="เวลานัดหมาย" value={`${bookingDetail.StartTime} - ${bookingDetail.EndTime}`} />
                                    <Detail label="เลขไมล์ที่จอง" value={bookingDetail.Mileage ? `${bookingDetail.Mileage.toLocaleString('th-TH')} กม.` : '-'} />
                                    <Detail label="ประเภทโครงการ" value={bookingDetail.ProjectType || '-'} />
                                </dl>
                            </div>
                        )}
                        {(viewing.RepairDetail || viewing.Booking?.ClaimDetail) && (
                            <div className="rounded-lg bg-gray-50 p-3 text-sm">
                                <p className="mb-1 font-medium text-gray-700">รายละเอียดงานซ่อม</p>
                                <p className="whitespace-pre-wrap text-gray-600">{viewing.RepairDetail || viewing.Booking?.ClaimDetail}</p>
                            </div>
                        )}
                        <div>
                            <p className="mb-2 text-sm font-medium text-gray-700">ประวัติการเปลี่ยนสถานะ</p>
                            <ol className="max-h-52 space-y-2 overflow-y-auto border-l-2 border-gray-200 pl-4 text-sm">
                                {logsWithDuration.map(({ log: l, spent }) => (
                                    <li key={l.LogID}>
                                        <p className="font-medium text-gray-800">
                                            {l.FromStatus && l.FromStatus !== l.ToStatus ? `${QUEUE_STATUS_LABEL[l.FromStatus as QueueStatus] ?? l.FromStatus} → ` : ''}{QUEUE_STATUS_LABEL[l.ToStatus as QueueStatus] ?? l.ToStatus}
                                            {spent != null && l.FromStatus && (
                                                <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
                                                    {l.FromStatus === 'IN_REPAIR' ? 'ซ่อม' : 'รอ'} {durationText(spent)}
                                                </span>
                                            )}
                                        </p>
                                        <p className="text-xs text-gray-500">{timeOf(l.CreateDate)} น. · {l.ActionByName ?? '-'}{l.Note ? ` · ${l.Note}` : ''}</p>
                                    </li>
                                ))}
                                {logs.length === 0 && <li className="text-gray-400">กำลังโหลด...</li>}
                            </ol>
                            {totalMs != null && (
                                <p className="mt-2 text-xs text-gray-500">รวมเวลาตั้งแต่เช็คอิน{ACTIVE.includes(viewing.Status) ? 'ถึงปัจจุบัน' : 'จนปิดคิว'} <span className="font-semibold text-gray-700">{durationText(totalMs)}</span></p>
                            )}
                        </div>
                    </div>
                )}
            </Modal>

            {/* ตั้งค่าช่องบริการ (ใช้ประกาศเรียกคิว) */}
            <Modal isOpen={showChannels} onClose={() => setShowChannels(false)} title="ตั้งค่าช่องบริการ" size="lg">
                <div className="space-y-4">
                    <p className="text-sm text-gray-600">กำหนดว่าแต่ละสถานะให้ลูกค้าไปที่ช่องไหน เมื่อกดประกาศเรียกคิว ระบบจะพูดว่า “ขอเชิญหมายเลข … ที่ช่องบริการหมายเลข …” (เว้นหมายเลขว่างไว้ = ไม่ประกาศช่อง)</p>
                    <div className="space-y-2">
                        {BOARD_COLUMNS.map((st) => (
                            <div key={st} className="grid grid-cols-[110px_1fr_90px] items-end gap-2">
                                <span className="pb-2 text-sm font-medium text-gray-800">{QUEUE_STATUS_LABEL[st]}</span>
                                <Input label="ชื่อช่อง" value={channelForm[st]?.channelName ?? ''} maxLength={50} onChange={(e) => setChannelForm((f) => ({ ...f, [st]: { ...f[st], channelName: e.target.value } }))} />
                                <Input label="หมายเลข" value={channelForm[st]?.channelNo ?? ''} maxLength={10} inputMode="numeric" onChange={(e) => setChannelForm((f) => ({ ...f, [st]: { ...f[st], channelNo: e.target.value.replace(/\s/g, '') } }))} />
                            </div>
                        ))}
                    </div>
                    {channelError && <p className="text-sm text-red-600">{channelError}</p>}
                    <div className="flex justify-end gap-2">
                        <Button variant="outline" onClick={() => setShowChannels(false)}>ยกเลิก</Button>
                        <Button onClick={saveChannels} isLoading={channelSaving}>บันทึก</Button>
                    </div>
                </div>
            </Modal>
        </div>
    );
}

function Detail({ label, value }: { label: string; value: string }) {
    return (
        <div>
            <dt className="text-xs text-gray-500">{label}</dt>
            <dd className="font-medium text-gray-900">{value}</dd>
        </div>
    );
}

function QueueCard({ item, now, busy, called, onOpen, onMove, onClose, onCall, onDragStart, onDragEnd }: {
    item: QueueItem;
    now: number;
    busy: boolean;
    called: boolean;
    onOpen: () => void;
    onMove: (item: QueueItem, to: QueueStatus) => void;
    onClose: (item: QueueItem, to: 'CANCELLED' | 'NO_SHOW') => void;
    onCall: (item: QueueItem) => void;
    onDragStart: () => void;
    onDragEnd: () => void;
}) {
    const next = getNextStatus(item.Status);
    return (
        <div
            draggable
            onDragStart={onDragStart}
            onDragEnd={onDragEnd}
            className="cursor-grab rounded-xl border border-gray-200 bg-white p-3 shadow-sm transition hover:shadow-md active:cursor-grabbing"
        >
            <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2">
                    <button type="button" onClick={onOpen} className="flex h-9 items-center rounded-lg bg-blue-600 px-3 text-lg font-bold leading-none text-white">{item.QueueLabel}</button>
                    <button
                        type="button"
                        onClick={() => onCall(item)}
                        title="ประกาศเรียกคิวด้วยเสียง (หน้า Monitor)"
                        aria-label={`ประกาศเรียกคิว ${item.QueueLabel}`}
                        className={cn('flex h-9 w-9 items-center justify-center rounded-lg border transition', called ? 'border-green-500 bg-green-50 text-green-700' : 'border-gray-300 bg-white text-gray-600 hover:bg-gray-50')}
                    >
                        {called ? <CheckCircle2 className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
                    </button>
                </div>
                <div className="flex flex-col items-end gap-0.5 text-xs text-gray-500">
                    <span className="flex items-center gap-1"><Clock className="h-3.5 w-3.5" />{timeOf(item.CheckInDate)} น.</span>
                    <span>รอ {waitText(item.CheckInDate, now || new Date(item.CheckInDate).getTime())}</span>
                </div>
            </div>
            <button type="button" onClick={onOpen} className="block w-full text-left">
                <p className="mt-2 flex items-center gap-1.5 text-base font-bold text-gray-900"><Car className="h-4 w-4 text-gray-400" />{item.CarRegister}</p>
                {(item.CarModel || item.Booking?.CarModel) && <p className="text-xs text-gray-500">{item.CarModel || item.Booking?.CarModel}</p>}
                <p className="mt-1 text-sm text-gray-700">{item.CustomerName}</p>
            </button>
            {item.CustomerPhone && (
                <a href={`tel:${item.CustomerPhone}`} className="mt-0.5 inline-flex items-center gap-1 text-xs text-blue-600 hover:underline"><Phone className="h-3 w-3" />{item.CustomerPhone}</a>
            )}
            <div className="mt-2 flex flex-wrap gap-1">
                {item.ServiceType
                    ? <Badge variant="info"><Wrench className="mr-1 inline h-3 w-3" />{item.ServiceType.Name}</Badge>
                    : <Badge variant="warning"><Wrench className="mr-1 inline h-3 w-3" />อื่นๆ</Badge>}
                {item.Booking
                    ? <Badge variant="success"><CalendarCheck className="mr-1 inline h-3 w-3" />{item.Booking.BookingNo} · {item.Booking.StartTime}</Badge>
                    : <Badge variant="secondary">Walk-in</Badge>}
            </div>
            {!item.ServiceType && item.ServiceOther && (
                <p className="mt-2 rounded-md bg-amber-50 px-2 py-1 text-xs text-amber-900"><span className="font-medium">บริการ: </span><span className="line-clamp-2">{item.ServiceOther}</span></p>
            )}
            {item.NeedsReview && (
                <p className="mt-2 flex items-center gap-1 rounded-md bg-amber-50 px-2 py-1 text-xs text-amber-800"><AlertCircle className="h-3.5 w-3.5" />ลูกค้าแจ้งว่าจองไว้ แต่ไม่พบรายการ — โปรดตรวจสอบ</p>
            )}
            {item.RepairDetail && (
                <p className="mt-2 flex gap-1 rounded-md bg-gray-50 px-2 py-1 text-xs text-gray-600"><FileText className="mt-0.5 h-3.5 w-3.5 shrink-0" /><span className="line-clamp-2">{item.RepairDetail}</span></p>
            )}
            <div className="mt-3 flex items-center gap-1.5">
                {next && (
                    <Button size="sm" className="flex-1 whitespace-nowrap" disabled={busy} onClick={() => onMove(item, next)}>
                        {QUEUE_STATUS_LABEL[next]}<ArrowRight className="ml-1 h-3.5 w-3.5" />
                    </Button>
                )}
                {item.Status === 'WAITING_CALL' && (
                    <Button size="sm" variant="outline" disabled={busy} onClick={() => onClose(item, 'NO_SHOW')} title="เรียกแล้วไม่พบลูกค้า"><UserX className="h-4 w-4" /></Button>
                )}
                <Button size="sm" variant="outline" disabled={busy} onClick={() => onClose(item, 'CANCELLED')} title="ยกเลิกคิว"><X className="h-4 w-4" /></Button>
            </div>
        </div>
    );
}
