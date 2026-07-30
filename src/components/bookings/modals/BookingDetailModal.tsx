'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Modal, Button } from '@/components/ui';
import { formatDate } from '@/lib/utils';
import { Pencil } from 'lucide-react';

interface BookingDetailModalProps {
    isOpen: boolean;
    onClose: () => void;
    bookingId: number | null;
}

export function BookingDetailModal({ isOpen, onClose, bookingId }: BookingDetailModalProps) {
    const router = useRouter();
    const [booking, setBooking] = useState<any | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [newNoteText, setNewNoteText] = useState('');
    const [isSavingNote, setIsSavingNote] = useState(false);

    // Fetch booking detail when modal opens
    const fetchDetail = async (id: number) => {
        setIsLoading(true);
        setBooking(null);
        try {
            const res = await fetch(`/api/bookings/${id}`);
            const data = await res.json();
            if (data.success) {
                setBooking(data.data);
            }
        } catch (err) {
            console.error('Error loading booking detail:', err);
        } finally {
            setIsLoading(false);
        }
    };

    // Trigger fetch when bookingId changes and modal is open
    // We use a ref-like pattern: parent calls open with bookingId
    // This is handled via useEffect-like behavior in the parent
    // For simplicity, we expose fetchDetail and let parent call it
    const handleOpen = () => {
        if (bookingId) {
            fetchDetail(bookingId);
        }
    };

    // Re-fetch when bookingId changes (if modal is open)
    if (isOpen && bookingId && !booking && !isLoading) {
        fetchDetail(bookingId);
    }

    const handleSaveNote = async () => {
        if (!booking || !newNoteText.trim()) return;
        setIsSavingNote(true);
        try {
            const res = await fetch(`/api/bookings/${booking.BookingID}/logs`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ content: newNoteText }),
            });
            const data = await res.json();
            if (data.success) {
                setBooking((prev: any) => {
                    if (!prev) return null;
                    return {
                        ...prev,
                        Logs: [data.data, ...(prev.Logs || [])]
                    };
                });
                setNewNoteText('');
            }
        } catch (err) {
            console.error('Error saving note:', err);
        } finally {
            setIsSavingNote(false);
        }
    };

    const handleClose = () => {
        setBooking(null);
        setNewNoteText('');
        onClose();
    };

    return (
        <Modal
            isOpen={isOpen}
            onClose={handleClose}
            title="รายละเอียดการจองคิว"
            size="2xl"
        >
            {isLoading ? (
                <div className="py-12 text-center text-gray-500">
                    <div className="animate-spin inline-block w-6 h-6 border-2 border-current border-t-transparent text-blue-600 rounded-full mb-2" />
                    <div className="text-xs">กำลังโหลดรายละเอียด...</div>
                </div>
            ) : booking && (
                <div className="space-y-4">
                    {/* Status Header */}
                    <div className="flex items-center justify-between pb-3 border-b border-gray-100">
                        <div>
                            <span className="text-xs font-bold text-gray-400 block uppercase tracking-wider">เลขที่การจอง</span>
                            <span className="text-lg font-bold text-blue-600">{booking.BookingNo}</span>
                        </div>
                        <div>
                            <span className="text-xs font-bold text-gray-400 block uppercase tracking-wider text-right">สถานะคิว</span>
                            <span className={`inline-block px-2.5 py-1 rounded-full text-xs font-bold ${
                                booking.Status === 1 ? 'bg-green-100 text-green-800' :
                                booking.Status === 2 ? 'bg-red-100 text-red-800' :
                                booking.Status === 3 ? 'bg-blue-100 text-blue-800' :
                                booking.Status === 4 ? 'bg-emerald-100 text-emerald-800' :
                                'bg-yellow-100 text-yellow-800'
                            }`}>
                                {booking.Status === 1 ? 'อนุมัติแล้ว' :
                                 booking.Status === 2 ? 'ยกเลิก' :
                                 booking.Status === 3 ? 'เปิดใบเคลมแล้ว' :
                                 booking.Status === 4 ? 'ปิดงาน' :
                                 'รอดำเนินการ'}
                            </span>
                        </div>
                    </div>

                    {/* Customer & Vehicle Info */}
                    <div className="grid grid-cols-2 gap-4 bg-gray-50 p-4 rounded-xl">
                        <div>
                            <span className="text-[10px] text-gray-400 block uppercase font-semibold">ชื่อลูกค้า</span>
                            <span className="font-semibold text-gray-900">{booking.CustomerName}</span>
                        </div>
                        <div>
                            <span className="text-[10px] text-gray-400 block uppercase font-semibold">เบอร์โทร</span>
                            <span className="font-semibold text-gray-900">{booking.CustomerPhone || '-'}</span>
                        </div>
                        <div>
                            <span className="text-[10px] text-gray-400 block uppercase font-semibold">สาขาที่จอง</span>
                            <span className="font-semibold text-gray-900">{booking.Branch?.BranchName || 'ไม่ระบุ'}</span>
                        </div>
                        <div>
                            <span className="text-[10px] text-gray-400 block uppercase font-semibold">ทะเบียนรถยนต์</span>
                            <span className="font-semibold text-gray-900">{booking.CarRegister}</span>
                        </div>
                        <div>
                            <span className="text-[10px] text-gray-400 block uppercase font-semibold">รุ่นรถยนต์</span>
                            <span className="font-semibold text-gray-900">{booking.CarModel || '-'}</span>
                        </div>
                        <div className="col-span-2">
                            <span className="text-[10px] text-gray-400 block uppercase font-semibold">เลขตัวถัง (VIN)</span>
                            <span className="font-mono text-xs font-semibold text-gray-900">{booking.VinNo || '-'}</span>
                        </div>
                    </div>

                    {/* Booking Schedule & Mileage */}
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <span className="text-[10px] text-gray-400 block uppercase font-semibold">วันที่นัดหมาย</span>
                            <span className="font-semibold text-gray-900">
                                {formatDate(booking.BookingDate)}
                            </span>
                        </div>
                        <div>
                            <span className="text-[10px] text-gray-400 block uppercase font-semibold">เวลานัดหมาย</span>
                            <span className="font-semibold text-gray-900">
                                {booking.StartTime} - {booking.EndTime} น.
                            </span>
                        </div>
                        <div>
                            <span className="text-[10px] text-gray-400 block uppercase font-semibold">ประเภทงาน</span>
                            <span className={`font-semibold ${
                                booking.ProjectType === 'ซ่อมทั่วไป' || booking.Mileage === 0
                                    ? 'text-amber-600'
                                    : 'text-blue-600'
                            }`}>
                                {booking.ProjectType === 'ซ่อมทั่วไป' || booking.Mileage === 0
                                    ? '🔧 ซ่อมทั่วไป'
                                    : `📅 ตรวจเช็คระยะ (${booking.Mileage.toLocaleString()} กม.)`}
                            </span>
                        </div>
                        <div>
                            <span className="text-[10px] text-gray-400 block uppercase font-semibold">เลขไมล์ปัจจุบัน</span>
                            <span className="font-semibold text-gray-900">
                                {booking.LastMileage.toLocaleString()} กม.
                            </span>
                        </div>
                    </div>

                    {/* Claim/Issue Details */}
                    <div>
                        <span className="text-[10px] text-gray-400 block uppercase font-semibold mb-1">รายละเอียดอาการชำรุด</span>
                        <div className="bg-white border border-gray-200 p-3 rounded-lg text-sm text-gray-700 whitespace-pre-wrap max-h-24 overflow-y-auto leading-relaxed">
                            {booking.ClaimDetail || 'ไม่มีรายละเอียดเพิ่มเติม'}
                        </div>
                    </div>

                    {/* Request & Approval Timestamps */}
                    <div className="grid grid-cols-2 gap-4 bg-blue-50/50 p-3 rounded-xl border border-blue-100 text-xs">
                        <div>
                            <span className="text-[10px] text-blue-600 block uppercase font-bold">📥 วันที่สร้างคำขอ (ส่งจอง)</span>
                            <span className="font-semibold text-gray-900">
                                {booking.CreateDate
                                    ? new Date(booking.CreateDate).toLocaleString('th-TH', { hour: '2-digit', minute: '2-digit', day: 'numeric', month: 'short', year: '2-digit' }) + ' น.'
                                    : '-'}
                            </span>
                        </div>
                        <div>
                            <span className="text-[10px] text-emerald-600 block uppercase font-bold">✅ วันที่อนุมัติคิว</span>
                            <span className="font-semibold text-gray-900">
                                {(() => {
                                    const approvedLog = booking.Logs?.find((l: any) => l.LogType === 'APPROVED' || l.LogType === 'AUTO_APPROVED');
                                    if (approvedLog) {
                                        return new Date(approvedLog.CreateDate).toLocaleString('th-TH', { hour: '2-digit', minute: '2-digit', day: 'numeric', month: 'short', year: '2-digit' }) + ' น.';
                                    }
                                    if (booking.Status === 1) {
                                        return booking.CreateDate
                                            ? new Date(booking.CreateDate).toLocaleString('th-TH', { hour: '2-digit', minute: '2-digit', day: 'numeric', month: 'short', year: '2-digit' }) + ' น.'
                                            : 'อนุมัติแล้ว';
                                    }
                                    if (booking.Status === 2) return 'ยกเลิกแล้ว';
                                    return '⏳ รอการอนุมัติ';
                                })()}
                            </span>
                        </div>
                    </div>

                    {/* Timeline logs */}
                    <div className="space-y-1 pt-2 border-t border-gray-100">
                        <span className="text-[10px] text-gray-400 block uppercase font-semibold">บันทึกประวัติการเลื่อนคิวและโน้ตช่วยจำ</span>
                        <div className="bg-white border border-gray-200 rounded-xl p-3 max-h-40 overflow-y-auto space-y-2 leading-relaxed">
                            {(!booking.Logs || booking.Logs.length === 0) ? (
                                <div className="text-xs text-gray-400 text-center py-4">ไม่มีประวัติการบันทึกคิวนี้</div>
                            ) : (
                                <>
                                    {/* Fallback for creation date if older booking has no CREATED log */}
                                    {booking.CreateDate && !booking.Logs?.some((l: any) => l.LogType === 'CREATED' || l.LogType === 'AUTO_APPROVED') && (
                                        <div className="p-2 rounded-lg border text-xs bg-blue-50/50 border-blue-200 text-blue-950">
                                            <div className="flex items-center justify-between font-bold mb-1">
                                                <span className="flex items-center gap-1">
                                                    <span>📥</span>
                                                    <span>ขอจองคิวในระบบ (วันเปิดคำขอ)</span>
                                                </span>
                                                <span className="text-[10px] font-normal text-gray-400">
                                                    {new Date(booking.CreateDate).toLocaleString('th-TH', { hour: '2-digit', minute: '2-digit', day: 'numeric', month: 'short', year: '2-digit' })} น.
                                                </span>
                                            </div>
                                            <div className="text-[11px] opacity-80">วันที่ลูกค้า/เจ้าหน้าที่ส่งคำขอจองคิวเข้ามาในระบบ</div>
                                        </div>
                                    )}
                                    {booking.Logs.map((log: any) => {
                                        let icon = '⚙️';
                                        let bgColor = 'bg-gray-50 border-gray-200 text-gray-800';
                                        let title = 'บันทึกระบบ';
                                        if (log.LogType === 'CREATED') {
                                            icon = '📥';
                                            bgColor = 'bg-blue-50/50 border-blue-200 text-blue-950';
                                            title = 'ขอจองคิว (รออนุมัติ)';
                                    } else if (log.LogType === 'APPROVED' || log.LogType === 'AUTO_APPROVED') {
                                        icon = '✅';
                                        bgColor = 'bg-green-50/50 border-green-200 text-green-950';
                                        title = log.LogType === 'AUTO_APPROVED' ? 'อนุมัติอัตโนมัติ' : 'อนุมัติการจองคิว';
                                    } else if (log.LogType === 'REJECTED') {
                                        icon = '🚫';
                                        bgColor = 'bg-red-50/50 border-red-200 text-red-950';
                                        title = 'ปฏิเสธคำขอจองคิว';
                                    } else if (log.LogType === 'RESCHEDULE') {
                                        icon = '📅';
                                        bgColor = 'bg-blue-50/50 border-blue-200 text-blue-950';
                                        title = 'เลื่อนนัดหมาย';
                                    } else if (log.LogType === 'CANCEL') {
                                        icon = '❌';
                                        bgColor = 'bg-red-50/50 border-red-200 text-red-950';
                                        title = 'ยกเลิกคิว';
                                    } else if (log.LogType === 'NOTE' || log.LogType === 'CS_NOTE') {
                                        icon = '📞';
                                        bgColor = 'bg-orange-50/50 border-orange-200 text-orange-950';
                                        title = 'บันทึกการติดตาม (CS Call Center)';
                                    }
                                    
                                    return (
                                        <div key={log.LogID} className={`p-2 rounded-lg border text-xs ${bgColor}`}>
                                            <div className="flex items-center justify-between font-bold mb-1">
                                                <span className="flex items-center gap-1">
                                                    <span>{icon}</span>
                                                    <span>{title}</span>
                                                </span>
                                                <span className="text-[10px] font-normal text-gray-400">
                                                    โดย: {log.CreateBy} | {new Date(log.CreateDate).toLocaleString('th-TH', { hour: '2-digit', minute: '2-digit', day: 'numeric', month: 'short', year: '2-digit' })} น.
                                                </span>
                                            </div>
                                            <div className="whitespace-pre-wrap font-medium">{log.Content}</div>
                                        </div>
                                    );
                                })}
                                </>
                            )}
                        </div>
                    </div>

                    {/* Write new note */}
                    {(booking.Status === 0 || booking.Status === 1) && (
                        <div className="pt-2 border-t border-gray-100">
                            <label className="block text-[10px] text-gray-400 uppercase font-semibold mb-1">เขียนบันทึกช่วยจำ / โน้ตใหม่</label>
                            <div className="flex gap-2">
                                <textarea
                                    placeholder="เช่น ลูกค้าแจ้งความต้องการพิเศษ / โน้ตเตือนผู้เกี่ยวข้อง..."
                                    value={newNoteText}
                                    onChange={(e) => setNewNoteText(e.target.value)}
                                    className="flex-1 border border-gray-300 rounded-lg p-2 text-xs text-gray-900 placeholder-gray-400 h-10 focus:ring-blue-500 focus:border-blue-500 resize-none"
                                />
                                <Button
                                    type="button"
                                    size="sm"
                                    disabled={isSavingNote || !newNoteText.trim()}
                                    onClick={handleSaveNote}
                                    className="bg-blue-600 hover:bg-blue-700 text-white h-10 self-end text-xs px-3"
                                >
                                    {isSavingNote ? 'กำลังบันทึก...' : 'บันทึกโน้ต'}
                                </Button>
                            </div>
                        </div>
                    )}

                    {/* Close button */}
                    <div className="flex justify-end gap-3 pt-3 border-t border-gray-100">
                        {(booking.Status === 0 || booking.Status === 1) && (
                            <Button
                                onClick={() => {
                                    handleClose();
                                    router.push(`/service-center/bookings/${booking.BookingID}/edit`);
                                }}
                                className="bg-blue-600 hover:bg-blue-700 text-white flex items-center gap-1.5"
                            >
                                <Pencil className="w-4 h-4" />
                                แก้ไขข้อมูลคิว
                            </Button>
                        )}
                        <Button
                            onClick={handleClose}
                            variant="outline"
                        >
                            ปิดหน้าต่าง
                        </Button>
                    </div>
                </div>
            )}
        </Modal>
    );
}
