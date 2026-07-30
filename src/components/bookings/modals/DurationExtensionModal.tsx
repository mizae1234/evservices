'use client';

import { useState } from 'react';
import { Modal, Button, Input } from '@/components/ui';

interface BookingForDuration {
    BookingID: number;
    BookingNo: string;
    BookingDate: string;
    StartTime: string;
    EndTime: string;
    CustomerName: string;
    CarRegister: string;
    Status: number;
}

interface DurationExtensionModalProps {
    isOpen: boolean;
    onClose: () => void;
    booking: BookingForDuration | null;
    /** All bookings on the same date for overlap detection */
    allBookings: BookingForDuration[];
    onSaved: () => void;
}

function addMinutesToTime(timeStr: string, minsToAdd: number): string {
    if (!timeStr) return '';
    const [h, m] = timeStr.split(':').map(Number);
    const date = new Date();
    date.setHours(h, m + minsToAdd, 0, 0);
    const newH = String(date.getHours()).padStart(2, '0');
    const newM = String(date.getMinutes()).padStart(2, '0');
    return `${newH}:${newM}`;
}

function calculateDurationText(start: string, end: string): string {
    if (!start || !end) return '';
    const [sh, sm] = start.split(':').map(Number);
    const [eh, em] = end.split(':').map(Number);
    const startMins = sh * 60 + sm;
    let endMins = eh * 60 + em;
    if (endMins < startMins) endMins += 24 * 60;
    const diff = endMins - startMins;
    const hours = Math.floor(diff / 60);
    const mins = diff % 60;
    let text = '';
    if (hours > 0) text += `${hours} ชม. `;
    if (mins > 0) text += `${mins} นาที`;
    return text || '0 นาที';
}

