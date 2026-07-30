import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

// Map model key -> CarModelID (from DB)
// 11=Y490(Taxi), 12=Y410(Taxi), 13=ES(Taxi), 16=UT, 17=V, 18=HT, 19=M8-PHEV
// 22=ES-RETAIL, 23=Y490-RETAIL, 24=Y410-RETAIL
const MODEL_MAP: Record<string, number[]> = {
  'UT': [16],
  'ES': [22], // ES Retail
  'ES TAXI': [13], // ES Taxi
  'V': [17],
  'Y PLUS': [23, 24], // Y490-RETAIL + Y410-RETAIL (same rates)
  'Y PLUS TAXI': [11, 12], // Y490(Taxi) + Y410(Taxi)
  'HYPTEC HT': [18],
  'M8 PHEV': [19],
};

// Data from flat-rates-data.ts (hours -> will convert to minutes)
const CAR_MODEL_FLAT_RATES: Record<string, Record<number, number>> = {
  'UT': {
    5000: 1, 20000: 1.5, 30000: 1.5, 40000: 3, 50000: 1.5, 60000: 2, 70000: 1.5, 80000: 3, 90000: 1.5, 100000: 1.5,
    110000: 1.5, 120000: 2.5, 130000: 1.5, 140000: 1.5, 150000: 1.5, 160000: 3, 170000: 1.5, 180000: 1.5, 190000: 1.5, 200000: 3
  },
  'ES': {
    5000: 1.5, 20000: 1.5, 30000: 1, 40000: 1.5, 50000: 3, 60000: 1.5, 70000: 3, 80000: 1.5, 90000: 1.5, 100000: 3,
    110000: 1.5, 120000: 1.5, 130000: 1.5, 140000: 3, 150000: 3, 160000: 1.5
  },
  'ES TAXI': {
    5000: 1.5, 30000: 1.5, 60000: 2.5, 90000: 1.5, 120000: 2.5, 150000: 1.5, 180000: 2.5, 210000: 1.5, 240000: 2.5, 270000: 1.5,
    300000: 2.5, 330000: 1.5, 360000: 2.5, 390000: 1.5, 420000: 2.5, 450000: 1.5, 480000: 2.5, 510000: 1.5, 540000: 2.5, 570000: 1.5,
    600000: 2.5, 630000: 1.5, 660000: 2.5
  },
  'V': {
    5000: 1, 10000: 1.5, 20000: 1.5, 30000: 1.5, 40000: 3, 50000: 1.5, 60000: 1.5, 70000: 1.5, 80000: 3, 90000: 1.5,
    100000: 1.5, 110000: 1.5, 120000: 2.5, 130000: 1.5, 140000: 1.5, 150000: 1.5, 160000: 3, 170000: 1.5, 180000: 1.5, 190000: 1.5
  },
  'Y PLUS': {
    5000: 1, 10000: 1.5, 20000: 1.5, 30000: 1.5, 40000: 3, 50000: 1.5, 60000: 1.5, 70000: 1.5, 80000: 3, 90000: 1.5,
    100000: 1.5, 110000: 1.5, 120000: 2.5, 130000: 1.5, 140000: 1.5, 150000: 1.5, 160000: 3
  },
  'Y PLUS TAXI': {
    5000: 1, 40000: 1.5, 80000: 3, 120000: 2.5, 160000: 1.5, 200000: 3, 240000: 1.5, 280000: 2.5, 320000: 1.5, 360000: 3,
    400000: 1.5, 440000: 2.5, 480000: 1.5, 520000: 3, 560000: 1.5, 600000: 3
  },
  'HYPTEC HT': {
    5000: 1, 20000: 1.5, 40000: 2.5, 60000: 2, 80000: 1.5, 100000: 1.5, 120000: 4.5, 140000: 1.5, 160000: 2.5, 180000: 2,
    200000: 1.5, 220000: 1.5, 240000: 5.5, 260000: 1.5, 280000: 2.5, 300000: 2, 320000: 1.5, 340000: 1.5, 360000: 5.5, 380000: 1.5, 400000: 2.5
  },
  'M8 PHEV': {
    5000: 1, 10000: 1, 20000: 1.5, 30000: 1, 40000: 6.5, 50000: 1, 60000: 1, 70000: 1.5, 80000: 2.5, 90000: 1,
    100000: 1, 110000: 1.5, 120000: 10.5, 130000: 1, 140000: 1, 150000: 1.5, 160000: 7, 170000: 1, 180000: 1.5
  }
};

