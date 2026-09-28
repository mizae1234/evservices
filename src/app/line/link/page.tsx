// LINE Account Linking Page
// เปิดจาก in-app browser ของ LINE (ผู้ใช้ยังไม่มี session) → ยืนยันตัวตนด้วย Email/Password เดียวกับระบบ

'use client';

export const dynamic = 'force-dynamic';

import { Suspense, useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Button, Input, Spinner } from '@/components/ui';
import { AlertCircle, Car, Check, Eye, EyeOff, Lock, Mail, MessageCircle, ShieldCheck } from 'lucide-react';

const LIFF_ID = process.env.NEXT_PUBLIC_LINE_LIFF_ID || '';

interface LinkedResult {
    FullName: string;
    Email: string;
    RoleName: string;
    BranchName: string | null;
    LineDisplayName: string | null;
}

function LinkPageContent() {
    const searchParams = useSearchParams();
    const token = searchParams.get('token') || '';

    const [checking, setChecking] = useState(true);
    const [tokenError, setTokenError] = useState<string | null>(null);
    const [alreadyLinkedTo, setAlreadyLinkedTo] = useState<{ FullName: string; Email: string } | null>(null);

    // LIFF — ใช้พิสูจน์ว่าใครเป็นคนเปิดหน้านี้จริง (กันลิงก์ถูกส่งต่อ)
    const [idToken, setIdToken] = useState<string | null>(null);
    const [liffReady, setLiffReady] = useState(!LIFF_ID);
    const [inLineApp, setInLineApp] = useState(false);
    const [lineProfile, setLineProfile] = useState<{ displayName: string; pictureUrl?: string } | null>(null);

    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [result, setResult] = useState<LinkedResult | null>(null);

    const validateToken = useCallback(async () => {
        if (!token) {
            setTokenError('ไม่พบรหัสยืนยัน กรุณาพิมพ์ "ผูกบัญชี" ในแชท LINE เพื่อขอลิงก์ใหม่');
            setChecking(false);
            return;
        }
        try {
            const res = await fetch(`/api/line/link?token=${encodeURIComponent(token)}`);
            const data = await res.json();
            if (!data.success) {
                setTokenError(data.error || 'ลิงก์ไม่ถูกต้อง');
            } else {
                setAlreadyLinkedTo(data.data?.alreadyLinkedTo || null);
            }
        } catch {
            setTokenError('ไม่สามารถตรวจสอบลิงก์ได้ กรุณาลองใหม่อีกครั้ง');
        } finally {
            setChecking(false);
        }
    }, [token]);

    useEffect(() => {
        validateToken();
    }, [validateToken]);

    // เริ่ม LIFF แล้วดึง ID token
    // ถ้ายังไม่ได้ login กับ LINE จะ redirect ไป LINE Login แล้วกลับมาที่หน้านี้พร้อม token เดิม
    useEffect(() => {
        if (!LIFF_ID) return;

        let cancelled = false;
        (async () => {
            try {
                const liff = (await import('@line/liff')).default;
                await liff.init({ liffId: LIFF_ID });
                if (cancelled) return;

                setInLineApp(liff.isInClient());

                if (!liff.isLoggedIn()) {
                    liff.login({ redirectUri: window.location.href });
                    return;
                }

                const token = liff.getIDToken();
                if (!token) {
                    setTokenError('ยังไม่ได้รับอนุญาตให้ยืนยันตัวตนจาก LINE กรุณาติดต่อผู้ดูแลระบบ');
                    return;
                }
                if (cancelled) return;
                setIdToken(token);

                // ดึงโปรไฟล์มาแสดงให้ผู้ใช้เห็นว่ากำลังเชื่อมต่อด้วยบัญชี LINE ไหน
                try {
                    const profile = await liff.getProfile();
                    if (!cancelled) {
                        setLineProfile({ displayName: profile.displayName, pictureUrl: profile.pictureUrl });
                    }
                } catch {
                    // ไม่มีโปรไฟล์ก็ยังเชื่อมต่อได้ แค่ไม่แสดงรูป
                }
            } catch (err) {
                console.error('LIFF init failed:', err);
                if (!cancelled) {
                    setTokenError('เชื่อมต่อ LINE ไม่สำเร็จ กรุณาเปิดลิงก์นี้จากแอป LINE อีกครั้ง');
                }
            } finally {
                if (!cancelled) setLiffReady(true);
            }
        })();

        return () => { cancelled = true; };
    }, []);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setSubmitting(true);
        setError(null);

        try {
            const res = await fetch('/api/line/link', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ token, email, password, idToken }),
            });
            const data = await res.json();

            if (data.success) {
                setResult(data.data);
                // ปิดหน้าต่างเองหลังผู้ใช้อ่านผลลัพธ์ เพื่อกลับไปที่แชท
                if (LIFF_ID && inLineApp) {
                    setTimeout(async () => {
                        try {
                            const liff = (await import('@line/liff')).default;
                            liff.closeWindow();
                        } catch { /* ปิดไม่ได้ก็ให้ผู้ใช้ปิดเอง */ }
                    }, 4000);
                }
            } else {
                setError(data.error || 'ผูกบัญชีไม่สำเร็จ');
            }
        } catch {
            setError('เกิดข้อผิดพลาดในการเชื่อมต่อ กรุณาลองใหม่อีกครั้ง');
        } finally {
            setSubmitting(false);
        }
    };

    // --- สำเร็จ ---
    if (result) {
        return (
            <div className="w-full max-w-md bg-white rounded-2xl shadow-xl p-8 text-center">
                <div className="w-16 h-16 mx-auto mb-4 bg-green-100 rounded-full flex items-center justify-center">
                    <Check className="w-9 h-9 text-green-600" />
                </div>
                <h1 className="text-xl font-bold text-gray-900 mb-1">เชื่อมต่อสำเร็จ</h1>
                <p className="text-sm text-gray-500 mb-6">ตั้งแต่นี้ไป คิวจองทุกความเคลื่อนไหวจะแจ้งมาที่ LINE ของคุณ</p>

                <div className="text-left bg-gray-50 rounded-xl p-4 space-y-2 text-sm">
                    <div className="flex justify-between gap-3">
                        <span className="text-gray-500">ชื่อ</span>
                        <span className="font-medium text-gray-900 text-right">{result.FullName}</span>
                    </div>
                    <div className="flex justify-between gap-3">
                        <span className="text-gray-500">บทบาท</span>
                        <span className="font-medium text-gray-900 text-right">{result.RoleName}</span>
                    </div>
                    <div className="flex justify-between gap-3">
                        <span className="text-gray-500">สาขา</span>
                        <span className="font-medium text-gray-900 text-right">{result.BranchName || 'ไม่ระบุ (ทุกสาขา)'}</span>
                    </div>
                    {result.LineDisplayName && (
                        <div className="flex justify-between gap-3">
                            <span className="text-gray-500">บัญชี LINE</span>
                            <span className="font-medium text-gray-900 text-right">{result.LineDisplayName}</span>
                        </div>
                    )}
                </div>

                <p className="mt-6 text-xs text-gray-400">
                    {LIFF_ID && inLineApp
                        ? 'กำลังกลับไปที่แชท LINE...'
                        : 'ปิดหน้านี้แล้วกลับไปที่แชท LINE ได้เลย'}
                </p>
            </div>
        );
    }

    // --- กำลังตรวจสอบ token / เริ่ม LIFF ---
    if (checking || !liffReady) {
        return (
            <div className="w-full max-w-md bg-white rounded-2xl shadow-xl p-10 flex flex-col items-center gap-3">
                <Spinner />
                <p className="text-sm text-gray-500">
                    {!liffReady ? 'กำลังยืนยันตัวตนกับ LINE...' : 'กำลังตรวจสอบลิงก์...'}
                </p>
            </div>
        );
    }

    // --- token ใช้ไม่ได้ ---
    if (tokenError) {
        return (
            <div className="w-full max-w-md bg-white rounded-2xl shadow-xl p-8 text-center">
                <div className="w-16 h-16 mx-auto mb-4 bg-red-100 rounded-full flex items-center justify-center">
                    <AlertCircle className="w-9 h-9 text-red-600" />
                </div>
                <h1 className="text-xl font-bold text-gray-900 mb-2">ลิงก์นี้ใช้ไม่ได้แล้ว</h1>
                <p className="text-sm text-gray-600">{tokenError}</p>
            </div>
        );
    }

    // --- ฟอร์มยืนยันตัวตน ---
    return (
        <div className="w-full max-w-md bg-white rounded-2xl shadow-xl p-8">
            <div className="text-center mb-6">
                <div className="w-16 h-16 mx-auto mb-4 bg-blue-600 rounded-2xl flex items-center justify-center shadow-lg">
                    <Car className="w-8 h-8 text-white" />
                </div>
                <h1 className="text-2xl font-bold text-gray-900">EV Services</h1>
                <p className="text-gray-500 mt-1">เชื่อมต่อบัญชีเพื่อรับแจ้งเตือนคิวจอง</p>
            </div>

            {LIFF_ID && idToken && (
                <div className="mb-5 p-3 bg-white border border-green-200 rounded-xl flex items-center gap-3">
                    <div className="w-11 h-11 rounded-full bg-[#06C755] flex items-center justify-center shrink-0 overflow-hidden">
                        {lineProfile?.pictureUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={lineProfile.pictureUrl} alt="" className="w-full h-full object-cover" />
                        ) : (
                            <MessageCircle className="w-5 h-5 text-white" />
                        )}
                    </div>
                    <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-gray-900 truncate">
                            {lineProfile?.displayName || 'บัญชี LINE ของคุณ'}
                        </p>
                        <p className="text-xs text-green-700 flex items-center gap-1 mt-0.5">
                            <ShieldCheck className="w-3.5 h-3.5 shrink-0" />
                            ยืนยันตัวตนกับ LINE แล้ว
                        </p>
                    </div>
                </div>
            )}

            {alreadyLinkedTo && (
                <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800">
                    บัญชี LINE นี้ผูกอยู่กับ <strong>{alreadyLinkedTo.FullName}</strong> การยืนยันครั้งนี้จะแทนที่การผูกเดิม
                </div>
            )}

            {error && (
                <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700 flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                    <span>{error}</span>
                </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
                <div className="relative">
                    <Mail className="absolute left-3 top-[38px] w-4 h-4 text-gray-400 pointer-events-none" />
                    <Input
                        label="Email"
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="name@icare-insurance.com"
                        className="pl-9"
                        autoComplete="username"
                        required
                    />
                </div>

                <div className="relative">
                    <Lock className="absolute left-3 top-[38px] w-4 h-4 text-gray-400 pointer-events-none" />
                    <Input
                        label="รหัสผ่าน"
                        type={showPassword ? 'text' : 'password'}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="รหัสผ่านที่ใช้เข้าระบบ"
                        className="pl-9 pr-10"
                        autoComplete="current-password"
                        required
                    />
                    <button
                        type="button"
                        onClick={() => setShowPassword((v) => !v)}
                        className="absolute right-3 top-[36px] text-gray-400 hover:text-gray-600"
                        tabIndex={-1}
                    >
                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                </div>

                <Button
                    type="submit"
                    isLoading={submitting}
                    disabled={Boolean(LIFF_ID) && !idToken}
                    className="w-full"
                    size="lg"
                >
                    เชื่อมต่อบัญชี
                </Button>
            </form>

            <p className="mt-5 text-xs text-center text-gray-400 leading-relaxed">
                ใช้เพื่อยืนยันตัวตนเท่านั้น <br />
                รหัสผ่านของคุณจะไม่ถูกเก็บไว้ในบัญชี LINE
            </p>
        </div>
    );
}

export default function LineLinkPage() {
    return (
        <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
            <Suspense
                fallback={
                    <div className="w-full max-w-md bg-white rounded-2xl shadow-xl p-10 flex justify-center">
                        <Spinner />
                    </div>
                }
            >
                <LinkPageContent />
            </Suspense>
        </div>
    );
}
