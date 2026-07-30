import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function main() {
  await prisma.cM_MsCarModel.deleteMany({
    where: { ModelID: { in: [20, 21] } }
  });
  console.log('Deleted 20 and 21');
}
main().catch(console.error).finally(() => prisma.$disconnect());
