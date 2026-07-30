import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function main() {
  const models = await prisma.cM_MsCarModel.findMany();
  console.log('Car Models:', models);
}
main().catch(console.error).finally(() => prisma.$disconnect());
