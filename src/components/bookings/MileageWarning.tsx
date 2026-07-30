'use client';

import React from 'react';

// ==========================================
// Utility: Mileage Exceed Check
// ==========================================

const DEFAULT_AVG_DAILY_KM = 400;

export interface MileageCheckResult {
    willExceed: boolean;
    daysUntil: number;
    estimated: number;
    kmRemaining: number;
    targetMileage: number;
    lastMileage: number;
}

/**
 * คำนวณว่าไมล์สะสมจะเกินระยะเช็คหรือไม่ ณ วันที่จอง
 * ใช้ค่าเฉลี่ยวิ่ง 400 กม./วัน
 *
 * @returns null ถ้าข้อมูลไม่เพียงพอ (ไม่มี mileage / lastMileage / date)
 */
export function checkMileageExceed(params: {
    lastMileage: number;
    targetMileage: number;
    bookingDate: string; // YYYY-MM-DD
    avgDailyKm?: number;
}): MileageCheckResult | null {
    const { lastMileage, targetMileage, bookingDate, avgDailyKm = DEFAULT_AVG_DAILY_KM } = params;

    if (!lastMileage || lastMileage <= 0) return null;
    if (!targetMileage || targetMileage <= 0) return null;
    if (!bookingDate) return null;

    const kmRemaining = targetMileage - lastMileage;
    if (kmRemaining <= 0) return null;

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const target = new Date(bookingDate);
    target.setHours(0, 0, 0, 0);

    const daysUntil = Math.max(0, Math.ceil((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)));
    const estimated = lastMileage + (daysUntil * avgDailyKm);

    return {
        willExceed: estimated > targetMileage,
        daysUntil,
        estimated,
        kmRemaining,
        targetMileage,
        lastMileage,
    };
}

// ==========================================
// React Component: MileageWarning
// ==========================================

interface MileageWarningProps {
    lastMileage: number;
    targetMileage: number;
    bookingDate: string;
    /** แสดงรายละเอียดเพิ่มเติม (ไมล์ปัจจุบัน → ระยะเช็ค) */
    showDetail?: boolean;
}

/**
 * แสดง amber warning box เมื่อไมล์สะสมโดยประมาณจะเกินระยะเช็ค ณ วันจอง
 * ถ้าไม่เกิน หรือข้อมูลไม่ครบ → return null (ไม่แสดงอะไร)
 */
export function MileageWarning({ lastMileage, targetMileage, bookingDate, showDetail = false }: MileageWarningProps) {
    const result = checkMileageExceed({ lastMileage, targetMileage, bookingDate });

    if (!result || !result.willExceed) return null;

    return (
        <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg flex items-start gap-2">
            <span className="text-amber-500 text-sm">⚠️</span>
            <div>
                <p className="text-xs font-bold text-amber-900">
                    คำเตือน: ระยะไมล์อาจเกินกำหนด ณ วันที่นัดหมาย
                </p>
                {showDetail && (
                    <p className="text-xs text-amber-800 mt-0.5 leading-relaxed">
                        ไมล์ปัจจุบัน <strong>{result.lastMileage.toLocaleString()}</strong> กม. → ระยะเช็ค <strong>{result.targetMileage.toLocaleString()}</strong> กม.
                        (เหลืออีก <strong>{result.kmRemaining.toLocaleString()}</strong> กม.)
                    </p>
                )}
                <p className="text-xs text-amber-800 mt-0.5 leading-relaxed">
                    เฉลี่ยวิ่งวันละ 400 กม. อีก <strong>{result.daysUntil}</strong> วัน
                    ไมล์โดยประมาณวันนัดจะอยู่ที่ <strong>~{result.estimated.toLocaleString()}</strong> กม.
                </p>
            </div>
        </div>
    );
}
