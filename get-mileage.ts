import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function main() {
  const m = await prisma.cM_MsMileage.findMany();
  console.log(m);
}
main().catch(console.error).finally(() => prisma.$disconnect());
