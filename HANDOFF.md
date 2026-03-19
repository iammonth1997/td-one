# HANDOFF - TD One ERP

## อัปเดตล่าสุด
- วันที่: 2026-03-19

## สถานะที่ใช้งานได้ล่าสุด (Latest Known Good)
- แอปหลักรันด้วย Remix / React Router 7 ภายใต้โฟลเดอร์ `remix-app`
- ระบบ deploy ใช้ Cloudflare Workers ผ่านคำสั่ง `npm run cf:deploy` ที่ root ของ repo
- การ deploy ล่าสุดสำเร็จเมื่อวันที่ 2026-03-19
- Worker เวอร์ชันล่าสุดที่ deploy คือ `cb4a66a5-807f-47da-9997-e45b0c14b08e`
- URL ของ Worker: `https://tdone-remix.iammonth1997.workers.dev`

## สรุปงานฟีเจอร์ที่เพิ่งทำเสร็จ
- ทำให้ flow อนุมัติคำขอของแอดมิน (leave, OT, time-correction) เสถียรมากขึ้น
- แก้ schema ไม่ตรงใน flow ปฏิเสธ time-correction ให้ใช้ `rejected_reason`
- เพิ่ม regression test สำหรับพฤติกรรม approve/reject ใน `tests/api/requests-approval-flows.test.js`
- เพิ่มเมนู Recruitment และ HR-ER ใน sidebar ฝั่งแอดมิน
- เพิ่มหน้าแอดมิน Recruitment และ HR-ER ให้ใช้งานจริง
- ลงทะเบียน explicit routes ที่ขาดใน `remix-app/app/routes.ts` สำหรับ:
   - หน้า admin recruitment
   - หน้า admin HR-ER
   - API bridge ของ recruitment และ HR-ER
   - API bridge ของ headcount/manpower/medical-check/blacklist
- อัปเกรดหน้า HR-ER จากหน้า summary อย่างเดียว เป็นหน้า operation:
   - สร้างเคส
   - แก้ไขเคส
   - เปลี่ยนสถานะเคส
   - เพิ่ม note
   - สร้าง deduction
   - ดูรายละเอียดเคส
- อัปเกรดหน้า Recruitment จากหน้า summary อย่างเดียว เป็นหน้า operation:
   - สร้าง requisition
   - แก้ไข requisition
   - เปลี่ยนสถานะ requisition
   - สร้าง candidate
   - เลื่อน stage ของ candidate
   - ดูรายละเอียด requisition พร้อม candidate list

## Checklist สำคัญฝั่ง Production
1. ยืนยันว่า Cloudflare deployment อยู่ที่เวอร์ชัน `cb4a66a5-807f-47da-9997-e45b0c14b08e` หรือใหม่กว่า
2. ยืนยันว่าโดเมน production `https://tdone-erp.com` เสิร์ฟ static assets ใหม่แล้ว (หลัง hard refresh)
3. ยืนยันว่า Cloudflare worker secrets และ variables ถูกตั้งค่าใน production ครบ
4. ถ้าใช้งาน cron cleanup ให้ตั้ง scheduler สำหรับ `/api/cron/cleanup-cancelled-leave-files` พร้อม `CRON_SECRET`
5. ทำ smoke test route หลัง deploy:
    - `/login`
    - `/admin/dashboard`
    - `/admin/requests`
    - `/admin/recruitment`
    - `/admin/hr-er`

## สิ่งที่ยืนยันแล้วใน session ล่าสุด
- `npm run typecheck` ผ่าน
- `npm run cf:deploy` ผ่าน
- build สร้าง client bundle สำหรับ:
   - `admin.hr-er`
   - `admin.recruitment`
- เมนู HR-ER และ Recruitment live แล้ว และ route ผ่าน explicit manifest

## งานที่ยังเปิดอยู่ (Open Tasks)
- [ ] ทำ browser smoke-test บน `tdone-erp.com` หลัง hard refresh
- [ ] ทดสอบ flow create/update จริงกับ production data ของ Recruitment และ HR-ER
- [ ] เพิ่ม filter/search/export ถ้าฝ่ายแอดมินต้องใช้งานระดับปริมาณข้อมูลสูงขึ้น
- [ ] ตรวจ repo สำหรับปัญหา import case-sensitive ก่อนพัฒนาต่อบน Linux Mint ระยะยาว

## ความเสี่ยงที่ต้องระวัง
- โปรเจกต์นี้ใช้ explicit route registration ใน `remix-app/app/routes.ts` ดังนั้นการเพิ่มไฟล์ route อย่างเดียวไม่พอ
- Linux เป็น case-sensitive: import ที่พิมพ์เคสผิด อาจรอดบน Windows แต่พังบน Linux Mint
- บาง setup script ผูกกับ PowerShell; บน Linux ควรใช้คำสั่งที่เป็น shell-compatible หรือ npm script กลาง
- ประวัติ Copilot chat และ state ของ VS Code workspace บนเครื่องเดิม ไม่ได้ย้ายข้ามเครื่องแบบเชื่อถือได้

## หมายเหตุสำหรับการย้ายเครื่อง
- ก่อนย้ายเครื่อง:
   - commit หรือ stash local changes
   - copy ไฟล์ `.env*` หรือโน้ต secret ที่ไม่ได้อยู่ใน git
   - เก็บ `HANDOFF.md` และ `LINUX_MINT_MIGRATION.md` ไว้ใน repo
- บน Linux Mint:
   - ติดตั้ง Node 22 ด้วย `nvm`
   - รัน `npm install`
   - รัน `npm run typecheck`
   - รัน `npm test`
   - รัน `npm run dev`

## งานถัดไปที่แนะนำ
- ทำ Linux-readiness pass:
   - ตรวจ import ที่เสี่ยง case-sensitive
   - ตรวจ script ที่เสี่ยงใช้ได้เฉพาะ PowerShell
   - ยืนยัน requirement ของ `.env` สำหรับ local dev และ deploy

## ข้อความเริ่มแชทใหม่ (คัดลอกไปใช้ได้)
"Please read `PROJECT_CONTEXT.md`, `HANDOFF.md`, and `LINUX_MINT_MIGRATION.md`, then continue from the latest deployed state. First, verify Linux-readiness and then run a focused production smoke-test plan for Recruitment and HR-ER."

## เอกสารที่เกี่ยวข้อง
- `LINUX_MINT_MIGRATION.md`
- `PROJECT_CONTEXT.md`
- `SESSION_COMPLETION_SUMMARY.md`
