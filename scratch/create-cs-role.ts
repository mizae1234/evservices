import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
const prisma = new PrismaClient();

async function main() {
  console.log('Upserting CS Role...');
  
  // 1. Create CS Role in database
  const csRole = await prisma.cM_Role.upsert({
    where: { RoleCode: 'CS' },
    update: {
      RoleName: 'ฝ่ายบริการลูกค้า (CS)',
      Description: 'เจ้าหน้าที่บริการลูกค้าส่วนกลาง จองคิวและดูคิวได้ทุกสาขา'
    },
    create: {
      RoleName: 'ฝ่ายบริการลูกค้า (CS)',
      RoleCode: 'CS',
      Description: 'เจ้าหน้าที่บริการลูกค้าส่วนกลาง จองคิวและดูคิวได้ทุกสาขา'
    }
  });
  
  console.log('CS Role upserted:', JSON.stringify(csRole));

  // 2. Create cs@demo.com user
  const passwordHash = await bcrypt.hash('password123', 10);
  
  const csUser = await prisma.cM_User.upsert({
    where: { Email: 'cs@demo.com' },
    update: {
      FullName: 'ฝ่ายบริการลูกค้า (CS ส่วนกลาง)',
      IsActive: true,
      RoleID: csRole.RoleID,
      BranchID: null // CS ส่วนกลางไม่มีสาขา
    },
    create: {
      Email: 'cs@demo.com',
      PasswordHash: passwordHash,
      FullName: 'ฝ่ายบริการลูกค้า (CS ส่วนกลาง)',
      Phone: '081-333-3333',
      RoleID: csRole.RoleID,
      BranchID: null,
      IsActive: true
    }
  });

  console.log('CS Demo User upserted:', JSON.stringify(csUser));
}

main().catch(console.error);
