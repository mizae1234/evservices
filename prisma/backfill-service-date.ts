// Backfill Script: Copy ClaimDate → ServiceDate
// สำหรับ record เดิมที่ยังไม่มีค่า ServiceDate
// รันด้วย: npx ts-node --compiler-options '{"module":"CommonJS"}' prisma/backfill-service-date.ts

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    console.log('🔄 Starting ServiceDate backfill...');

    // ใช้ raw SQL เพื่อ UPDATE เฉพาะ row ที่ ServiceDate เป็น NULL
    // ไม่ยุ่งกับข้อมูลอื่นเด็ดขาด
    const result = await prisma.$executeRawUnsafe(
        `UPDATE CM_DocClaim SET ServiceDate = ClaimDate WHERE ServiceDate IS NULL`
    );

    console.log(`✅ Backfill complete! Updated ${result} records.`);
    console.log('📋 ServiceDate = ClaimDate for all existing records.');
}

main()
    .catch((e) => {
        console.error('❌ Backfill failed:', e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
