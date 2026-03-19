# คู่มือย้ายไปใช้ Linux Mint

## เป้าหมาย
- ย้ายงานพัฒนา TD One ERP จาก Windows ไป Linux Mint โดยไม่ทำให้ context งานหาย, deploy ไม่ได้, หรือเปิดงานต่อไม่ถูกจุด

## สถานะโปรเจกต์ตอนนี้
- โฟลเดอร์หลักของ repo คือ `td-one`
- ตัวแอปหลักรันด้วย Remix / React Router 7 อยู่ใน `remix-app`
- ฝั่ง backend ใช้ handler เดิมใน `server/api` แล้ว bridge เข้า Remix routes
- ระบบ deploy ขึ้น Cloudflare Workers
- เวอร์ชัน deploy ล่าสุดคือ `cb4a66a5-807f-47da-9997-e45b0c14b08e`
- งานล่าสุดที่ทำเสร็จแล้ว:
  - แก้ flow อนุมัติคำขอ admin
  - หน้า Recruitment ใช้งานได้จริงแล้ว
  - หน้า HR-ER ใช้งานได้จริงแล้ว

## อะไรย้ายตามไปได้ และอะไรไม่ย้ายตาม

### สิ่งที่ย้ายตามไปได้
- โค้ดที่ commit แล้วใน git
- branch และ tag
- VS Code settings ถ้าเปิด Settings Sync
- รายชื่อ extensions ถ้าเปิด Settings Sync

### สิ่งที่ไม่ค่อยย้ายตามไปอัตโนมัติ
- ประวัติ Copilot Chat ใน VS Code
- terminal state ที่ค้างอยู่ใน workspace เดิม
- งานที่ยังไม่ commit ถ้าไม่ได้ copy repo หรือ push ขึ้น remote
- ไฟล์ `.env` หรือโน้ต secret ที่เก็บไว้เฉพาะเครื่อง

## ก่อนย้ายออกจาก Windows
1. ตรวจให้แน่ใจว่างานล่าสุด commit แล้ว หรือ stash ไว้อย่างตั้งใจ
2. copy ไฟล์ env, secret, และ deployment note ที่เก็บไว้ local
3. อัปเดตไฟล์เหล่านี้ใน repo ให้ทันสมัย:
   - `HANDOFF.md`
   - `LINUX_MINT_MIGRATION.md`
   - `PROJECT_CONTEXT.md`
4. ถ้าเพิ่งแก้ production code ให้เช็กสถานะ deploy ล่าสุดก่อน
5. ถ้าต้องการให้ settings และ extension ตามไป Linux ด้วย ให้ sign in VS Code Sync บน Windows ก่อน

## รายการที่ควร backup ไว้
- Git remote URL
- ชื่อ branch ที่กำลังใช้งาน
- ไฟล์ `.env`, `.env.local` หรือไฟล์ local-only อื่น ๆ
- สถานะการ login ของ Wrangler และ Cloudflare account
- Supabase project URL และ key ที่ต้องใช้
- secret ภายนอกที่ไม่ได้เก็บไว้ใน Cloudflare dashboard

## ขั้นตอนติดตั้งบน Linux Mint

### ติดตั้ง package พื้นฐาน
```bash
sudo apt update
sudo apt install -y git curl build-essential ca-certificates
```

### ติดตั้ง NVM และ Node 22
```bash
curl -fsSL https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.3/install.sh | bash
source ~/.bashrc
nvm install 22
nvm use 22
node -v
npm -v
```

### ติดตั้ง VS Code
- ติดตั้ง VS Code แบบ official `.deb` จาก Microsoft หรือผ่าน Software Manager ของ Linux Mint
- sign in บัญชีเดียวกับบน Windows ถ้าต้องการใช้ Settings Sync

### Extension ที่แนะนำ
- GitHub Copilot
- ESLint
- Tailwind CSS IntelliSense
- Prettier ถ้าคุณใช้อยู่แล้ว
- เครื่องมือเกี่ยวกับ Cloudflare / Wrangler ถ้าจะ deploy จากเครื่อง Linux

