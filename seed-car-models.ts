import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function main() {
  await prisma.cM_MsCarModel.upsert({
    where: { ModelCode: 'ES-TAXI' },
    update: { ModelName: 'ES (Taxi)', Brand: 'AION' },
    create: { ModelCode: 'ES-TAXI', ModelName: 'ES (Taxi)', Brand: 'AION', IsActive: true }
  });
  await prisma.cM_MsCarModel.upsert({
    where: { ModelCode: 'YPLUS-TAXI' },
    update: { ModelName: 'Y PLUS EXT (Taxi)', Brand: 'AION' },
    create: { ModelCode: 'YPLUS-TAXI', ModelName: 'Y PLUS EXT (Taxi)', Brand: 'AION', IsActive: true }
  });
  console.log('Seeded ES TAXI and Y PLUS EXT (Taxi)');
}
main().catch(console.error).finally(() => prisma.$disconnect());
