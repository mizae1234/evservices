# LINE OA Notification — คู่มือติดตั้งและใช้งาน

ระบบแจ้งเตือนความเคลื่อนไหวของ **คิวจอง (Booking)** ผ่าน LINE Official Account
โดยผู้ใช้ยืนยันตัวตนด้วย **Email/Password เดียวกับที่ใช้เข้าระบบ** แล้วระบบจะ map LINE userId เข้ากับ `CM_User`

---

## 1. ขั้นตอนติดตั้ง

### 1.1 สร้าง Channel บน LINE Developers
1. เข้า https://developers.line.biz/console/ → สร้าง Provider (ถ้ายังไม่มี)
2. สร้าง Channel แบบ **Messaging API**
3. เก็บค่า 2 ตัวนี้
   - **Channel secret** (แท็บ Basic settings)
   - **Channel access token (long-lived)** (แท็บ Messaging API → กด Issue)
4. ที่แท็บ Messaging API ตั้งค่า
   - **Webhook URL** = `https://<โดเมนระบบ>/api/line/webhook`
   - **Use webhook** = เปิด
   - **Auto-reply messages / Greeting messages** = ปิด (ระบบตอบเองทั้งหมด)

### 1.2 สร้าง LIFF app (แนะนำ — ป้องกันการผูกบัญชีผิดคน)

1. ใน **provider เดียวกัน** กับ Messaging API channel → สร้าง Channel แบบ **LINE Login**
   > ⚠️ **ต้องอยู่ใน provider เดียวกันเท่านั้น** ถ้าคนละ provider ผู้ใช้คนเดียวกันจะได้ userId คนละค่า
   > ระบบจะผูกบัญชีสำเร็จแต่ส่งข้อความไม่ถึง และหาสาเหตุยากมาก
2. แท็บ **LIFF** → Add → ตั้งค่า
   - **Endpoint URL** = `https://<โดเมนระบบ>/line/link`
   - **Size** = Tall (หรือ Full)
   - **Scopes** = ต้องติ๊ก **`profile`** และ **`openid`** — ถ้าไม่มี `openid` จะไม่ได้ ID token
3. เก็บ **LIFF ID** (รูปแบบ `1234567890-abcdefgh`) และ **Channel ID** ของ LINE Login channel

### 1.3 ตั้งค่า Environment Variables
เพิ่มใน `.env` (และใน environment ของ production)

```
LINE_CHANNEL_ACCESS_TOKEN=<long-lived access token>
LINE_CHANNEL_SECRET=<channel secret>
LINE_LINK_BASE_URL=https://<โดเมนระบบ>   # ถ้าไม่ตั้ง จะใช้ NEXTAUTH_URL แทน
LINE_OA_BASIC_ID=@xxxxxxx                # ไม่บังคับ — ใช้แสดงในหน้าโปรไฟล์
LINE_ADD_FRIEND_URL=https://lin.ee/xxxx  # ไม่บังคับ — ปุ่มเพิ่มเพื่อนในหน้าโปรไฟล์

# LIFF — ตั้งครบทั้งคู่เมื่อไหร่ ระบบจะบังคับพิสูจน์ตัวตนตอนผูกบัญชีทันที
NEXT_PUBLIC_LINE_LIFF_ID=1234567890-abcdefgh
LINE_LOGIN_CHANNEL_ID=1234567890
```

> LIFF เป็น **ทางเลือก** — ถ้าไม่ตั้ง 2 ตัวนี้ ระบบจะใช้วิธี token อย่างเดียวซึ่งทำงานได้ปกติ
> แต่จะไม่มีการป้องกันกรณีลิงก์ผูกบัญชีถูกส่งต่อให้คนอื่น (ดูหัวข้อ 2.1)

> ถ้าไม่ตั้ง 2 ตัวแรก ระบบจะทำงานปกติทุกอย่าง แต่ **ข้ามการส่ง LINE** (แจ้งเตือนในระบบยังทำงาน)

### 1.3 สร้างตารางในฐานข้อมูล
⚠️ **ห้ามใช้ `prisma db push`** — workspace ต่อกับ production โดยตรง
ให้รันสคริปต์ SQL ด้วยมือแทน (รันซ้ำได้ ปลอดภัย)

```
prisma/manual-migrations/001_line_oa_integration.sql
```

สร้าง 3 ตาราง: `CM_UserLineLink`, `CM_LineLinkToken`, `CM_LineMessageLog`