## วิธี clone และติดตั้งโปรเจกต์
```bash
git clone <your-repo-url>
cd td-one
npm install
```

หมายเหตุ:
- คำสั่งที่ root จะวิ่งต่อเข้า `remix-app` ให้เองในหลายกรณี
- ปกติให้เริ่มทำงานจาก root ของ repo นี้

## ตั้งค่า environment บนเครื่องใหม่
1. copy ไฟล์ env จาก Windows มาลงเครื่อง Linux Mint
2. ตรวจว่าค่าที่ต้องใช้มีครบ เช่น:
   - Supabase
   - LIFF / LINE
   - app base URL
   - ค่าที่เกี่ยวกับ Cloudflare deploy
3. ถ้าจะ deploy จาก Linux Mint ให้ login Wrangler ใหม่:

```bash
npx wrangler login
```

## ลำดับการตรวจหลังติดตั้ง
ให้รันตามนี้บน Linux Mint

```bash
npm run typecheck
npm test
npm run dev
```

ถ้าจะเช็กฝั่ง deploy เพิ่ม:

```bash
npm run cf:build
npm run cf:deploy
```

## ความเสี่ยงเฉพาะตอนย้ายมา Linux สำหรับ repo นี้

### 1. import ตัวพิมพ์เล็ก-ใหญ่ต้องตรง
- Windows มักยอมให้ชื่อไฟล์กับ import สะกดไม่ตรงเคสกัน
- Linux Mint ไม่ยอม
- ถ้าชื่อไฟล์จริงกับ import ไม่ตรง เช่นตัวพิมพ์เล็ก/ใหญ่สลับกัน build อาจพังทันที

### 2. script ที่ผูกกับ PowerShell
- บาง helper script ถูกออกแบบมาสำหรับ PowerShell ก่อน
- บน Linux ให้ใช้ npm script ที่เป็นกลางก่อน
- ถ้าต้อง setup Cloudflare ให้ใช้คำสั่ง shell-friendly หรือ script ฝั่ง shell ถ้ามี

### 3. line ending
ตั้ง git ให้ลดปัญหา CRLF จาก Windows:

```bash
git config --global core.autocrlf input
```

### 4. secret หายระหว่างย้ายเครื่อง
- ปัญหาย้ายเครื่องส่วนใหญ่ไม่ได้พังที่โค้ด แต่พังที่ env หรือ secret ไม่ครบ
- ให้แยกเช็ก local credentials และ deploy credentials ออกจากกัน

## คำสั่งหลักที่ใช้บ่อยใน repo นี้
```bash
npm run dev
npm run typecheck
npm test
npm run cf:build
npm run cf:deploy
```

## เรื่องสำคัญของ production ที่ต้องจำไว้
- หน้า Recruitment และ HR-ER live แล้ว
- โปรเจกต์นี้ใช้ explicit route registration ใน `remix-app/app/routes.ts`
- ถ้าเพิ่ม route file ใหม่แล้วหน้าไม่ขึ้น ให้เช็ก `routes.ts` ก่อนเสมอ

## prompt ที่ใช้เปิดงานต่อบน Linux Mint
หลังเปิด repo บน Linux Mint แล้ว ให้ใช้ข้อความนี้ใน Copilot Chat:

```text
Please read PROJECT_CONTEXT.md, HANDOFF.md, and LINUX_MINT_MIGRATION.md, then continue from the latest deployed state. First, verify Linux-readiness and check for case-sensitive import problems before making further changes.
```

## งานแรกที่ควรทำหลังย้ายเสร็จ
1. เช็กว่า repo เปิดและ typecheck ผ่านบน Linux Mint
2. ถ้าจะ deploy จากเครื่องนี้ ให้เช็ก Cloudflare auth ด้วย `npx wrangler whoami`
3. ทดลองหน้า `/admin/recruitment` และ `/admin/hr-er` บน local
4. ถ้าจะทำงานต่อยาว ๆ ให้ไล่ตรวจ import casing ทั้ง repo ก่อน