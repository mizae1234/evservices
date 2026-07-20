import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const result = await prisma.cM_User.updateMany({
    where: {
      Email: {
        in: ['service1@demo.com', 'service2@demo.com']
      }
    },
    data: {
      IsActive: true
    }
  });
  console.log('Activated demo users count:', result.count);
}

main().catch(console.error);
