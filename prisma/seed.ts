// Seed script for Car Service Claim Management System
// This script populates the database with initial data for testing

import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting database seed...');

  // ==========================================
  // 1. Create Roles
  // ==========================================
  console.log('Creating roles...');

  const adminRole = await prisma.cM_Role.upsert({
    where: { RoleCode: 'ADMIN' },
    update: {},
    create: {
      RoleName: 'ผู้ดูแลระบบ',
      RoleCode: 'ADMIN',
      Description: 'ผู้ดูแลระบบ สามารถอนุมัติ/ปฏิเสธเคลม และจัดการข้อมูลทั้งหมด',
    },
  });

  const serviceCenterRole = await prisma.cM_Role.upsert({
    where: { RoleCode: 'SERVICE_CENTER' },
    update: {},
    create: {
      RoleName: 'ศูนย์บริการ',
      RoleCode: 'SERVICE_CENTER',
      Description: 'เจ้าหน้าที่ศูนย์บริการ สามารถสร้างและจัดการเคลม',
    },
  });

  // ==========================================
  // 2. Create Service Branches
  // ==========================================
  console.log('Creating service branches...');

  const branches = await Promise.all([
    prisma.cM_MsServiceBranch.upsert({
      where: { BranchCode: 'BR001' },
      update: { BranchName: 'สาขามีนบุรี' },
      create: {
        BranchCode: 'BR001',
        BranchName: 'สาขามีนบุรี',
      },
    }),
    prisma.cM_MsServiceBranch.upsert({
      where: { BranchCode: 'BR002' },
      update: { BranchName: 'สาขาพิบูลสงคราม' },
      create: {
        BranchCode: 'BR002',
        BranchName: 'สาขาพิบูลสงคราม',
      },
    }),
    prisma.cM_MsServiceBranch.upsert({
      where: { BranchCode: 'BR003' },
      update: { BranchName: 'สาขาเลียบด่วน รามอินทรา' },
      create: {
        BranchCode: 'BR003',
        BranchName: 'สาขาเลียบด่วน รามอินทรา',
      },
    }),
    prisma.cM_MsServiceBranch.upsert({
      where: { BranchCode: 'BR004' },
      update: { BranchName: 'สาขากาญจนาภิเษก' },
      create: {
        BranchCode: 'BR004',
        BranchName: 'สาขากาญจนาภิเษก',
      },
    }),
    prisma.cM_MsServiceBranch.upsert({
      where: { BranchCode: 'BR005' },
      update: { BranchName: 'สาขามหาชัย' },
      create: {
        BranchCode: 'BR005',
        BranchName: 'สาขามหาชัย',
      },
    }),
    prisma.cM_MsServiceBranch.upsert({
      where: { BranchCode: 'BR006' },
      update: { BranchName: 'สาขาศาลายา' },
      create: {
        BranchCode: 'BR006',
        BranchName: 'สาขาศาลายา',
      },
    }),
    prisma.cM_MsServiceBranch.upsert({
      where: { BranchCode: 'BR007' },
      update: { BranchName: 'สาขาอยุธยา' },
      create: {
        BranchCode: 'BR007',
        BranchName: 'สาขาอยุธยา',
      },
    }),
  ]);

  // ==========================================
  // 3. Create Car Models
  // ==========================================
  console.log('Creating car models...');

  const carModels = [
    { ModelCode: 'TOY-VIOS', ModelName: 'Vios', Brand: 'Toyota' },
    { ModelCode: 'TOY-COROLLA', ModelName: 'Corolla Altis', Brand: 'Toyota' },
    { ModelCode: 'TOY-CAMRY', ModelName: 'Camry', Brand: 'Toyota' },
    { ModelCode: 'TOY-YARIS', ModelName: 'Yaris', Brand: 'Toyota' },
    { ModelCode: 'HON-CIVIC', ModelName: 'Civic', Brand: 'Honda' },
    { ModelCode: 'HON-ACCORD', ModelName: 'Accord', Brand: 'Honda' },
    { ModelCode: 'HON-CITY', ModelName: 'City', Brand: 'Honda' },
    { ModelCode: 'NIS-ALMERA', ModelName: 'Almera', Brand: 'Nissan' },
    { ModelCode: 'MAZ-3', ModelName: 'Mazda 3', Brand: 'Mazda' },
    { ModelCode: 'MAZ-CX5', ModelName: 'CX-5', Brand: 'Mazda' },
  ];

  for (const model of carModels) {
    await prisma.cM_MsCarModel.upsert({
      where: { ModelCode: model.ModelCode },
      update: {},
      create: model,
    });
  }

  // ==========================================
  // 4. Create Users
  // ==========================================
  console.log('Creating users...');

  const passwordHash = await bcrypt.hash('password123', 10);

  const adminUser = await prisma.cM_User.upsert({
    where: { Email: 'admin@demo.com' },
    update: {},
    create: {
      Email: 'admin@demo.com',
      PasswordHash: passwordHash,
      FullName: 'ผู้ดูแลระบบ',
      Phone: '081-111-1111',
      RoleID: adminRole.RoleID,
      BranchID: null, // Admin ไม่ผูกสาขา
    },
  });

  const serviceUser1 = await prisma.cM_User.upsert({
    where: { Email: 'service1@demo.com' },
    update: { FullName: 'เจ้าหน้าที่ สาขามีนบุรี' },
    create: {
      Email: 'service1@demo.com',
      PasswordHash: passwordHash,
      FullName: 'เจ้าหน้าที่ สาขามีนบุรี',
      Phone: '081-222-2222',
      RoleID: serviceCenterRole.RoleID,
      BranchID: branches[0].BranchID,
    },
  });

  const serviceUser2 = await prisma.cM_User.upsert({
    where: { Email: 'service2@demo.com' },
    update: { FullName: 'เจ้าหน้าที่ สาขาพิบูลสงคราม' },
    create: {
      Email: 'service2@demo.com',
      PasswordHash: passwordHash,
      FullName: 'เจ้าหน้าที่ สาขาพิบูลสงคราม',
      Phone: '081-333-3333',
      RoleID: serviceCenterRole.RoleID,
      BranchID: branches[1].BranchID,
    },
  });

  // ==========================================
  // 5. Create Sample Claims
  // ==========================================
  console.log('Creating sample claims...');

  const claimData = [
    {
      ClaimNo: 'CLM-2026-0001',
      CustomerName: 'นายสมชาย ใจดี',
      CarModel: 'Toyota Vios',
      CarRegister: 'กข1234',
      ClaimDetail: 'เปลี่ยนถ่ายน้ำมันเครื่อง และตรวจเช็คระยะ 10,000 กม.',
      Amount: 2500.00,
      IsCheckMileage: true,
      Mileage: 10000,
      LastMileage: 5000,
      Status: 1, // Pending
      BranchID: branches[0].BranchID,
      CreateBy: serviceUser1.UserID,
    },
    {
      ClaimNo: 'CLM-2026-0002',
      CustomerName: 'นางสาวสุดา สวยงาม',
      CarModel: 'Honda Civic',
      CarRegister: 'ขค5678',
      ClaimDetail: 'เปลี่ยนผ้าเบรกหน้า-หลัง และตรวจเช็คช่วงล่าง',
      Amount: 8500.00,
      IsCheckMileage: false,
      Mileage: 45000,
      LastMileage: 40000,
      Status: 2, // Approved
      BranchID: branches[0].BranchID,
      CreateBy: serviceUser1.UserID,
      ApprovedDate: new Date(),
      ApprovedBy: adminUser.UserID,
      ApprovalNote: 'อนุมัติเรียบร้อย',
    },
    {
      ClaimNo: 'CLM-2026-0003',
      CustomerName: 'นายวิชัย รวยมาก',
      CarModel: 'Mazda CX-5',
      CarRegister: 'ชม9999',
      ClaimDetail: 'ซ่อมระบบแอร์ ไม่เย็น',
      Amount: 15000.00,
      IsCheckMileage: false,
      Mileage: 30000,
      LastMileage: 25000,
      Status: 3, // Rejected
      BranchID: branches[1].BranchID,
      CreateBy: serviceUser2.UserID,
      ApprovalNote: 'เอกสารไม่ครบถ้วน กรุณาแนบใบเสร็จอะไหล่',
    },
    {
      ClaimNo: 'CLM-2026-0004',
      CustomerName: 'นางมาลี ดอกไม้',
      CarModel: 'Toyota Camry',
      CarRegister: 'ฉฉ7777',
      ClaimDetail: 'เปลี่ยนยาง 4 เส้น และตั้งศูนย์ถ่วงล้อ',
      Amount: 22000.00,
      IsCheckMileage: true,
      Mileage: 60000,
      LastMileage: 20000,
      Status: 4, // Need Info
      BranchID: branches[0].BranchID,
      CreateBy: serviceUser1.UserID,
      ApprovalNote: 'กรุณาระบุยี่ห้อยางที่เปลี่ยน',
    },
    {
      ClaimNo: 'CLM-2026-0005',
      CustomerName: 'นายเอกชัย เก่งมาก',
      CarModel: 'Honda Accord',
      CarRegister: 'ฐฐ1111',
      ClaimDetail: 'ตรวจเช็คระยะ 20,000 กม. เปลี่ยนน้ำมันเครื่อง กรองอากาศ',
      Amount: 4500.00,
      IsCheckMileage: true,
      Mileage: 20000,
      LastMileage: 10000,
      Status: 0, // Draft
      BranchID: branches[1].BranchID,
      CreateBy: serviceUser2.UserID,
    },
  ];

  for (const claim of claimData) {
    const existingClaim = await prisma.cM_DocClaim.findUnique({
      where: { ClaimNo: claim.ClaimNo },
    });

    if (!existingClaim) {
      const createdClaim = await prisma.cM_DocClaim.create({
        data: claim,
      });

      // Create initial log
      await prisma.cM_ClaimLog.create({
        data: {
          ClaimID: createdClaim.ClaimID,
          Action: 'CREATED',
          Description: 'สร้างเคลมใหม่',
          OldStatus: null,
          NewStatus: claim.Status,
          ActionBy: claim.CreateBy,
        },
      });
    }
  }

  console.log('✅ Database seed completed successfully!');
  console.log('');
  console.log('📋 Test Accounts:');
  console.log('   Admin: admin@demo.com / password123');
  console.log('   Service Center 1: service1@demo.com / password123');
  console.log('   Service Center 2: service2@demo.com / password123');
}

main()
  .catch((e) => {
    console.error('❌ Error seeding database:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
