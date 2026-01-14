// Reset Master Data Script
// อัพเดตข้อมูล master (ไม่ลบเพราะมี FK constraints)

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function resetMasterData() {
    console.log('🔄 Starting master data update...');

    try {
        // ==========================================
        // 1. Update Service Branches (ใช้ raw SQL)
        // ==========================================
        console.log('Updating service branches...');

        // อัพเดตข้อมูลสาขาใน DB โดยตรง
        await prisma.$executeRaw`
      UPDATE CM_MsServiceBranch SET BranchCode = 'BR001', BranchName = N'สาขามีนบุรี' WHERE BranchID = 1;
    `;
        await prisma.$executeRaw`
      UPDATE CM_MsServiceBranch SET BranchCode = 'BR002', BranchName = N'สาขาพิบูลสงคราม' WHERE BranchID = 2;
    `;
        await prisma.$executeRaw`
      UPDATE CM_MsServiceBranch SET BranchCode = 'BR003', BranchName = N'สาขาเลียบด่วน รามอินทรา' WHERE BranchID = 3;
    `;
        await prisma.$executeRaw`
      UPDATE CM_MsServiceBranch SET BranchCode = 'BR004', BranchName = N'สาขากาญจนาภิเษก' WHERE BranchID = 4;
    `;
        await prisma.$executeRaw`
      UPDATE CM_MsServiceBranch SET BranchCode = 'BR005', BranchName = N'สาขามหาชัย' WHERE BranchID = 5;
    `;
        await prisma.$executeRaw`
      UPDATE CM_MsServiceBranch SET BranchCode = 'BR006', BranchName = N'สาขาศาลายา' WHERE BranchID = 6;
    `;
        await prisma.$executeRaw`
      UPDATE CM_MsServiceBranch SET BranchCode = 'BR007', BranchName = N'สาขาอยุธยา' WHERE BranchID = 7;
    `;
        console.log('  ✓ Updated 7 branches');

        // ==========================================
        // 2. Reset Car Models (ลบแล้ว insert ใหม่)
        // ==========================================
        console.log('Resetting car models...');

        // ลบข้อมูลเดิม
        await prisma.cM_MsCarModel.deleteMany({});
        console.log('  ✓ Deleted existing car models');

        // Insert ข้อมูลรุ่นรถใหม่
        const carModels = [
            { ModelCode: 'YPLUS410PM', ModelName: 'Y plus 410 PM', Brand: 'NETA', IsActive: true },
            { ModelCode: 'YPLUS490', ModelName: 'Y Plus 490', Brand: 'NETA', IsActive: true },
            { ModelCode: 'ES', ModelName: 'Es', Brand: 'NETA', IsActive: true },
        ];

        for (const model of carModels) {
            await prisma.cM_MsCarModel.create({ data: model });
        }
        console.log('  ✓ Created 3 car models');

        console.log('');
        console.log('✅ Master data update completed!');
        console.log('');
        console.log('📋 Data Summary:');
        console.log('   Branches: 7 (มีนบุรี, พิบูลสงคราม, เลียบด่วน รามอินทรา, กาญจนาภิเษก, มหาชัย, ศาลายา, อยุธยา)');
        console.log('   Car Models: 3 (Y plus 410 PM, Y Plus 490, Es)');
    } catch (error) {
        console.error('❌ Error updating master data:', error);
        throw error;
    }
}

resetMasterData()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
