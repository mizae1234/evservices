# EV Services Management Platform
**Project Architecture and System Structure Documentation**
**Version:** 1.0

โปรเจกต์นี้คือระบบจัดการการเคลมรถยนต์ EV (**EV Services Management Platform**) ซึ่งพัฒนาด้วยสถาปัตยกรรมแบบ Full-stack บนชอง Next.js App Router 

## 1. Technology Stack
- **Framework:** Next.js 14/15 (App Router)
- **Database ORM:** Prisma
- **Database Engine:** Microsoft SQL Server (`sqlserver`)
- **Authentication:** NextAuth.js
- **Styling:** Tailwind CSS (พร้อมการตั้งค่าผ่าน `postcss.config.mjs`)
- **Storage:** S3 (DigitalOcean Spaces รันผ่าน `src/lib/s3.ts`)
- **Deployment:** Docker & Nginx (`Dockerfile`, `docker-compose.yml`, `nginx.conf`)

---

## 2. Project Structure (โครงสร้างโปรเจกต์)
โครงสร้างโปรเจกต์จัดวางตามมาตรฐาน Next.js App Router:

```text
evservices/
├── prisma/
│   ├── schema.prisma      # โครงสร้างฐานข้อมูล (Models & Relations)
│   └── seed*.ts           # สคริปต์จำลองข้อมูล Master Data เริ่มต้น
├── src/
│   ├── app/               # Routing, Pages, Backend APIs
│   │   ├── admin/         # หน้าจอผู้ดูแลระบบ (Admin Panel)
│   │   ├── api/           # Backend REST API Routes
│   │   ├── auth/          # หน้าจอลงชื่อเข้าใช้ระบบ (Login)
│   │   ├── profile/       # หน้าจอจัดการข้อมูลส่วนตัวของผู้ใช้งาน
│   │   └── service-center/# หน้าจอศูนย์บริการ (Service Center Portal)
│   ├── components/        # Reusable UI & Layout Components
│   ├── lib/               # Core Utilities & configurations (auth, prisma, s3)
│   ├── middleware.ts      # Route Protection & Role-based Access Control
│   └── types/             # TypeScript definitions
├── Dockerfile             # การตั้งค่าสำหรับ Container Deployment
├── docker-compose.yml     # การจัดการ Services (DB, App)
└── nginx.conf             # การตั้งค่า Reverse Proxy
```

---

## 3. Database Schema Overview (โครงสร้างฐานข้อมูล)
ระบบมีการจัดเก็บข้อมูลออกเป็น 2 ส่วนหลักๆ (อ้างอิงจาก `schema.prisma`):

### 3.1 Master Data (ข้อมูลพื้นฐาน)
- `CM_Role`: ระดับสิทธิ์ของผู้ใช้ (เช่น Admin, Service Center)
- `CM_User`: ข้อมูลผู้ใช้ระบบ ซิงก์กับ Role และ Branch
- `CM_MsServiceBranch`: ข้อมูลสาขาศูนย์บริการ
- `CM_MsCarModel`: ข้อมูลยี่ห้อและรุ่นรถ EV
- `CM_MsMileage`: ข้อมูลระยะทาง (เช่น 5,000 กม., 20,000 กม.)

### 3.2 Claim Management (เอกสารการเคลม)
- `CM_DocClaim`: ข้อมูลหลักของใบรับเคลม รวมถึงเลขตัวถัง, ข้อมูลการเช็คระยะรถลูกค้า, และ สถานะเอกสาร (Draft, Pending, Approved, Rejected)
- `CM_ClaimFile`: จัดเก็บการเชื่อมโยงของไฟล์แนบเอกสารเคลมที่อัปโหลดไปเก็บบน S3
- `CM_ClaimLog`: เก็บประวัติการเปลี่ยนแปลงสถานะ (Audit Trail) ว่าใครเป็นผู้อนุมัติ แอดมินจัดการ หรือแก้ไขเอกสารเมื่อใด

---

## 4. โครงสร้าง Backend API (`src/app/api`)
ระบบมี API แยกตามฟีเจอร์การทำงานของโมดูลต่างๆ ดังนี้:

### กลุ่มการจัดการเคลมและข้อมูลสรุป
- **`/api/claims`**: ให้บริการ GET (รายการเคลมทั้งหมด) และ POST (สร้างเคลมใหม่)
  - `/[id]`: ดูรายละเอียด, แก้ไข, เปลี่ยนสถานะ, หรือลบเอกสาร
  - `/[id]/approve`: ฟังก์ชันเฉพาะระบบ Approval Workflow ให้ Admin กดอนุมัติ/ปฏิเสธ
  - `/files`: จัดการไฟล์แนบ (เช่น ดึงไฟล์ ลบไฟล์)
