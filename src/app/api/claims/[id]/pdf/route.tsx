// Approval Document PDF API
// Generates PDF document for approved claims

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { CLAIM_STATUS } from '@/types';
import { Document, Page, Text, View, StyleSheet, Image, Font, renderToBuffer } from '@react-pdf/renderer';

// Register Thai font - using Noto Sans Thai
Font.register({
    family: 'NotoSansThai',
    src: 'https://cdn.jsdelivr.net/fontsource/fonts/noto-sans-thai@latest/thai-400-normal.ttf',
});

const styles = StyleSheet.create({
    page: {
        padding: 40,
        fontFamily: 'NotoSansThai',
        fontSize: 14,
        color: '#000',
    },
    header: {
        flexDirection: 'row',
        marginBottom: 20,
    },
    logo: {
        width: 80,
        height: 30,
    },
    companyInfo: {
        marginLeft: 15,
        flex: 1,
    },
    companyName: {
        fontSize: 14,
        fontWeight: 'bold',
        color: '#000',
    },
    companyAddress: {
        fontSize: 10,
        color: '#666',
        marginTop: 2,
    },
    dateSection: {
        textAlign: 'right',
        marginBottom: 20,
        color: '#000',
    },
    addressSection: {
        marginBottom: 20,
    },
    label: {
        fontSize: 11,
        color: '#000',
    },
    labelMarginTop: {
        fontSize: 11,
        color: '#000',
        marginTop: 5,
    },
    bodyText: {
        fontSize: 11,
        lineHeight: 1.6,
        marginBottom: 15,
        textIndent: 40,
        color: '#000',
    },
    section: {
        marginBottom: 15,
        paddingLeft: 10,
        borderLeftWidth: 3,
        borderLeftColor: '#3b82f6',
    },
    sectionTitle: {
        fontSize: 12,
        fontWeight: 'bold',
        marginBottom: 8,
        color: '#000',
    },
    checkboxRow: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        marginBottom: 10,
    },
    checkboxItem: {
        flexDirection: 'row',
        alignItems: 'center',
        marginRight: 15,
        marginBottom: 5,
        color: '#000',
    },
    checkbox: {
        width: 14,
        height: 14,
        borderWidth: 1,
        borderColor: '#333',
        marginRight: 5,
        justifyContent: 'center',
        alignItems: 'center',
    },
    checked: {
        backgroundColor: '#3b82f6',
        borderColor: '#3b82f6',
    },
    checkmark: {
        color: 'white',
        fontSize: 10,
    },
    repairBox: {
        borderWidth: 1,
        borderColor: '#ccc',
        minHeight: 60,
        padding: 10,
        marginBottom: 15,
        color: '#000',
    },
    noteBox: {
        backgroundColor: '#fef9c3',
        padding: 10,
        marginBottom: 20,
    },
    noteText: {
        fontSize: 10,
        color: '#854d0e',
    },
    closing: {
        marginTop: 20,
        textIndent: 40,
        color: '#000',
    },
    signature: {
        marginTop: 40,
        textAlign: 'right',
    },
    signatureLabel: {
        fontSize: 11,
        color: '#000',
    },
    signatureName: {
        fontSize: 11,
        marginTop: 30,
        color: '#000',
    },
});

interface RouteParams {
    params: Promise<{ id: string }>;
}

// Checkbox component
const Checkbox = ({ checked, label }: { checked: boolean; label: string }) => (
    <View style={styles.checkboxItem}>
        <View style={[styles.checkbox, checked ? styles.checked : {}]}>
            {checked && <Text style={styles.checkmark}>✓</Text>}
        </View>
        <Text>{label}</Text>
    </View>
);

