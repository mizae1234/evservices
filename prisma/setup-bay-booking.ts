// One-time setup script for Bay Booking system demo data
// Creates: Service Types, Flat Rates, Sample Bays
// SAFE: Only inserts if not already existing (idempotent)

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    console.log('🔧 Setting up Bay Booking demo data...\n');

    // ============================================================
    // 1. Service Types (3 types)
    // ============================================================
    console.log('📋 1. Service Types...');
    const serviceTypes = [
        { Code: 'MILEAGE_CHECK', Name: 'เช็คระยะเท่านั้น', RequiresMileage: true, SortOrder: 1 },
        { Code: 'MILEAGE_PLUS_REPAIR', Name: 'เช็คระยะ + ซ่อม', RequiresMileage: true, SortOrder: 2 },
        { Code: 'GENERAL_REPAIR', Name: 'ซ่อมทั่วไป', RequiresMileage: false, SortOrder: 3 },
    ];

    for (const st of serviceTypes) {
        const existing = await prisma.cM_ServiceType.findFirst({ where: { Code: st.Code } });
        if (existing) {
            console.log(`   ⏭️  ${st.Name} (${st.Code}) — already exists`);
        } else {
            await prisma.cM_ServiceType.create({ data: st });
            console.log(`   ✅ ${st.Name} (${st.Code}) — created`);
        }
    }

    // ============================================================
    // 2. Flat Rates
    // ============================================================
    console.log('\n⏱️  2. Flat Rates...');

    // Get mileage IDs
    const mileages = await prisma.cM_MsMileage.findMany({ 
        where: { IsActive: true },
        orderBy: { Value: 'asc' },
    });
    console.log(`   Found ${mileages.length} mileage entries`);

    // Get service type IDs
    const stMileageCheck = await prisma.cM_ServiceType.findFirst({ where: { Code: 'MILEAGE_CHECK' } });
    const stMileagePlusRepair = await prisma.cM_ServiceType.findFirst({ where: { Code: 'MILEAGE_PLUS_REPAIR' } });
    const stGeneralRepair = await prisma.cM_ServiceType.findFirst({ where: { Code: 'GENERAL_REPAIR' } });

    if (!stMileageCheck || !stMileagePlusRepair || !stGeneralRepair) {
        console.error('   ❌ Service types not found!');
        return;
    }

    // Flat rates for MILEAGE_CHECK: duration varies by mileage
    const mileageCheckDurations: Record<number, number> = {
        5000: 60,    // 1 ชม.
        20000: 90,   // 1.5 ชม.
        30000: 90,   // 1.5 ชม.
        40000: 120,  // 2 ชม.
        50000: 120,  // 2 ชม.
        60000: 150,  // 2.5 ชม.
        70000: 150,  // 2.5 ชม.
        80000: 180,  // 3 ชม.
        90000: 180,  // 3 ชม.
        100000: 210, // 3.5 ชม.
    };

    // Flat rates for MILEAGE_PLUS_REPAIR: base mileage time + 60 min
    const mileagePlusRepairExtra = 60; // +1 ชม. for repair

    for (const mileage of mileages) {
        // MILEAGE_CHECK rates
        const checkDur = mileageCheckDurations[mileage.Value] || 120;
        const existingCheck = await prisma.cM_FlatRate.findFirst({
            where: { ServiceTypeID: stMileageCheck.ServiceTypeID, MileageID: mileage.MileageID },
        });
        if (!existingCheck) {
            await prisma.cM_FlatRate.create({
                data: {
                    ServiceTypeID: stMileageCheck.ServiceTypeID,
                    MileageID: mileage.MileageID,
                    DurationMinutes: checkDur,
                    Description: `เช็คระยะ ${mileage.Label}`,
                },
            });
            console.log(`   ✅ เช็คระยะ ${mileage.Label} → ${checkDur} นาที`);
        } else {
            console.log(`   ⏭️  เช็คระยะ ${mileage.Label} — already exists`);
        }

        // MILEAGE_PLUS_REPAIR rates
        const repairDur = checkDur + mileagePlusRepairExtra;
        const existingRepair = await prisma.cM_FlatRate.findFirst({
            where: { ServiceTypeID: stMileagePlusRepair.ServiceTypeID, MileageID: mileage.MileageID },
        });
        if (!existingRepair) {
            await prisma.cM_FlatRate.create({
                data: {
                    ServiceTypeID: stMileagePlusRepair.ServiceTypeID,
                    MileageID: mileage.MileageID,
                    DurationMinutes: repairDur,
                    Description: `เช็คระยะ + ซ่อม ${mileage.Label}`,
                },
            });
            console.log(`   ✅ เช็คระยะ+ซ่อม ${mileage.Label} → ${repairDur} นาที`);
        } else {
            console.log(`   ⏭️  เช็คระยะ+ซ่อม ${mileage.Label} — already exists`);
        }
    }

    // GENERAL_REPAIR: single flat rate (no mileage required)
    const existingGeneral = await prisma.cM_FlatRate.findFirst({
        where: { ServiceTypeID: stGeneralRepair.ServiceTypeID, MileageID: null },
    });
    if (!existingGeneral) {
        await prisma.cM_FlatRate.create({
            data: {
                ServiceTypeID: stGeneralRepair.ServiceTypeID,
                MileageID: null,
                DurationMinutes: 120,
                Description: 'ซ่อมทั่วไป (ค่าเริ่มต้น)',
            },
        });
        console.log('   ✅ ซ่อมทั่วไป → 120 นาที');
    } else {
        console.log('   ⏭️  ซ่อมทั่วไป — already exists');
    }

    // ============================================================
    // 3. Sample Bays for each active branch
    // ============================================================
    console.log('\n🏗️  3. Service Bays...');

    const branches = await prisma.cM_MsServiceBranch.findMany({
        where: { IsActive: true },
        select: { BranchID: true, BranchName: true },
    });

    for (const branch of branches) {
        const existingBays = await prisma.cM_ServiceBay.count({
            where: { BranchID: branch.BranchID },
        });

        if (existingBays > 0) {
            console.log(`   ⏭️  ${branch.BranchName} — already has ${existingBays} bay(s)`);
            continue;
        }

        // Create 3 bays per branch
        const bayNames = ['Bay 1', 'Bay 2', 'Bay 3'];
        for (let i = 0; i < bayNames.length; i++) {
            await prisma.cM_ServiceBay.create({
                data: {
                    BranchID: branch.BranchID,
                    BayName: bayNames[i],
                    SortOrder: i + 1,
                    IsActive: true,
                },
            });
        }
        console.log(`   ✅ ${branch.BranchName} → ${bayNames.join(', ')}`);
    }

    // ============================================================
    // Summary
    // ============================================================
    const totalST = await prisma.cM_ServiceType.count({ where: { IsActive: true } });
    const totalFR = await prisma.cM_FlatRate.count({ where: { IsActive: true } });
    const totalBays = await prisma.cM_ServiceBay.count({ where: { IsActive: true } });

    console.log('\n' + '='.repeat(50));
    console.log('📊 Summary:');
    console.log(`   Service Types: ${totalST}`);
    console.log(`   Flat Rates:    ${totalFR}`);
    console.log(`   Service Bays:  ${totalBays}`);
    console.log('='.repeat(50));
    console.log('\n✅ Setup complete! ระบบพร้อม demo แล้วครับ');
}

main()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
