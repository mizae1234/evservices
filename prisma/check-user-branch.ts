
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function checkUser() {
    const email = 'service2@demo.com';
    const user = await prisma.cM_User.findUnique({
        where: { Email: email },
        include: { Branch: true, Role: true }
    });

    console.log('User:', email);
    if (!user) {
        console.log('Not found');
    } else {
        console.log('Role:', user.Role.RoleCode);
        console.log('BranchID:', user.BranchID);
        console.log('BranchName:', user.Branch?.BranchName);
    }
}

checkUser()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
