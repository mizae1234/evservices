import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const users = await prisma.cM_User.findMany({
    select: {
      Email: true,
      FullName: true,
      IsActive: true,
      Role: { select: { RoleCode: true } }
    }
  });
  console.log('All Users status:', JSON.stringify(users, null, 2));
}

main().catch(console.error);