// GET /api/claims/[id]/pdf - Generate approval PDF
export async function GET(request: NextRequest, { params }: RouteParams) {
    try {
        const session = await getServerSession(authOptions);

        if (!session?.user) {
            return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
        }

        const { id } = await params;
        const claimId = parseInt(id);

        const claim = await prisma.cM_DocClaim.findUnique({
            where: { ClaimID: claimId, IsActive: true },
            include: {
                Branch: true,
                Creator: { select: { FullName: true } },
            },
        });

        // Get approver name
        let approverName = 'ผู้ดูแลระบบ';
        if (claim?.ApprovedBy) {
            const approver = await prisma.cM_User.findUnique({
                where: { UserID: claim.ApprovedBy },
                select: { FullName: true },
            });
            if (approver) {
                approverName = approver.FullName;
            }
        }

        if (!claim) {
            return NextResponse.json({ success: false, error: 'ไม่พบใบงาน' }, { status: 404 });
        }

        // Check if approved
        if (claim.Status !== CLAIM_STATUS.APPROVED) {
            return NextResponse.json(
                { success: false, error: 'ใบงานยังไม่ได้รับการอนุมัติ' },
                { status: 400 }
            );
        }

        // Format date
        const approvedDate = claim.ApprovedDate || claim.UpdateDate;
        const formattedDate = new Date(approvedDate).toLocaleDateString('th-TH', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
        });

        // Determine mileage checkbox - ดึงจาก database
        const mileageValue = claim.Mileage || 0;
        const mileageOptionsFromDb = await prisma.cM_MsMileage.findMany({
            where: { IsActive: true },
            orderBy: { SortOrder: 'asc' },
            select: { Value: true, Label: true },
        });

        const standardMileages = mileageOptionsFromDb.map(m => m.Value);
        const isOther = mileageValue > 0 && !standardMileages.includes(mileageValue);

        const branchName = claim.Branch?.BranchName || '';
        const carModel = claim.CarModel || '';
        const carRegister = claim.CarRegister || '';
        const vinNo = claim.VinNo || '';
        const lastMileage = claim.LastMileage?.toLocaleString() || '0';
        const claimDetail = claim.ClaimDetail || '-';

        // Create PDF document
        const ApprovalDocument = () => (
            <Document>
                <Page size="A4" style={styles.page}>
                    <View style={styles.header}>
                        <Image
                            style={styles.logo}
                            src="https://space-after-sales-prod.sgp1.digitaloceanspaces.com/ev7-logo.png"
                        />
                        <View style={styles.companyInfo}>
                            <Text style={styles.companyName}>EV7 Co., Ltd.</Text>
                            <Text style={styles.companyAddress}>
                                1023 MS Siam Tower 15 FL, Rama 3 Rd. Chongnonsi, Yannawa, Bangkok 10120
                            </Text>
                            <Text style={styles.companyAddress}>Tel. 02-295-5167-8</Text>
                        </View>
                    </View>

                    <View style={styles.dateSection}>
                        <Text>วันที่: {formattedDate}</Text>
                    </View>

                    <View style={styles.addressSection}>
                        <Text style={styles.label}>เรียน: ผู้จัดการศูนย์ AION {branchName}</Text>
                        <Text style={styles.labelMarginTop}>เรื่อง: ขอส่งรถนั่งเข้าซ่อม รับบริการ</Text>
                    </View>

                    <Text style={styles.bodyText}>
                        บริษัท อีวีเซเว่น จำกัด ขอส่งรถยนต์ยี่ห้อ AION รุ่น {carModel} ทะเบียน {carRegister} {vinNo ? `VIN: ${vinNo}` : ''} เลขกิโลเมตร {lastMileage} KM. โดยมอบหมายให้ EV7 เข้ารับบริการในวันที่ {formattedDate} ตามรายการต่อไปนี้
                    </Text>

                    {claim.IsCheckMileage && (
                        <View style={styles.section}>
                            <Text style={styles.sectionTitle}>1. เช็คระยะ</Text>
                            <View style={styles.checkboxRow}>
                                {mileageOptionsFromDb.map((opt) => (
                                    <Checkbox key={opt.Value} checked={mileageValue === opt.Value} label={opt.Label} />
                                ))}
                                <Checkbox checked={isOther} label={isOther ? `อื่นๆ (${mileageValue.toLocaleString()} กม.)` : 'อื่นๆ'} />
                            </View>
                        </View>
                    )}

                    <View style={styles.section}>
                        <Text style={styles.sectionTitle}>2. รายการซ่อม (โปรดระบุ)</Text>
                        <View style={styles.repairBox}>
                            <Text>{claimDetail}</Text>
                        </View>
                    </View>

                    <View style={styles.noteBox}>
                        <Text style={styles.noteText}>
                            *หมายเหตุ* หากมีรายการซ่อมเพิ่มเติม หรือนอกเหนือจากรายการข้างต้น ขอความกรุณาแจ้งกลับมายังบริษัทฯ ที่ (ชื่อหรือแผนก หมายเลขติดต่อ) เพื่ออนุมัติซ่อมเพิ่มเติม และทางบริษัทฯ จะได้ทำการจัดส่งใบสั่งซ่อมฉบับแก้ไขให้ต่อไป.
                        </Text>

                    </View>

                    <Text style={styles.closing}>จึงเรียนมาเพื่อโปรดดำเนินการต่อไป </Text>

                    <View style={styles.signature}>
                        <Text style={styles.signatureLabel}>ขอแสดงความนับถือ</Text>
                        <Text style={styles.signatureName}>( {approverName} )</Text>
                    </View>
                </Page>
            </Document>
        );

        // Generate PDF buffer
        const pdfBuffer = await renderToBuffer(<ApprovalDocument />);

        // Return PDF
        return new NextResponse(new Uint8Array(pdfBuffer), {
            headers: {
                'Content-Type': 'application/pdf',
                'Content-Disposition': `attachment; filename="approval-${claim.ClaimNo}.pdf"`,
            },
        });
    } catch (error) {
        console.error('Error generating PDF:', error);
        return NextResponse.json(
            { success: false, error: 'Failed to generate PDF' },
            { status: 500 }
        );
    }
}
