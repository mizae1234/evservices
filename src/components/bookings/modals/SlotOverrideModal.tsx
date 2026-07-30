'use client';

import { useState } from 'react';
import { Modal, Button, Input } from '@/components/ui';
import { formatDate } from '@/lib/utils';
import { SlotAvailability } from '@/types';

interface SlotOverrideModalProps {
    isOpen: boolean;
    onClose: () => void;
    slot: SlotAvailability | null;
    filterBranch: string;
    filterDate: string;
    onSaved: () => void;
    onError: (title: string, message: string) => void;
}

export function SlotOverrideModal({
    isOpen, onClose, slot, filterBranch, filterDate, onSaved, onError,
}: SlotOverrideModalProps) {
    const [overrideIsOpen, setOverrideIsOpen] = useState(true);
    const [overrideMaxQueue, setOverrideMaxQueue] = useState('');
    const [overrideReason, setOverrideReason] = useState('');
    const [isSaving, setIsSaving] = useState(false);
    const [bookedCount, setBookedCount] = useState(0);

    // Initialize state when slot changes
    const initFromSlot = (s: SlotAvailability) => {
        setOverrideIsOpen(s.IsSlotClosed ? false : true);
        setOverrideMaxQueue(
            s.IsOverridden && !s.IsSlotClosed
                ? (s.MaxQueue).toString()
                : ''
        );
        setOverrideReason(s.OverrideReason || '');
        setBookedCount(s.BookedCount);
    };

    // Track the last slot we initialized from
    const [lastSlotKey, setLastSlotKey] = useState('');
    const slotKey = slot ? `${slot.StartTime}-${slot.EndTime}` : '';
    if (isOpen && slot && slotKey !== lastSlotKey) {
        initFromSlot(slot);
        setLastSlotKey(slotKey);
    }

    const handleClose = () => {
        setLastSlotKey('');
        onClose();
    };

    const handleSave = async () => {
        if (!slot || !filterBranch || !filterDate) return;

        setIsSaving(true);
        try {
            const res = await fetch('/api/bookings/slot-overrides', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    branchId: filterBranch,
                    date: filterDate,
                    startTime: slot.StartTime,
                    endTime: slot.EndTime,
                    isOpen: overrideIsOpen,
                    maxQueueOverride: overrideIsOpen && overrideMaxQueue
                        ? parseInt(overrideMaxQueue)
                        : null,
                    reason: overrideReason || null,
                }),
            });
            const data = await res.json();
            if (data.success) {
                handleClose();
                onSaved();
            } else {
                onError('บันทึกไม่สำเร็จ', data.error || 'ไม่สามารถบันทึกการปรับแต่งสล็อตได้');
            }
        } catch (err) {
            console.error('Error saving override:', err);
            onError('เกิดข้อผิดพลาด', 'เกิดข้อผิดพลาดในการเชื่อมต่อเซิร์ฟเวอร์');
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <Modal
            isOpen={isOpen}
            onClose={handleClose}
            title={`ปรับสล็อต ${slot?.StartTime || ''} - ${slot?.EndTime || ''} น.`}
        >
            <div className="space-y-4 p-1">
                <div className="bg-blue-50 border border-blue-100 rounded-lg p-3 text-xs text-blue-800">
                    <strong>ปรับโควตาสล็อตชั่วคราว</strong> สำหรับวันที่ <strong>{formatDate(filterDate)}</strong> เท่านั้น
                    <br />ค่า default ของสล็อตนี้: <strong>{slot?.OriginalMaxQueue ?? slot?.MaxQueue ?? '-'} คิว</strong>
                </div>

                {/* Toggle: Open / Close */}
                <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">สถานะสล็อต</label>
                    <div className="flex gap-3">
                        <button
                            type="button"
                            onClick={() => setOverrideIsOpen(true)}
                            className={`flex-1 py-2.5 rounded-lg border text-sm font-bold transition-all ${
                                overrideIsOpen
                                    ? 'bg-green-50 border-green-300 text-green-700 ring-2 ring-green-200'
                                    : 'bg-gray-50 border-gray-200 text-gray-400 hover:bg-gray-100'
                            }`}
                        >
                            ✅ เปิดรับคิว
                        </button>
                        <button
                            type="button"
                            onClick={() => setOverrideIsOpen(false)}
                            className={`flex-1 py-2.5 rounded-lg border text-sm font-bold transition-all ${
                                !overrideIsOpen
                                    ? 'bg-red-50 border-red-300 text-red-700 ring-2 ring-red-200'
                                    : 'bg-gray-50 border-gray-200 text-gray-400 hover:bg-gray-100'
                            }`}
                        >
                            🚫 ปิดรับคิว
                        </button>
                    </div>
                </div>

                {/* Warning: existing bookings when closing */}
                {!overrideIsOpen && bookedCount > 0 && (
                    <div className="bg-amber-50 border border-amber-300 rounded-lg p-3 text-xs text-amber-800 flex items-start gap-2">
                        <span className="text-base mt-[-2px]">⚠️</span>
                        <div>
                            <strong>สล็อตนี้มีคิวจองอยู่แล้ว {bookedCount} คิว</strong>
                            <br />การปิดสล็อตจะไม่ยกเลิกคิวที่จองไว้แล้ว แต่จะ<strong>ไม่รับคิวใหม่</strong>เพิ่ม
                            <br />หากต้องการย้ายคิว สามารถ Reschedule ได้จากรายการจองด้านล่าง
                        </div>
                    </div>
                )}

                {/* Warning: reducing quota below booked count */}
                {overrideIsOpen && overrideMaxQueue && parseInt(overrideMaxQueue) < bookedCount && bookedCount > 0 && (
                    <div className="bg-amber-50 border border-amber-300 rounded-lg p-3 text-xs text-amber-800 flex items-start gap-2">
                        <span className="text-base mt-[-2px]">⚠️</span>
                        <div>
                            <strong>โควตาที่ตั้ง ({overrideMaxQueue}) น้อยกว่าคิวที่จองอยู่แล้ว ({bookedCount} คิว)</strong>
                            <br />คิวที่จองไว้แล้วจะยังคงอยู่ แต่สล็อตจะแสดงสถานะ &quot;เต็ม&quot; ไม่รับคิวใหม่
                        </div>
                    </div>
                )}

                {/* MaxQueue Override (only when open) */}
                {overrideIsOpen && (
                    <div>
                        <label className="block text-sm font-semibold text-gray-700 mb-1">จำนวนโควตาที่ต้องการ (เว้นว่างหาก = ค่า default)</label>
                        <Input
                            type="number"
                            value={overrideMaxQueue}
                            onChange={(e) => setOverrideMaxQueue(e.target.value)}
                            placeholder={`ค่า default: ${slot?.OriginalMaxQueue ?? slot?.MaxQueue ?? '-'} คิว`}
                            min="0"
                            max="99"
                        />
                        <p className="text-xs text-gray-400 mt-1">เว้นว่างเพื่อใช้ค่า default ({slot?.OriginalMaxQueue ?? slot?.MaxQueue ?? '-'} คิว)</p>
                    </div>
                )}

                {/* Reason */}
                <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-1">เหตุผลการปรับ (ไม่บังคับ)</label>
                    <Input
                        value={overrideReason}
                        onChange={(e) => setOverrideReason(e.target.value)}
                        placeholder="เช่น คนงานน้อย / เครื่องมือไม่พอ / ปรับตามงานจริง"
                    />
                </div>

                {/* Preview */}
                <div className="bg-gray-50 border border-gray-100 rounded-lg p-3 text-xs text-gray-600">
                    <strong>ผลลัพธ์:</strong>{' '}
                    {!overrideIsOpen ? (
                        <span className="text-red-600 font-bold">สล็อตนี้จะถูกปิดรับคิวในวันที่เลือก</span>
                    ) : overrideMaxQueue ? (
                        <span className="text-orange-600 font-bold">สล็อตนี้จะรับคิวสูงสุด {overrideMaxQueue} คิว (แทน {slot?.OriginalMaxQueue ?? slot?.MaxQueue} คิว)</span>
                    ) : (
                        <span className="text-green-600 font-bold">สล็อตนี้จะใช้ค่า default ({slot?.OriginalMaxQueue ?? slot?.MaxQueue} คิว)</span>
                    )}
                </div>

                {/* Actions */}
                <div className="flex justify-end gap-2 pt-2 border-t border-gray-100">
                    <Button variant="outline" onClick={handleClose}>
                        ยกเลิก
                    </Button>
                    <Button onClick={handleSave} isLoading={isSaving}>
                        💾 บันทึกการปรับ
                    </Button>
                </div>
            </div>
        </Modal>
    );
}