จากนั้นรัน (ไม่แตะฐานข้อมูล — แค่ generate client):

```bash
npx prisma generate
```

---

## 2. วิธีที่ผู้ใช้ผูกบัญชี

```
เพิ่มเพื่อน OA
   ↓  (webhook: follow)
ระบบส่งปุ่ม "ผูกบัญชี" พร้อม token อายุ 15 นาที ใช้ได้ครั้งเดียว
   ↓
เปิดหน้า /line/link?token=... ใน in-app browser ของ LINE
   ↓
กรอก Email + Password เดียวกับระบบ  →  POST /api/line/link  →  bcrypt verify
   ↓
บันทึก CM_UserLineLink (UserID ↔ LineUserID)  +  ตอบยืนยันกลับใน LINE
```

### 2.1 การป้องกันลิงก์ถูกส่งต่อ (เมื่อเปิด LIFF)

ลิงก์ผูกบัญชีผูกกับ LINE userId ของคนที่ขอไว้ตั้งแต่ต้น แต่ token อย่างเดียว
**ไม่รู้ว่าใครเป็นคนเปิดลิงก์จริง** ถ้า A ส่งต่อการ์ดให้ B แล้ว B login ด้วยบัญชีของตัวเอง
ผลคือบัญชีระบบของ B ถูกผูกกับ LINE ของ A → A จะได้รับแจ้งเตือนที่ควรเป็นของ B

เมื่อเปิด LIFF ระบบจะตรวจ **2 ชั้น**:

| ชั้น | ตอบคำถามว่า | ได้มาจาก |
|---|---|---|
| one-time token | ลิงก์ใบนี้ออกให้ LINE userId ไหน | webhook (ตรวจ signature แล้ว) |
| **LIFF ID token** | **ใครกำลังเปิดหน้านี้จริง** | LINE เซ็นให้ ณ ตอนเปิดหน้า ปลอมไม่ได้ |

ถ้าสองค่าไม่ตรงกัน = ลิงก์ถูกส่งต่อ → ปฏิเสธด้วย HTTP 403 พร้อมข้อความให้ขอลิงก์ของตัวเอง

ผู้ใช้พิมพ์คำสั่งในแชทได้:

| คำสั่ง | ผลลัพธ์ |
|---|---|
| `ผูกบัญชี` | ขอลิงก์ผูกบัญชีใหม่ |
| `สถานะ` | ดูว่าผูกอยู่กับใคร สาขาไหน แจ้งเตือนเปิด/ปิด |
| `เปลี่ยนบัญชี` | ผูกกับผู้ใช้คนอื่นแทน |
| `ปิดแจ้งเตือน` / `เปิดแจ้งเตือน` | พักรับแจ้งเตือนชั่วคราว |
| `ยกเลิกการผูก` | ตัดการเชื่อมต่อ |

จัดการจากเว็บได้ที่หน้า **โปรไฟล์ → แจ้งเตือนผ่าน LINE**

**ข้อจำกัด:** 1 บัญชี LINE ผูกได้ 1 ผู้ใช้ และ 1 ผู้ใช้ผูกได้ 1 บัญชี LINE (ผูกใหม่ = แทนที่ของเดิมอัตโนมัติ)

---

## 3. กติกาการส่งแจ้งเตือน (ใครได้รับอะไร)

กำหนดไว้ที่เดียวใน [`src/lib/booking-notify.ts`](../src/lib/booking-notify.ts) → `resolveBookingRecipients()`

| Role | ได้รับแจ้งเตือนของ |
|---|---|
| `ADMIN` | ทุกสาขา ทุก BookingType |
| `SERVICE_CENTER` | **เฉพาะสาขาของตัวเอง** (`CM_User.BranchID` = `CM_Booking.BranchID`) |
| `CS` / `CS_*` | เฉพาะ BookingType ที่ดูแล (`AllowedBookingType` = null คือทุกประเภท) และถ้าถูกผูกสาขาไว้ ก็เฉพาะสาขานั้น |
| คนที่กด action เอง | **ได้รับด้วย** — ทุกคนในขอบเขตเห็นความเคลื่อนไหวชุดเดียวกัน |

> ตัวอย่าง: user สังกัด **สาขาลาดพร้าว** จะได้รับเฉพาะ action ของคิวที่ `BranchID` = ลาดพร้าว เท่านั้น
> คิวของสาขาอื่นจะไม่ถูกส่งไปหา

