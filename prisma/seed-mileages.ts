// Seed script for mileage options
// Run: npx ts-node prisma/seed-mileages.ts

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const mileageData = [
    { Value: 5000, Label: '5,000 กิโลเมตร', SortOrder: 1 },
    { Value: 20000, Label: '20,000 กิโลเมตร', SortOrder: 2 },
    { Value: 30000, Label: '30,000 กิโลเมตร', SortOrder: 3 },
    { Value: 40000, Label: '40,000 กิโลเมตร', SortOrder: 4 },
    { Value: 50000, Label: '50,000 กิโลเมตร', SortOrder: 5 },
    { Value: 60000, Label: '60,000 กิโลเมตร', SortOrder: 6 },
    { Value: 70000, Label: '70,000 กิโลเมตร', SortOrder: 7 },
    { Value: 80000, Label: '80,000 กิโลเมตร', SortOrder: 8 },
    { Value: 90000, Label: '90,000 กิโลเมตร', SortOrder: 9 },
    { Value: 100000, Label: '100,000 กิโลเมตร', SortOrder: 10 },
];

async function main() {
    console.log('Seeding mileage options...');

    for (const mileage of mileageData) {
        const existing = await prisma.cM_MsMileage.findFirst({
            where: { Value: mileage.Value },
        });

        if (!existing) {
            await prisma.cM_MsMileage.create({
                data: mileage,
            });
            console.log(`Created: ${mileage.Label}`);
        } else {
            // Update existing record
            await prisma.cM_MsMileage.update({
                where: { MileageID: existing.MileageID },
                data: { Label: mileage.Label, SortOrder: mileage.SortOrder, IsActive: true },
            });
            console.log(`Updated: ${mileage.Label}`);
        }
    }

    console.log('Seeding completed!');
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
