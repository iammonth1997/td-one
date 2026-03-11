# Database Migrations — TD One ERP

สคริปต์การสร้างตาราง Supabase สำหรับโครงการ TD One ERP

## 📁 โครงสร้าง

```
migrations/
├── 001_create_login_and_daywork_tables.sql    ← ตารางที่ขาด
└── README.md                                   ← ไฟล์นี้
```

---

## 📊 ตาราง 2 ตารางที่เพิ่มเข้ามา

### 1. **`login_users`** (ตารางแถมสำหรับการเข้าสู่ระบบ)

ใช้สำหรับเก็บข้อมูล PIN และสิทธิ์การเข้าถึง

| Column | Type | Description |
|--------|------|-------------|
| `emp_id` | VARCHAR(20) | **PK** — รหัสพนักงาน (เชื่อมกับ `employees.employee_code`) |
| `pin_hash` | VARCHAR(255) | PIN ที่ hash ด้วย bcryptjs — ไม่สามารถย้อนกลับได้ |
| `role` | VARCHAR(50) | `admin` \| `employee` \| `supervisor` \| `manager` \| `super_admin` |
| `is_registered` | BOOLEAN | `true` = ตั้งค่า PIN แล้ว, `false` = ต้องตั้งค่า PIN ครั้งแรก |
| `device_id_hash` | VARCHAR(255) | (Optional) Hash ของ device_id สำหรับการล็อก device |
| `created_at` | TIMESTAMPTZ | สร้างเมื่อ |
| `updated_at` | TIMESTAMPTZ | อัปเดตเมื่อ (auto-update) |

**Indexes:**
- `emp_id` (PRIMARY KEY)
- `role` (สำหรับ filter ตามบทบาท)

---

### 2. **`monthly_daywork_summary`** (สรุปวันทำงานรายเดือน)

ใช้สำหรับเก็บข้อมูลสรุปวันทำงาน ลาป่วย ลากิจ ฯลฯ ของแต่ละพนักงานต่อเดือน

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | **PK** — Unique identifier |
| `emp_id` | VARCHAR(20) | **FK** — เชื่อมกับ `login_users.emp_id` |
| `year` | INTEGER | ปี (เช่น 2026) |
| `month` | INTEGER | เดือน (1-12) |
| `total_work_days` | INTEGER | วันทำงานทั้งหมด (ไม่รวม วันหยุดสุดสัปดาห์ + วันหยุดราชการ) |
| `sick_leave` | INTEGER | สิทธิลาป่วยที่ใช้ (วัน) |
| `personal_leave` | INTEGER | สิทธิลากิจส่วนตัวที่ใช้ (วัน) |
| `annual_leave` | INTEGER | สิทธิลาพักร้อนที่ใช้ (วัน) |
| `absent_days` | INTEGER | วันขาดงาน (ไม่มีใบลา) |
| `forgot_scan` | INTEGER | วันที่ลืมลงเวลา (clock in/out) |
| `overtime_hours` | DECIMAL(8,2) | ชั่วโมง OT ทั้งหมด |
| `normal_work_hours` | DECIMAL(8,2) | ชั่วโมงการทำงานปกติ |
| `created_at` | TIMESTAMPTZ | สร้างเมื่อ |
| `updated_at` | TIMESTAMPTZ | อัปเดตเมื่อ (auto-update) |

**Constraints:**
- `UNIQUE(emp_id, year, month)` — มีเพียง 1 record ต่อพนักงานต่อเดือน

**Indexes:**
- `emp_id`
- `year, month`
- `emp_id, year, month` (composite)

---

## 🚀 วิธีใช้

### ขั้นตอนที่ 1: เปิด Supabase SQL Editor

1. ไปที่ https://supabase.com
2. เลือก Project: **TD One ERP**
3. ไปที่ **SQL Editor**
4. คลิก **New Query**

### ขั้นตอนที่ 2: Copy and Paste SQL

copy ทั้งหมดจากไฟล์ `001_create_login_and_daywork_tables.sql` แล้ว paste ลงใน SQL Editor

### ขั้นตอนที่ 3: Run Query

คลิก **Run** (หรือ Ctrl+Enter)

✅ ผลลัพธ์: ตารางทั้ง 2 ตารางจะถูกสร้าง

---

## 🔐 Row Level Security (RLS)

ตารางทั้ง 2 มี RLS เปิดแล้ว แต่ policies ที่ set ไว้ยังใช้ `true` (allow all) เพราะ auth system ยังไม่สมบูรณ์

**การอัปเดต RLS policies จะทำหลังจาก:**
- ✅ ระบบ auth สำหรับ Supabase Gotrue เสร็จสิ้น
- ✅ เชื่อมต่อ `auth.users` ได้สำเร็จ

---

## 📝 Seed Data (Optional)

หากต้องการ insert ข้อมูลทดสอบจาก employee จริง:

```sql
-- Insert 10 real employees from ThaiDrill database
INSERT INTO login_users (emp_id, pin_hash, role, is_registered)
VALUES
    ('L2207014', '$2b$10$...hash_here...', 'employee', true),
    ('L2210007', '$2b$10$...hash_here...', 'employee', true),
    ('L2210009', '$2b$10$...hash_here...', 'supervisor', true),
    ('L2210013', '$2b$10$...hash_here...', 'manager', true),
    ('L2211017', '$2b$10$...hash_here...', 'admin', true),
    ('L2211018', '$2b$10$...hash_here...', 'employee', true),
    ('L2211020', '$2b$10$...hash_here...', 'supervisor', true),
    ('L2211030', '$2b$10$...hash_here...', 'employee', true),
    ('L2211032', '$2b$10$...hash_here...', 'employee', true),
    ('L2212043', '$2b$10$...hash_here...', 'employee', true);
```

**ข้อมูล 10 รหัสพนักงานจริง:**
- L2207014 - เพียว่าง ว่าเน่งเยีย
- L2210007 - สีสะหวาด กราบพาสอน
- L2210009 - แดนสะหวัน หลวงนิกอน
- L2210013 - มะโนสัก เทบสุริวง
- L2211017 - เสกไช สันติหมั้นมะนี
- L2211018 - สอนวิไช แก้วมีไช
- L2211020 - ธีระพงศ์ มีใส
- L2211030 - หูนคำ จันสีนา
- L2211032 - อาลิสา สีสุมัง
- L2212043 - ต้นจักกิด ทามอนตี

---

## 🔗 ความสัมพันธ์ระหว่างตาราง

```
ThaiDrill Schema (ที่มีอยู่แล้ว)
└── employees
    ├── employee_code (VARCHAR 20)
    │
    └── Reference ← login_users.emp_id
    └── Reference ← monthly_daywork_summary.emp_id
```

---

## ⚠️ รายการสิ่งที่ต้องทำ

- [ ] รัน migration script บน Supabase
- [ ] ตรวจสอบตารางใน Supabase SQL
- [ ] Insert test data (optional)
- [ ] อัปเดต RLS policies หลังจาก auth พร้อม
- [ ] เชื่อมต่อ API routes กับตารางใหม่
- [ ] ทดสอบ login flow end-to-end

---

## 📞 ติดต่อปัญหา

หากมีปัญหาในการรัน:
1. ตรวจสอบว่า Supabase project เชื่อมต่อแล้ว
2. ตรวจสอบ error message ตอน Run Query
3. ตรวจสอบสิทธิ์ (permissions) บนตาราง
