// Add missing branches script
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function addMissingBranches() {
    console.log('Adding missing branches...');

    const newBranches = [
        { BranchCode: 'BR004', BranchName: 'สาขากาญจนาภิเษก' },
        { BranchCode: 'BR005', BranchName: 'สาขามหาชัย' },
        { BranchCode: 'BR006', BranchName: 'สาขาศาลายา' },
        { BranchCode: 'BR007', BranchName: 'สาขาอยุธยา' },
    ];

    for (const branch of newBranches) {
        const exists = await prisma.cM_MsServiceBranch.findFirst({
            where: { BranchCode: branch.BranchCode }
        });
        if (!exists) {
            await prisma.cM_MsServiceBranch.create({ data: branch });
            console.log('Created:', branch.BranchName);
        } else {
            console.log('Already exists:', branch.BranchName);
        }
    }

    // Show all branches
    const branches = await prisma.cM_MsServiceBranch.findMany({
        orderBy: { BranchID: 'asc' }
    });
    console.log('\nTotal branches:', branches.length);
    branches.forEach((b) => {
        console.log(b.BranchID, b.BranchCode, b.BranchName);
    });
}

addMissingBranches()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
