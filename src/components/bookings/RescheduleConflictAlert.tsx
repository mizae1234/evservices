'use client';

import React from 'react';
import { AlertTriangle, CheckCircle2, Clock, Wrench } from 'lucide-react';
import { BayConflictResult, BayItem } from '@/lib/bay-booking-utils';

interface RescheduleConflictAlertProps {
    conflictResult: BayConflictResult;
    alternativeSlots: { start: string; end: string }[];
    alternativeBays: BayItem[];
    currentBayName?: string;
    onSelectAlternativeSlot: (start: string) => void;
    onSelectAlternativeBay: (bayId: number) => void;
    isChecking?: boolean;
    hasValidTime?: boolean;
}

export function RescheduleConflictAlert({
    conflictResult,
    alternativeSlots,
    alternativeBays,
    currentBayName,
    onSelectAlternativeSlot,
    onSelectAlternativeBay,
    isChecking = false,
    hasValidTime = true,
}: RescheduleConflictAlertProps) {
    if (!hasValidTime) return null;

    if (isChecking) {
        return (
            <div className="flex items-center gap-2 p-2.5 bg-gray-50 border border-gray-200 rounded-xl text-xs text-gray-500">
                <div className="animate-spin rounded-full h-3.5 w-3.5 border-b-2 border-blue-600"></div>
                <span>กำลังตรวจสอบความพร้อมของช่องซ่อม...</span>
            </div>
        );
    }

    if (conflictResult.hasConflict) {
        return (
            <div className="space-y-3 p-3.5 bg-amber-50/90 border-2 border-amber-300 rounded-xl animate-in fade-in-50 duration-200 shadow-xs">
                {/* Error Banner */}
                <div className="flex items-start gap-2.5">
                    <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                    <div>
                        <p className="text-xs font-bold text-amber-900 leading-tight">
                            {conflictResult.reason || 'ช่วงเวลาที่เลือกไม่สามารถจองได้'}
                        </p>
                        <p className="text-[11px] text-amber-700 mt-0.5">
                            กรุณาเลือกช่วงเวลาว่างอื่น หรือเปลี่ยนไปใช้ช่องซ่อมอื่นที่ว่างด้านล่าง
                        </p>
                    </div>
                </div>

                {/* Recommendation 1: Free slots in CURRENT bay */}
                {alternativeSlots.length > 0 && (
                    <div className="pt-2 border-t border-amber-200/70 space-y-1.5">
                        <p className="text-[11px] font-bold text-gray-800 flex items-center gap-1.5">
                            <Clock className="w-3.5 h-3.5 text-blue-600" />
                            <span>👉 ช่วงเวลาว่างอื่นที่แนะนำ {currentBayName ? `(ในช่อง ${currentBayName})` : ''}:</span>
                        </p>
                        <div className="flex flex-wrap gap-1.5">
                            {alternativeSlots.map(s => (
                                <button
                                    key={s.start}
                                    type="button"
                                    onClick={() => onSelectAlternativeSlot(s.start)}
                                    className="px-2.5 py-1 bg-amber-500 hover:bg-amber-600 active:scale-95 text-white rounded-lg text-xs font-bold transition-all shadow-xs"
                                >
                                    {s.start} - {s.end} น.
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                {/* Recommendation 2: Other FREE BAYS at the SAME time */}
                {alternativeBays.length > 0 && (
                    <div className="pt-2 border-t border-amber-200/70 space-y-1.5">
                        <p className="text-[11px] font-bold text-gray-800 flex items-center gap-1.5">
                            <Wrench className="w-3.5 h-3.5 text-emerald-600" />
                            <span>👉 ช่องซ่อมอื่นที่ว่างในเวลานี้ (สลับช่องซ่อม):</span>
                        </p>
                        <div className="flex flex-wrap gap-1.5">
                            {alternativeBays.map(b => (
                                <button
                                    key={b.BayID}
                                    type="button"
                                    onClick={() => onSelectAlternativeBay(b.BayID)}
                                    className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white rounded-lg text-xs font-bold transition-all shadow-xs"
                                >
                                    ย้ายไป {b.BayName} (ว่าง)
                                </button>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        );
    }

    // No conflict - available!
    return (
        <div className="flex items-center gap-2 p-2.5 bg-emerald-50/80 border border-emerald-300 rounded-xl text-xs font-bold text-emerald-800 animate-in fade-in-50 duration-200">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>ช่วงเวลาและช่องซ่อมนี้ว่าง พร้อมสำหรับการเลื่อนคิว</span>
        </div>
    );
}
