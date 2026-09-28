// LINE Notification Card (หน้าโปรไฟล์) — แสดงสถานะอย่างเดียว
//
// ผู้ใช้ทั่วไปปิดการแจ้งเตือนหรือยกเลิกการเชื่อมต่อเองไม่ได้
// เพราะการแจ้งเตือนคิวเป็นเครื่องมือทำงาน ไม่ใช่การตั้งค่าส่วนตัว
// ถ้าต้องเปลี่ยน ให้ผู้ดูแลระบบจัดการที่หน้า "จัดการผู้ใช้"

'use client';

import { useCallback, useEffect, useState } from 'react';
import { Button, Card, CardContent, CardHeader, CardTitle, Spinner } from '@/components/ui';
import { AlertCircle, BellOff, MessageCircle, ShieldCheck } from 'lucide-react';

interface LineLinkInfo {
    DisplayName: string | null;
    PictureUrl: string | null;
    IsActive: boolean;
    NotifyEnabled: boolean;
    LinkedDate: string;
}

interface LineStatus {
    configured: boolean;
    linked: boolean;
    link: LineLinkInfo | null;
    oaBasicId: string | null;
    addFriendUrl: string | null;
}

export function LineNotificationCard() {
    const [status, setStatus] = useState<LineStatus | null>(null);
    const [loading, setLoading] = useState(true);

    const loadStatus = useCallback(async () => {
        try {
            const res = await fetch('/api/line/status');
            const data = await res.json();
            if (data.success) setStatus(data.data);
        } catch {
            // ปล่อยให้แสดงสถานะ "ยังไม่เชื่อมต่อ" ไป ไม่ต้องรบกวนผู้ใช้
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        loadStatus();
    }, [loadStatus]);

    return (
        <Card>
            <CardHeader>
                <CardTitle className="flex items-center gap-2">
                    <MessageCircle className="w-5 h-5 text-[#06C755]" />
                    แจ้งเตือนผ่าน LINE
                </CardTitle>
            </CardHeader>
            <CardContent>
                {loading ? (
                    <div className="py-6 flex justify-center">
                        <Spinner />
                    </div>
                ) : !status?.configured ? (
                    <div className="p-3 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-600 flex items-start gap-2">
                        <AlertCircle className="w-4 h-4 mt-0.5 shrink-0 text-gray-400" />
                        <span>ระบบยังไม่ได้ตั้งค่าการเชื่อมต่อ LINE กรุณาติดต่อผู้ดูแลระบบ</span>
                    </div>
                ) : status.linked && status.link ? (
                    <div className="space-y-4">
                        <div className="flex items-center gap-3 p-3 bg-green-50 border border-green-200 rounded-lg">
                            <div className="w-11 h-11 rounded-full bg-[#06C755] flex items-center justify-center shrink-0 overflow-hidden">
                                {status.link.PictureUrl ? (
                                    // eslint-disable-next-line @next/next/no-img-element
                                    <img src={status.link.PictureUrl} alt="" className="w-full h-full object-cover" />
                                ) : (
                                    <MessageCircle className="w-5 h-5 text-white" />
                                )}
                            </div>
                            <div className="min-w-0 flex-1">
                                <p className="font-medium text-gray-900 truncate">
                                    {status.link.DisplayName || 'เชื่อมต่อแล้ว'}
                                </p>
                                <p className="text-xs text-gray-500">
                                    เชื่อมต่อเมื่อ{' '}
                                    {new Date(status.link.LinkedDate).toLocaleDateString('th-TH', {
                                        day: 'numeric',
                                        month: 'long',
                                        year: 'numeric',
                                    })}
                                </p>
                            </div>
                            <ShieldCheck className="w-5 h-5 text-green-600 shrink-0" />
                        </div>

                        {!status.link.IsActive ? (
                            <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800 flex items-start gap-2">
                                <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                                <span>
                                    ตอนนี้บัญชี LINE ของคุณบล็อก Official Account อยู่ ระบบจึงส่งแจ้งเตือนไม่ได้
                                    — ปลดบล็อกแล้วเพิ่มเพื่อนอีกครั้งเพื่อรับแจ้งเตือนต่อ
                                </span>
                            </div>
                        ) : !status.link.NotifyEnabled ? (
                            <div className="p-3 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-600 flex items-start gap-2">
                                <BellOff className="w-4 h-4 mt-0.5 shrink-0 text-gray-400" />
                                <span>การแจ้งเตือนถูกปิดอยู่ หากต้องการเปิดใหม่ กรุณาติดต่อผู้ดูแลระบบ</span>
                            </div>
                        ) : (
                            <p className="text-sm text-gray-600">
                                คุณจะได้รับแจ้งเตือนทุกความเคลื่อนไหวของคิวจองในสาขาที่คุณดูแล
                                ทั้งการจองใหม่ อนุมัติ เลื่อนนัด และยกเลิก
                            </p>
                        )}

                        <p className="text-xs text-gray-400 border-t border-gray-100 pt-3">
                            หากต้องการเปลี่ยนหรือยกเลิกการเชื่อมต่อ กรุณาติดต่อผู้ดูแลระบบ
                        </p>
                    </div>
                ) : (
                    <div className="space-y-3">
                        <p className="text-sm text-gray-600">
                            เชื่อมต่อบัญชี LINE เพื่อรับแจ้งเตือนคิวจองของสาขาที่คุณดูแล
                            ได้ทันทีโดยไม่ต้องเปิดระบบค้างไว้
                        </p>
                        <ol className="text-sm text-gray-700 space-y-1.5 list-decimal list-inside bg-gray-50 rounded-lg p-4">
                            <li>
                                เพิ่มเพื่อน LINE Official Account{' '}
                                {status.oaBasicId && <span className="font-medium">{status.oaBasicId}</span>}
                            </li>
                            <li>พิมพ์คำว่า <span className="font-medium">“ผูกบัญชี”</span> ในแชท</li>
                            <li>
                                กดลิงก์ที่ระบบส่งให้ แล้วเข้าสู่ระบบด้วย Email และรหัสผ่าน
                                <span className="font-medium">เดียวกับที่ใช้ในระบบนี้</span>
                            </li>
                        </ol>
                        {status.addFriendUrl && (
                            <a href={status.addFriendUrl} target="_blank" rel="noopener noreferrer">
                                <Button className="w-full bg-[#06C755] hover:bg-[#05B34C] focus:ring-[#06C755]">
                                    <MessageCircle className="w-4 h-4 mr-2" />
                                    เพิ่มเพื่อน LINE Official Account
                                </Button>
                            </a>
                        )}
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
