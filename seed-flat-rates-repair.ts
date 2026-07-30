import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  // Get all "เช็คระยะเท่านั้น" (ServiceTypeID=1) flat rates that have CarModelID
  const checkOnlyRates = await prisma.cM_FlatRate.findMany({
    where: {
      ServiceTypeID: 1,
      CarModelID: { not: null },
      IsActive: true,
    },
  });

  console.log(`Found ${checkOnlyRates.length} "เช็คระยะเท่านั้น" rates with CarModelID`);

  let created = 0;
  let updated = 0;

  for (const rate of checkOnlyRates) {
    const newDuration = rate.DurationMinutes + 60; // +1 hour

    // Check if already exists for ServiceTypeID=2
    const existing = await prisma.cM_FlatRate.findFirst({
      where: {
        ServiceTypeID: 2,
        MileageID: rate.MileageID,
        CarModelID: rate.CarModelID,
        IsActive: true,
      },
    });

    if (existing) {
      if (existing.DurationMinutes !== newDuration) {
        await prisma.cM_FlatRate.update({
          where: { FlatRateID: existing.FlatRateID },
          data: { DurationMinutes: newDuration },
        });
        updated++;
      }
      continue;
    }

    const desc = rate.Description ? rate.Description.replace('เช็คระยะ', 'เช็คระยะ+ซ่อม') : null;

    await prisma.cM_FlatRate.create({
      data: {
        ServiceTypeID: 2,
        MileageID: rate.MileageID,
        CarModelID: rate.CarModelID,
        DurationMinutes: newDuration,
        Description: desc,
      },
    });
    created++;
  }

  console.log(`Created: ${created}, Updated: ${updated}`);
  const total = await prisma.cM_FlatRate.count({ where: { IsActive: true } });
  console.log(`Total active flat rates in DB: ${total}`);
}

main().catch(console.error).finally(() => prisma.$disconnect());