async function main() {
  // Step 1: Collect all unique mileage values
  const allMileageValues = new Set<number>();
  for (const rates of Object.values(CAR_MODEL_FLAT_RATES)) {
    for (const km of Object.keys(rates)) {
      allMileageValues.add(parseInt(km));
    }
  }
  
  // Step 2: Check existing mileages in DB
  const existingMileages = await prisma.cM_MsMileage.findMany();
  const existingMileageValues = new Set(existingMileages.map((m: any) => m.Value));
  
  // Step 3: Create missing mileages
  const missingMileages = [...allMileageValues].filter(v => !existingMileageValues.has(v)).sort((a, b) => a - b);
  console.log(`Missing mileages to create: ${missingMileages.join(', ')}`);
  
  for (const value of missingMileages) {
    const label = `${value.toLocaleString()} กิโลเมตร`;
    const sortOrder = value / 1000; // e.g. 10000 -> 10
    await prisma.cM_MsMileage.create({
      data: {
        Value: value,
        Label: label,
        SortOrder: sortOrder,
        IsActive: true,
      },
    });
    console.log(`  Created mileage: ${label}`);
  }
  
  // Reload mileages to get IDs
  const allMileages = await prisma.cM_MsMileage.findMany();
  const mileageMap: Record<number, number> = {};
  for (const m of allMileages) {
    mileageMap[m.Value] = m.MileageID;
  }
  
  // Step 4: ServiceTypeID = 1 (MILEAGE_CHECK) for all entries
  const SERVICE_TYPE_ID = 1;
  
  // Step 5: Delete existing flat rates that have CarModelID set (clean slate for model-specific rates)
  const deleted = await prisma.cM_FlatRate.deleteMany({
    where: {
      CarModelID: { not: null },
      IsActive: true,
    },
  });
  console.log(`Deleted ${deleted.count} existing model-specific flat rates`);
  
  // Step 6: Create new flat rates for each model
  let created = 0;
  for (const [modelKey, rates] of Object.entries(CAR_MODEL_FLAT_RATES)) {
    const carModelIDs = MODEL_MAP[modelKey];
    if (!carModelIDs) {
      console.log(`  Skipping ${modelKey}: no model mapping`);
      continue;
    }
    
    for (const carModelID of carModelIDs) {
      for (const [kmStr, hours] of Object.entries(rates)) {
        const km = parseInt(kmStr);
        const mileageID = mileageMap[km];
        if (!mileageID) {
          console.log(`  WARNING: No mileageID for ${km} km`);
          continue;
        }
        
        const durationMinutes = Math.round(hours * 60);
        
        // Check if already exists
        const existing = await prisma.cM_FlatRate.findFirst({
          where: {
            ServiceTypeID: SERVICE_TYPE_ID,
            MileageID: mileageID,
            CarModelID: carModelID,
            IsActive: true,
          },
        });
        
        if (existing) {
          // Update if duration changed
          if (existing.DurationMinutes !== durationMinutes) {
            await prisma.cM_FlatRate.update({
              where: { FlatRateID: existing.FlatRateID },
              data: { DurationMinutes: durationMinutes },
            });
            console.log(`  Updated: ${modelKey} (ID:${carModelID}) ${km}km -> ${durationMinutes}min`);
          }
          continue;
        }
        
        await prisma.cM_FlatRate.create({
          data: {
            ServiceTypeID: SERVICE_TYPE_ID,
            MileageID: mileageID,
            CarModelID: carModelID,
            DurationMinutes: durationMinutes,
            Description: `${modelKey} เช็คระยะ ${km.toLocaleString()} กม.`,
          },
        });
        created++;
      }
    }
    console.log(`  Done: ${modelKey} (CarModelIDs: ${carModelIDs.join(',')})`);
  }
  
  console.log(`\nTotal created: ${created} flat rates`);
  
  // Verify
  const total = await prisma.cM_FlatRate.count({ where: { IsActive: true } });
  console.log(`Total active flat rates in DB: ${total}`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