- **`/api/dashboard`**: ดึงข้อมูลสรุปยอดรวม (Metric Aggregation) ไปแสดงเป็นกราฟและสถิติให้หน้าหลัก
- **`/api/upload`**: รับไฟล์จากฟรอนต์เอนด์ อัปโหลดผ่าน S3 API (`src/lib/s3.ts`) และส่ง URL Path กลับไปทำรายการ

### กลุ่ม Master Data และ Users
- **`/api/auth`**: จัดการเรื่องรหัสผ่านต่างๆ (NextAuth ใช้เป็น Middleware หลักอยู่แล้ว)
- **`/api/vehicles`**: ระบบ Verify หมายเลขตัวถังรถยนต์ (Car Register / VIN Number) อาจใช้ตรวจสอบข้อมูลรถกับ Inventory
- **`/api/users`**: ฟังก์ชัน Admin ในการมองเห็นและจัดการผู้ใช้งานในระบบ
- **`/api/branches`, `/api/car-models`, `/api/mileages`, `/api/roles`**: APIs สำหรับจัดการ Master Data เตรียมข้อมูลพื้นฐานให้ระบบ

---

## 5. 핵심ข้อควรระวังหรือแนวปฏิบัติของโปรเจกต์นี้
1. **API Route First Architecture**: ควบคุมและใช้งานฐานข้อมูลผ่าน API Routes เป็นหลัก 
2. **Audit & Safety**: ทุกรายการเปลี่ยนสถานะจะต้องมีการบันทึกลง `CM_ClaimLog` เสมอ เพื่อการสืบย้อนหลังที่โปร่งใส
3. **Role-based Authentication**: ทุก API และ Page ต้องตรวจสอบ Role ของผู้ใช้งาน (`middleware.ts` และ Server Session Checker) ว่ามีสิทธิ์เข้าถึงหรือปรับแก้ข้อมูลที่ระดับ Admin หรือระดับ Branch Center
4. **File Handling**: ทุกการแนบไฟล์ถูกยกการจัดการความจุและ Bandwidth ไปที่ S3 (DigitalOcean Spaces) ทันที เพื่อไม่ให้กระทบพื้นที่เซิร์ฟเวอร์หลัก

---

## 6. Implementation Notes & Patterns (รูปแบบและแนวทางการเขียนโค้ดเพิ่มเติม)
1. **Turnaround Time (TAT) Tracking**:
   - คำนวณเวลาการดำเนินงานของแต่ละเคลมโดยวัดระยะห่างระหว่าง Action `SUBMITTED` และ `APPROVED` 
   - รองรับ Fallback หากกรณีเอกสาร Seed Data หรือ Legacy Data ไม่มี Log `SUBMITTED` ให้ทำการดึง `ClaimDate` มาแทนที่ เพื่อป้องกันตัวแปรกลายเป็น `null` หรือใบงานสูญหายจากการนับสถิติรวมของระบบ
2. **Handling SQL Server 2100 Parameters Limit with Prisma**:
   - เมื่อสร้าง Data Query (หน้า Admin Reports) ที่มีช่วงเวลาครอบคลุมกว้างขวาง (ระดับ 2,000+ Records) และสั่ง Prisma ให้ประสาน (`include`) Relation อื่นขึ้นมาด้วย (เช่น `Logs`, `Branch`)
   - **ปัญหา**: MS SQL Server รองรับพารามิเตอร์สูงสุดแค่ 2,100 ตัวต่อคำสั่ง SQL เมื่อ Prisma ดึง Parent IDs มาทำแบบ `IN (?, ?, ...)` จึงทำให้ระบบพังลงด้วย HTTP 500 (`PrismaClientUnknownRequestError: 8003`)
   - **วิธีแก้**: นำเทคนิค **Data Chunking** เข้ามาใช้ (ทำ `take` และ `skip` ใน `while` loop จำนวนละไม่เกิน 500-1000 items) ก่อนนำข้อมูลเชื่อมต่อกันใน Memory (`claims = claims.concat(batch)`)
3. **Client-Side Data Pagination**:
   - สำหรับหน้ารายงานตัวเลขสถิติที่จำเป็นต้องประมวลผลหรือหาค่าเฉลี่ยแบบรวมยอดจาก Base Data หลายพันรายการ (เช่น TAT Average) ระบบเลือกจะดึงข้อมูล Array ก้อนใหญ่มาครั้งเดียว
   - ฟรอนต์เอนด์สร้าง Paginated State ปลอม (`slice( (page-1)*limit, page*limit )`) และมีฟังก์ชันจัดเลขหน้าคลิกดู 5 ลำดับ เพื่อลดภาระการ Render DOM ให้เบาและเสถียรที่สุด โดยไม่ต้องทำ Server-Side Query ใหม่ในทุกๆ ครั้งที่คลิกหน้าถัดไป
