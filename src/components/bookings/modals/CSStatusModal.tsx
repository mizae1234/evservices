import { useState, useEffect } from 'react';
import { Modal, Button, Select } from '@/components/ui';

interface Booking {
    BookingID: number;
    BookingNo: string;
    CustomerName: string;
    CustomerPhone: string | null;
}

interface CSStatusModalProps {
    isOpen: boolean;
    onClose: () => void;
    booking: Booking | null;
    onSave: (bookingId: number, status: string, note: string) => Promise<void>;
}

export function CSStatusModal({ isOpen, onClose, booking, onSave }: CSStatusModalProps) {
    const [csNewStatus, setCsNewStatus] = useState('FOLLOW_UP');
    const [csNote, setCsNote] = useState('');
    const [isUpdatingCS, setIsUpdatingCS] = useState(false);

    // Reset state when modal opens with a new booking
    useEffect(() => {
        if (isOpen) {
            setCsNewStatus('FOLLOW_UP');
            setCsNote('');
        }
    }, [isOpen, booking]);

    const handleSubmit = async () => {
        if (!booking) return;
        setIsUpdatingCS(true);
        try {
            await onSave(booking.BookingID, csNewStatus, csNote);
            onClose();
        } catch (error) {
            console.error('Failed to update CS status:', error);
        } finally {
            setIsUpdatingCS(false);
        }
    };

    return (
        <Modal isOpen={isOpen} onClose={() => !isUpdatingCS && onClose()} title="อัปเดตสถานะการติดต่อลูกค้า (CS)">
            {booking && (
                <div className="space-y-4 pt-4">
                    <div className="bg-blue-50 p-3 rounded-lg text-sm border border-blue-100 text-blue-900">
                        <strong>เลขจอง:</strong> {booking.BookingNo} <br />
                        <strong>ลูกค้า:</strong> {booking.CustomerName} ({booking.CustomerPhone || 'ไม่มีเบอร์'})
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">สถานะการติดต่อ (CS)</label>
                        <Select
                            value={csNewStatus}
                            onChange={(e) => setCsNewStatus(e.target.value)}
                            className="w-full"
                            options={[
                                { value: 'FOLLOW_UP', label: 'รอดำเนินการ / ติดตามผล (Follow up)' },
                                { value: 'CONFIRMED', label: 'ลูกค้ายืนยันแล้ว (Confirmed)' },
                                { value: 'NO_ANSWER', label: 'ติดต่อไม่ได้ / โทรไม่รับสาย (No Answer)' }
                            ]}
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">บันทึกเพิ่มเติม (Note)</label>
                        <textarea
                            value={csNote}
                            onChange={(e) => setCsNote(e.target.value)}
                            rows={3}
                            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm text-gray-900 placeholder:text-gray-400"
                            placeholder="เช่น โทรไปไม่รับสาย จะโทรใหม่ตอนบ่าย..."
                        ></textarea>
                    </div>

                    <div className="flex justify-end gap-3 mt-6">
                        <Button variant="outline" onClick={onClose} disabled={isUpdatingCS}>
                            ยกเลิก
                        </Button>
                        <Button className="bg-orange-500 hover:bg-orange-600 text-white" onClick={handleSubmit} disabled={isUpdatingCS}>
                            {isUpdatingCS ? 'กำลังบันทึก...' : 'บันทึกสถานะ'}
                        </Button>
                    </div>
                </div>
            )}
        </Modal>
    );
}