**ไม่ส่งแจ้งเตือน** สำหรับรายการปิดช่องซ่อมชั่วคราว (`CustomerName = '[ปิดช่องซ่อมชั่วคราว]'`) เพราะไม่ใช่คิวลูกค้า

---

## 4. Event ที่แจ้งเตือน

| Event | เกิดเมื่อ | ต้นทาง |
|---|---|---|
| `CREATED` | สร้างคิวใหม่ (รออนุมัติ) | `POST /api/bookings` |
| `AUTO_APPROVED` | สร้างคิวแล้วอนุมัติอัตโนมัติ (เช็คระยะ / ADMIN / RETAIL) | `POST /api/bookings` |
| `APPROVED` | อนุมัติคิว | `POST /api/bookings/[id]/approve`, `PUT /api/bookings/[id]` |
| `REJECTED` | ปฏิเสธคิว | `POST /api/bookings/[id]/reject` |
| `CANCELLED` | ยกเลิกคิว (แนบเหตุผล) | `PUT /api/bookings/[id]` |
| `RESCHEDULED` | เลื่อนนัดหมาย (แสดงนัดเดิม → นัดใหม่) | `PUT /api/bookings/[id]` |
| `DURATION_CHANGED` | ขยาย/ลดเวลาซ่อม | `PUT /api/bookings/[id]` |
| `BAY_CHANGED` | ย้ายช่องซ่อม | `PUT /api/bookings/[id]` |
| `UPDATED` | แก้ไขข้อมูลคิว (ลูกค้า/รถ/รายละเอียด) | `PUT /api/bookings/[id]` |
| `CLAIMED` | เปิดใบเคลมจากคิวแล้ว (Status 3) | `PUT /api/bookings/[id]` |
| `COMPLETED` | ปิดงาน (Status 4) | `PUT /api/bookings/[id]` |
| `CS_STATUS` | CS อัปเดตผลการติดต่อลูกค้า | `POST /api/bookings/[id]/cs-status` |

ทุก event ส่ง **2 ช่องทางพร้อมกัน**: in-app (`CM_Notification`) + LINE Flex Message
และบันทึกผลการส่งลง `CM_LineMessageLog` เพื่อตรวจย้อนหลังว่าส่งถึงใคร/ล้มเหลวเพราะอะไร

---

## 5. หลักการออกแบบที่ต้องรักษาไว้

- **การแจ้งเตือนต้องไม่ทำให้ action หลักพัง** — `notifyBookingEvent()` จับ error ทั้งหมดเอง ไม่ throw
- **ส่งรวมทีเดียวด้วย multicast** — ประหยัดโควตาข้อความ (หั่นชุดละ 500 อัตโนมัติ)
- **ตรวจ signature ทุก request** — webhook ใช้ raw body เท่านั้น ห้าม `JSON.stringify` ใหม่
- **token ผูกบัญชีใช้ครั้งเดียว + หมดอายุ 15 นาที + จำกัดกรอกรหัสผิด 5 ครั้ง**
- **เมื่อเปิด LIFF: ID token เป็นสิ่งบังคับ** — ไม่ส่งมา = 400, ปลอม = 401, ไม่ตรงเจ้าของลิงก์ = 403
- ผู้ใช้บล็อก OA (`unfollow`) → ตั้ง `IsActive = false` ไม่ลบ mapping (กลับมา follow แล้วใช้ต่อได้เลย)

---

## 6. วิธีทดสอบ

1. ตั้ง env + รัน SQL migration + `npx prisma generate` + restart app
2. เช็ค config: `GET /api/line/webhook` → ควรได้ `{"success":true,"configured":true,...}`
3. กด **Verify** ที่ Webhook URL ใน LINE Console → ต้องขึ้น Success
4. เพิ่มเพื่อน OA → ต้องได้ข้อความต้อนรับ + ปุ่มผูกบัญชี
5. กดปุ่ม → กรอก email/password → ต้องได้ข้อความ "ผูกบัญชีสำเร็จ" พร้อมชื่อ/สาขา
6. ใช้ user คนละสาขา 2 คน สร้างคิวที่สาขา A → ต้องมีเฉพาะคนสาขา A (+ ADMIN) ที่ได้รับ
7. ตรวจ `SELECT TOP 50 * FROM CM_LineMessageLog ORDER BY CreateDate DESC` ดูผลการส่ง
