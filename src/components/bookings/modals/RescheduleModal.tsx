import { useState, useEffect } from 'react';
import { Modal, Button } from '@/components/ui';
import { formatDate } from '@/lib/utils';
import { SlotAvailability } from '@/types';
import { MileageWarning } from '@/components/bookings/MileageWarning';

interface Booking {
    BookingID: number;
    BookingNo: string;
    BookingDate: string;
    StartTime: string;
    EndTime: string;
    CustomerName: string;
    CarRegister: string;
    BranchID: number;
    Branch: { BranchName: string };
    Mileage: number;
    LastMileage: number;
}

interface RescheduleModalProps {
    isOpen: boolean;
    onClose: () => void;
    booking: Booking | null;
    onSuccess: () => void;
    onError: (message: string) => void;
}

export function RescheduleModal({ isOpen, onClose, booking, onSuccess, onError }: RescheduleModalProps) {
    const [rescheduleDate, setRescheduleDate] = useState('');
    const [rescheduleSlot, setRescheduleSlot] = useState<{ StartTime: string; EndTime: string } | null>(null);
    const [rescheduleReason, setRescheduleReason] = useState('');
    const [rescheduleSlots, setRescheduleSlots] = useState<SlotAvailability[]>([]);
    const [isLoadingRescheduleSlots, setIsLoadingRescheduleSlots] = useState(false);
    const [isRescheduleBranchClosed, setIsRescheduleBranchClosed] = useState(false);
    const [rescheduleBranchClosedReason, setRescheduleBranchClosedReason] = useState('');
    const [isSavingReschedule, setIsSavingReschedule] = useState(false);

    useEffect(() => {
        if (isOpen && booking) {
            setRescheduleDate('');
            setRescheduleSlot(null);
            setRescheduleReason('');
            setRescheduleSlots([]);
            setIsRescheduleBranchClosed(false);
        }
    }, [isOpen, booking]);

    useEffect(() => {
        const fetchRescheduleSlots = async () => {
            if (!booking || !rescheduleDate) {
                setRescheduleSlots([]);
                return;
            }
            setIsLoadingRescheduleSlots(true);
            setIsRescheduleBranchClosed(false);
            setRescheduleBranchClosedReason('');
            try {
                const branchId = booking.BranchID;
                const res = await fetch(`/api/bookings/slots?branchId=${branchId}&date=${rescheduleDate}`, { cache: 'no-store' });
                const data = await res.json();
                if (data.success) {
                    if (data.isClosed) {
                        setIsRescheduleBranchClosed(true);
                        setRescheduleBranchClosedReason(data.reason || 'สาขาปิดทำการ');
                        setRescheduleSlots([]);
                    } else {
                        setRescheduleSlots(data.data || []);
                    }
                } else {
                    setRescheduleSlots([]);
                }
            } catch (err) {
                console.error('Error fetching reschedule slots:', err);
                setRescheduleSlots([]);
            } finally {
                setIsLoadingRescheduleSlots(false);
            }
        };

        if (isOpen) {
            fetchRescheduleSlots();
        }
    }, [isOpen, rescheduleDate, booking]);

    const handleSaveReschedule = async () => {
        if (!booking || !rescheduleDate || !rescheduleSlot) return;
        if (!rescheduleReason.trim()) {
            onError('กรุณากรอกเหตุผลในการเลื่อนคิว');
            return;
        }

        setIsSavingReschedule(true);
        try {
            const res = await fetch(`/api/bookings/${booking.BookingID}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    BookingDate: rescheduleDate,
                    StartTime: rescheduleSlot.StartTime,
                    EndTime: rescheduleSlot.EndTime,
                    RescheduleReason: rescheduleReason.trim(),
                }),
            });
            const data = await res.json();
            if (data.success) {
                onSuccess();
                onClose();
            } else {
                onError(data.error || 'ไม่สามารถเลื่อนคิวได้');
            }
        } catch (error) {
            console.error(error);
            onError('เกิดข้อผิดพลาดในการเชื่อมต่อเซิร์ฟเวอร์');
        } finally {
            setIsSavingReschedule(false);
        }
    };

    const toDateInputString = (dateStr: string) => {
        if (!dateStr) return '';
        const d = new Date(dateStr);
        d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
        return d.toISOString().split('T')[0];
    };

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            title="เลื่อนนัดหมาย (Reschedule)"
            size="md"
        >
            {booking && (
                <div className="space-y-4">
                    <div>
                        <p className="text-xs text-gray-500 font-semibold uppercase">รายละเอียดคิวเดิม</p>
                        <div className="mt-1 p-3 bg-gray-50 rounded-lg text-sm text-gray-700">
                            <div><strong>เลขที่จอง:</strong> {booking.BookingNo}</div>
                            <div><strong>ลูกค้า:</strong> {booking.CustomerName} ({booking.CarRegister})</div>
                            <div><strong>คิวเดิม:</strong> {formatDate(booking.BookingDate)} ({booking.StartTime} - {booking.EndTime} น.)</div>
                            <div><strong>สาขา:</strong> {booking.Branch.BranchName}</div>
                        </div>
                    </div>

                    {/* Date selection */}
                    <div>
                        <label className="block text-xs font-bold text-gray-700 mb-1">เลือกวันที่จองใหม่ *</label>
                        <input
                            type="date"
                            min={new Date().toISOString().split('T')[0]}
                            value={rescheduleDate}
                            onChange={(e) => {
                                setRescheduleDate(e.target.value);
                                setRescheduleSlot(null);
                            }}
                            className="w-full border border-gray-300 rounded-lg p-2 text-sm text-gray-900 focus:ring-blue-500 focus:border-blue-500"
                        />
                    </div>

                    {/* Slots selection */}
                    <div>
                        <label className="block text-xs font-bold text-gray-700 mb-1">เลือกสล็อตเวลาใหม่ *</label>
                        {isLoadingRescheduleSlots ? (
                            <div className="text-sm text-gray-400 py-3 flex items-center justify-center">
                                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600 mr-2"></div>
                                กำลังโหลดเวลาว่าง...
                            </div>
                        ) : isRescheduleBranchClosed ? (
                            <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-xs font-medium rounded-lg">
                                🔴 สาขาปิดบริการ: {rescheduleBranchClosedReason}
                            </div>
                        ) : rescheduleSlots.length === 0 ? (
                            <div className="text-sm text-gray-400 py-3 text-center">
                                ไม่มีการตั้งค่าเวลาคิวในวันที่เลือก
                            </div>
                        ) : (
                            <div className="grid grid-cols-2 gap-2">
                                {rescheduleSlots.map((slot) => {
                                    const isSameSlot = toDateInputString(booking.BookingDate) === rescheduleDate &&
                                                       booking.StartTime === slot.StartTime &&
                                                       booking.EndTime === slot.EndTime;
                                    
                                    const isFull = !slot.IsAvailable && !isSameSlot;
                                    const isSelected = rescheduleSlot?.StartTime === slot.StartTime && rescheduleSlot?.EndTime === slot.EndTime;

                                    return (
                                        <button
                                            key={slot.StartTime}
                                            type="button"
                                            disabled={isFull}
                                            onClick={() => setRescheduleSlot({ StartTime: slot.StartTime, EndTime: slot.EndTime })}
                                            className={`p-2.5 rounded-lg border text-xs text-left transition-all ${
                                                isSelected
                                                    ? 'bg-blue-600 text-white border-blue-600 font-bold'
                                                    : isFull
                                                        ? 'bg-gray-50 border-gray-100 text-gray-300 cursor-not-allowed'
                                                        : 'bg-white border-gray-200 text-gray-700 hover:border-blue-300 hover:bg-blue-50/10'
                                            }`}
                                        >
                                            <div className="font-semibold">{slot.StartTime} - {slot.EndTime} น.</div>
                                            <div className={`mt-0.5 text-[10px] ${isSelected ? 'text-blue-100' : isFull ? 'text-gray-300' : 'text-gray-500'}`}>
                                                {isSameSlot ? 'คิวเดิมของคุณ' : `จองแล้ว ${slot.BookedCount}/${slot.MaxQueue}`}
                                            </div>
                                        </button>
                                    );
                                })}
                            </div>
                        )}
                    </div>

                    {/* Reschedule Reason */}
                    <div>
                        <label className="block text-xs font-bold text-gray-700 mb-1">ระบุเหตุผลการเลื่อนคิว *</label>
                        <textarea
                            placeholder="เช่น ลูกค้าขอเลื่อนเนื่องจากติดธุระด่วน / ปรับเวลานัดใหม่..."
                            value={rescheduleReason}
                            onChange={(e) => setRescheduleReason(e.target.value)}
                            className="w-full border border-gray-300 rounded-lg p-2 text-sm text-gray-900 placeholder-gray-500 h-20 focus:ring-blue-500 focus:border-blue-500"
                            required
                        />
                    </div>

                    {/* Warning: ไมล์อาจเกินระยะเช็ค */}
                    {rescheduleDate && (
                        <MileageWarning
                            lastMileage={booking.LastMileage}
                            targetMileage={booking.Mileage}
                            bookingDate={rescheduleDate}
                        />
                    )}

                    {/* Action buttons */}
                    <div className="flex justify-end gap-3 pt-3 border-t border-gray-100">
                        <Button
                            variant="outline"
                            onClick={onClose}
                            disabled={isSavingReschedule}
                        >
                            ยกเลิก
                        </Button>
                        <Button
                            onClick={handleSaveReschedule}
                            disabled={isSavingReschedule || !rescheduleDate || !rescheduleSlot || !rescheduleReason.trim()}
                            className="bg-blue-600 hover:bg-blue-700 text-white"
                        >
                            {isSavingReschedule ? 'กำลังบันทึก...' : 'บันทึกการเลื่อนคิว'}
                        </Button>
                    </div>
                </div>
            )}
        </Modal>
    );
}
