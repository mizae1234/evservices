import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function main() {
  await prisma.cM_MsCarModel.upsert({
    where: { ModelCode: 'ES-RETAIL' },
    update: { ModelName: 'ES (Retail)', Brand: 'AION' },
    create: { ModelCode: 'ES-RETAIL', ModelName: 'ES (Retail)', Brand: 'AION', IsActive: true }
  });
  await prisma.cM_MsCarModel.upsert({
    where: { ModelCode: 'Y490-RETAIL' },
    update: { ModelName: 'Y Plus 490 Premium (Retail)', Brand: 'AION' },
    create: { ModelCode: 'Y490-RETAIL', ModelName: 'Y Plus 490 Premium (Retail)', Brand: 'AION', IsActive: true }
  });
  await prisma.cM_MsCarModel.upsert({
    where: { ModelCode: 'Y410-RETAIL' },
    update: { ModelName: 'Y Plus 410 Premium (Retail)', Brand: 'AION' },
    create: { ModelCode: 'Y410-RETAIL', ModelName: 'Y Plus 410 Premium (Retail)', Brand: 'AION', IsActive: true }
  });
  console.log('Seeded Retail ES and Y Plus models');
}
main().catch(console.error).finally(() => prisma.$disconnect());