export function DurationExtensionModal({
    isOpen, onClose, booking, allBookings, onSaved,
}: DurationExtensionModalProps) {
    const [endTime, setEndTime] = useState('');
    const [reason, setReason] = useState('');
    const [error, setError] = useState('');
    const [isSaving, setIsSaving] = useState(false);

    // Initialize when booking changes
    const [lastBookingId, setLastBookingId] = useState<number | null>(null);
    if (isOpen && booking && booking.BookingID !== lastBookingId) {
        setEndTime(booking.EndTime);
        setReason('');
        setError('');
        setLastBookingId(booking.BookingID);
    }

    const handleClose = () => {
        if (isSaving) return;
        setLastBookingId(null);
        onClose();
    };

    const handleSave = async () => {
        if (!booking || !endTime) return;
        setError('');

        if (endTime <= booking.StartTime) {
            setError('เวลาสิ้นสุดใหม่ต้องมากกว่าเวลาเริ่มต้น');
            return;
        }

        setIsSaving(true);
        try {
            const res = await fetch(`/api/bookings/${booking.BookingID}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    EndTime: endTime,
                    DurationReason: reason.trim() || 'ขยายเวลาซ่อม',
                }),
            });
            const data = await res.json();
            if (data.success) {
                handleClose();
                onSaved();
            } else {
                setError(data.error || 'เกิดข้อผิดพลาดในการบันทึก');
            }
        } catch (err) {
            console.error(err);
            setError('เกิดข้อผิดพลาดในการเชื่อมต่อเซิร์ฟเวอร์');
        } finally {
            setIsSaving(false);
        }
    };

    const hasOverlap = booking && allBookings.some(b =>
        b.BookingID !== booking.BookingID &&
        b.Status !== 2 &&
        b.BookingDate === booking.BookingDate &&
        b.StartTime >= booking.StartTime &&
        b.StartTime < endTime
    );

    return (
        <Modal
            isOpen={isOpen}
            onClose={handleClose}
            title="⏱️ ขยาย / ปรับระยะเวลาซ่อม"
        >
            {booking && (
                <div className="space-y-4">
                    {error && (
                        <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700 font-semibold flex items-center gap-2">
                            <span>❌</span>
                            <span>{error}</span>
                        </div>
                    )}

                    <div className="bg-purple-50 border border-purple-200 rounded-xl p-3.5 text-sm text-purple-900 leading-relaxed">
                        <div className="font-bold flex items-center justify-between border-b border-purple-200/60 pb-2 mb-2">
                            <span>เลขที่จอง: {booking.BookingNo}</span>
                            <span className="text-xs bg-purple-200 text-purple-800 px-2 py-0.5 rounded-full font-semibold">
                                {booking.CarRegister}
                            </span>
                        </div>
                        <div className="grid grid-cols-2 gap-2 text-xs">
                            <div>ลูกค้า: <strong>{booking.CustomerName}</strong></div>
                            <div>เวลาเริ่มต้นเดิม: <strong>{booking.StartTime} น.</strong></div>
                            <div>เวลาสิ้นสุดเดิม: <strong>{booking.EndTime} น.</strong></div>
                            <div>ระยะเวลาเดิม: <strong>{calculateDurationText(booking.StartTime, booking.EndTime)}</strong></div>
                        </div>
                    </div>

                    <div>
                        <label className="block text-xs font-bold text-gray-700 mb-2 uppercase tracking-wider">
                            เลือกกดเพิ่มเวลาด่วน (Quick Add)
                        </label>
                        <div className="grid grid-cols-4 gap-2">
                            {[
                                { label: '+30 นาที', mins: 30 },
                                { label: '+1 ชม.', mins: 60 },
                                { label: '+1.5 ชม.', mins: 90 },
                                { label: '+2 ชม.', mins: 120 },
                            ].map((item) => {
                                const newEnd = addMinutesToTime(booking.EndTime, item.mins);
                                const isSelected = endTime === newEnd;
                                return (
                                    <button
                                        key={item.label}
                                        type="button"
                                        onClick={() => setEndTime(newEnd)}
                                        className={`py-2 px-1 text-xs font-semibold rounded-lg border transition-all ${
                                            isSelected
                                                ? 'bg-purple-600 text-white border-purple-600 shadow-sm ring-2 ring-purple-200'
                                                : 'bg-white hover:bg-purple-50 border-gray-200 text-purple-700'
                                        }`}
                                    >
                                        {item.label}
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3 items-end">
                        <Input
                            label="เวลาสิ้นสุดใหม่ (EndTime)"
                            type="time"
                            value={endTime}
                            onChange={(e) => setEndTime(e.target.value)}
                            required
                        />
                        <div className="bg-gray-50 border border-gray-200 rounded-lg p-2.5 text-center text-xs">
                            <span className="text-gray-500 block">ระยะเวลาใหม่รวม</span>
                            <strong className="text-purple-700 text-sm font-bold">
                                {calculateDurationText(booking.StartTime, endTime)}
                            </strong>
                        </div>
                    </div>

                    {/* Overlap Notice */}
                    {hasOverlap && (
                        <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-800 leading-relaxed flex items-start gap-2">
                            <span className="text-sm">⚠️</span>
                            <div>
                                <strong>เวลาใหม่คาบเกี่ยวกับคิวอื่นในวันเดียวกัน:</strong>
                                <p className="mt-0.5 text-amber-700">
                                    การขยายเวลาจะทำให้ช่วงเวลานี้ชนกับคิวถัดไป คุณสามารถบันทึกได้ และบริหารจัดการคิวคันต่อๆ ไปหน้างานตามความเหมาะสม
                                </p>
                            </div>
                        </div>
                    )}

                    <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">เหตุผลในการปรับเวลา (ถ้ามี)</label>
                        <textarea
                            placeholder="ระบุเหตุผลการขยายเวลา เช่น งานซ่อมใช้เวลามากกว่าปกติ, รออะไหล่..."
                            value={reason}
                            onChange={(e) => setReason(e.target.value)}
                            rows={2}
                            className="w-full border border-gray-300 rounded-lg p-2 text-xs text-gray-900 focus:ring-purple-500 focus:border-purple-500 placeholder:text-gray-400"
                        />
                    </div>

                    <div className="flex justify-end gap-2 pt-2 border-t">
                        <Button variant="outline" onClick={handleClose} disabled={isSaving}>
                            ยกเลิก
                        </Button>
                        <Button
                            onClick={handleSave}
                            disabled={isSaving}
                            className="bg-purple-600 hover:bg-purple-700 text-white"
                        >
                            {isSaving ? 'กำลังบันทึก...' : '💾 บันทึกการปรับเวลา'}
                        </Button>
                    </div>
                </div>
            )}
        </Modal>
    );
}
