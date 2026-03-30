# Production Admin Login Incident Summary

Date: March 29, 2026  
System: `tdone-erp.com` admin login  
Status: Resolved with hotfix

## 1. Executive Summary

ปัญหา `log in ไม่ได้` บนเว็บจริงไม่ได้เกิดจากรหัสผ่านผิดอย่างเดียว แต่เกิดจากหลายปัจจัยที่ซ้อนกันใน production พร้อมกัน ได้แก่

1. โดเมน production เคยมี DNS conflict ทำให้ทราฟฟิกไม่ได้วิ่งเข้า worker/deployment ที่เราตั้งใจเสมอไป
2. โค้ดที่ deploy กับ schema ของฐานข้อมูล production ไม่ตรงกัน
3. ตาราง `auth_sessions` ใน production บังคับให้มีค่า `id` แต่โค้ดเดิมไม่ได้ส่งค่าเข้าไปตอนสร้าง session
4. เส้นทาง login เดิมใช้ Prisma/connection flow ที่ไม่ทนกับข้อจำกัดของ Cloudflare Workers + production DB ทำให้เกิดทั้ง `DB_QUERY_FAILED`, `SESSION_CREATE_FAILED`, `Connection terminated unexpectedly`, และ `Worker 1101`

สรุปสั้นที่สุดคือ: ระบบสามารถยืนยันอีเมลและรหัสผ่านได้ในบางช่วง แต่ล้มเหลวที่ขั้นตอน query/สร้าง session หลังจากยืนยันตัวตนแล้ว จึงทำให้ผู้ใช้ไม่สามารถเข้าสู่ระบบได้แม้กรอกรหัสถูกต้อง

## 2. อาการที่พบจริง

อาการที่พบระหว่าง incident มีหลายรูปแบบ ไม่ได้คงที่ตลอดเวลา

1. หน้า production แสดงว่า login ไม่ผ่านทั้งตอนใส่รหัสผิดและตอนใส่รหัสที่ถูกต้อง
2. บางครั้งรหัสผิดควรจะได้ข้อความ `อีเมลหรือรหัสผ่านไม่ถูกต้อง` แต่กลับได้ error ฝั่งระบบแทน
3. ตอนใส่รหัสถูกต้อง หน้าเว็บแสดงข้อความประมาณ `เชื่อมต่อฐานข้อมูลไม่ได้ กรุณาลองใหม่`
4. ช่วงหนึ่งหน้าเว็บจริงแสดง error ว่า `@prisma/client did not initialize yet. Please run prisma generate`
5. ที่ระดับ API พบผลลัพธ์แบบนี้
   - wrong password -> `401 INVALID_CREDENTIALS`
   - valid password -> `500 DB_QUERY_FAILED`
   - valid password ในบางรอบ -> `500 SESSION_CREATE_FAILED`
   - บางรอบ -> Cloudflare `1101 Worker threw exception`
6. จาก log ที่ไล่ดู พบข้อความสำคัญ เช่น
   - `Connection terminated unexpectedly`
   - `remaining connection slots are reserved for roles with the SUPERUSER attribute`
   - schema/query errors ที่ชี้ว่าคอลัมน์ใน DB จริงไม่ตรงกับที่โค้ดคาด

อาการเหล่านี้ทำให้ปัญหาดูเหมือนสุ่ม แต่จริง ๆ แล้วเป็นผลจากหลาย root cause ที่เกิดพร้อมกัน

## 3. สิ่งที่ทำให้วิเคราะห์ยาก

ปัญหานี้หลอกตาได้ง่าย เพราะ localhost กับ production ให้ผลไม่เหมือนกัน

1. ช่วงหนึ่ง `localhost` ใช้งานได้ แต่เว็บจริงยังเข้าไม่ได้
2. frontend form ดูเหมือนทำงานปกติ เพราะ request ถูกส่งถึง API แล้ว
3. บางครั้งระบบตอบ `401` ถูกต้อง แปลว่าการเช็ครหัสผ่านทำงาน
4. แต่หลังจากนั้นยังล้มตอน query เพิ่มเติมหรือสร้าง session ทำให้ภาพรวมเหมือน “รหัสถูกแต่ก็ยัง login ไม่ได้”

ดังนั้น root cause ไม่ได้อยู่ที่ UI อย่างเดียว และไม่ได้อยู่ที่ credential validation อย่างเดียว

## 4. Root Causes แบบละเอียด

### 4.1 DNS conflict บน production domain

ก่อนจะเจอ root cause ฝั่ง login โดยตรง มีปัญหาเรื่อง routing ของโดเมน production ก่อน

บน Cloudflare DNS ยังมี record ที่ชนกับปลายทาง deployment เดิม ทำให้โดเมน `tdone-erp.com` ไม่ได้ชี้เข้า worker/custom domain ที่ถูกต้องอย่างเสถียร ผลคือ

1. ผู้ใช้บางครั้งไม่ได้วิ่งเข้า deployment ล่าสุด
2. หลัง deploy แล้ว behavior บนโดเมนจริงไม่ตรงกับสิ่งที่ทดสอบไว้
3. การ debug production สับสน เพราะ code ที่เห็นใน local กับ code ที่โดเมนรับใช้อาจไม่ใช่ชุดเดียวกันจริง

หลังลบ record ที่ชนกันออก โดเมนจึงเริ่มชี้เข้า deployment ที่ถูกต้อง และค่อยเห็นปัญหาฝั่ง login ชัดขึ้น

### 4.2 Production build/runtime เคยไม่พร้อมสำหรับ Prisma

หลังจาก DNS เริ่มชี้ถูกต้องแล้ว มีช่วงที่หน้า production แสดงข้อความว่า

`@prisma/client did not initialize yet. Please run prisma generate`

อาการนี้หมายความว่า deployment ณ เวลานั้นมีปัญหาเกี่ยวกับ Prisma runtime/bundle ใน production environment ทำให้ route ที่พึ่ง Prisma ไม่พร้อมทำงานตามปกติ

แม้อาการนี้จะไม่ใช่ root cause สุดท้ายเพียงตัวเดียว แต่เป็นสัญญาณสำคัญว่าชั้น runtime ของ production ยังไม่เสถียรพอสำหรับ flow เดิม

### 4.3 Schema ของฐานข้อมูล production ไม่ตรงกับสิ่งที่โค้ดคาด

นี่เป็น root cause สำคัญที่สุดข้อหนึ่ง

ระหว่างไล่ปัญหา พบว่าโค้ดฝั่ง admin login ถูกพัฒนาบนสมมติฐานของ schema รุ่นใหม่ แต่ฐานข้อมูล production จริงยังมีโครงสร้างบางส่วนไม่ตรงกัน ตัวอย่างเช่น

1. ฝั่ง `employees` มีความต่างของชื่อคอลัมน์/โครงสร้างที่ route login พยายามอ่าน
2. ฝั่ง `auth_sessions` ก็มีโครงสร้างจริงไม่ตรงกับสิ่งที่ flow เดิมคาดหวัง
3. Prisma schema ใน repo กับตารางจริงใน production ไม่สอดคล้องกันเต็มที่

ผลกระทบคือ

1. query บางตัวรันผ่านใน local แต่พังใน production
2. route login ผ่านขั้นเช็ครหัสได้ แต่ล้มตอน query ข้อมูลพนักงานหรือสร้าง session
3. error ที่เห็นจากภายนอกกลายเป็น `DB_QUERY_FAILED`

สรุปคือ production DB มี schema drift เมื่อเทียบกับ code ที่ deploy

### 4.4 ตาราง `auth_sessions` บังคับ `id` แต่โค้ดเดิมไม่ได้ส่งค่า

หลังไล่ลึกลงไปถึงจุดสร้าง session พบปัญหาชัดเจนในตาราง `auth_sessions`

ใน production:

1. คอลัมน์ `id` เป็น `NOT NULL`
2. ไม่มี default ที่สร้าง UUID ให้เอง

แต่โค้ด login เดิมพยายาม insert session โดยไม่ส่งค่า `id`

ผลคือ:

1. การยืนยันตัวตนสำเร็จแล้ว
2. ระบบพยายามสร้าง session
3. insert ล้มทันที
4. ผู้ใช้จึงไม่สามารถเข้าสู่ระบบได้ แม้ใส่รหัสถูก

นี่คือสาเหตุเชิงเทคนิคตรงที่สุดของกรณี “ใส่รหัสถูกแล้ว แต่ยังเข้าไม่ได้”

### 4.5 Flow เดิมผ่าน Prisma และ connection layer ไม่ทนกับ production runtime

ถึงแม้จะแก้ schema mismatch บางส่วนแล้ว ระบบยังมีปัญหาเรื่องความเสถียรของ connection ใน production อีก

อาการที่พบ:

1. `Connection terminated unexpectedly`
2. `remaining connection slots are reserved for roles with the SUPERUSER attribute`
3. Cloudflare `1101 Worker threw exception`
4. บางรอบ wrong password ยังโดน DB error แทนที่จะได้ `401`

ความหมายของอาการเหล่านี้คือ

1. login route เดิมพึ่งพา Prisma + pool/adapter flow ที่ไวต่อสภาพแวดล้อม Cloudflare Workers
2. เมื่อ connection ฝั่ง DB หรือ idle client มีปัญหา worker อาจล้มทั้ง invocation
3. จึงเกิดอาการ “บางรอบได้ 401, บางรอบ 500, บางรอบ 1101” ทั้งที่ผู้ใช้ทำ action เหมือนเดิม

ดังนั้นปัญหาไม่ได้มีแค่ schema ไม่ตรง แต่ยังมีเรื่อง connection handling ด้วย

## 5. ทำไม localhost ใช้ได้ แต่เว็บจริงใช้ไม่ได้

นี่เป็นคำถามสำคัญของ incident นี้

คำตอบคือ `localhost` กับ production ไม่ได้อยู่ในสภาพแวดล้อมเดียวกันจริง แม้จะเป็นระบบเดียวกันก็ตาม

1. `localhost` ใช้ local dev runtime
2. production ใช้ Cloudflare Worker + Hyperdrive + production database จริง
3. local กับ production อาจใช้ bundle/runtime state ไม่เหมือนกัน ณ เวลานั้น
4. production DB มี schema และ constraint ที่ route login เดิมชนจริง แต่ local test ไม่ได้ชนแบบเดียวกันทุกครั้ง
5. production ยังมีปัญหา connection limits และ worker runtime behavior ที่ local ไม่ได้แสดงออกเหมือนกัน

ดังนั้นกรณี “ในเครื่องผ่าน แต่บนเว็บจริงไม่ผ่าน” เกิดขึ้นได้ และใน incident นี้ก็เกิดขึ้นจริงจากความต่างของ environment และ DB state

## 6. ลำดับการไล่ปัญหา

ลำดับการไล่ incident โดยสรุปเป็นดังนี้

1. ยืนยันก่อนว่า frontend ไม่ใช่ต้นเหตุหลัก ด้วยการยิง API `/api/admin/login` โดยตรง
2. แยกให้ชัดว่ารหัสผิดกับรหัสถูกให้ผลต่างกันอย่างไร
3. ตรวจว่าโดเมน production ชี้เข้า deployment ถูกตัวหรือยัง
4. ไล่ดู error ฝั่ง DB query และ session creation
5. พบว่า valid credential ไม่ได้ล้มตอนเช็ครหัส แต่ล้มหลังจากนั้น
6. พบ schema mismatch ระหว่าง code กับ production DB
7. พบว่าตาราง `auth_sessions` ต้องการ `id` แต่โค้ดเดิมไม่ส่ง
8. พบว่าการใช้ Prisma/connection flow เดิมยังทำให้ worker ไม่เสถียรใน production

จากนั้นจึงตัดสินใจทำ hotfix ที่ลดความเสี่ยงให้เหลือน้อยที่สุดในเส้นทาง login

## 7. สิ่งที่แก้ไขเพื่อให้ระบบกลับมาใช้งานได้

แนวทางแก้ที่ใช้ไม่ได้พยายาม refactor ทั้งระบบทันที แต่เน้นทำให้ production login กลับมาใช้งานได้ก่อน

สิ่งที่เปลี่ยนหลัก ๆ มีดังนี้

1. เปลี่ยน route admin login ให้คุยกับฐานข้อมูลโดยตรงผ่าน `pg Client` สำหรับเส้นทาง login นี้
2. ลดการพึ่ง Prisma ในจุดที่ production พังบ่อย
3. ตอนสร้าง session ส่งค่า `id` แบบ UUID เข้าไปอย่างชัดเจน
4. เก็บการตรวจ role/permission ไว้เหมือนเดิม
5. เพิ่ม retry สำหรับ error DB ชั่วคราวบางประเภท

ผลคือ login flow กลายเป็น

1. หา user จาก `login_users`
2. เช็ก password hash
3. ตรวจ permission
4. สร้าง row ใน `auth_sessions` โดยใส่ `id` เอง
5. คืน `session_token` กลับให้ frontend

## 8. ผลลัพธ์หลัง hotfix

หลัง deploy hotfix แล้ว ได้ผลลัพธ์ที่สอดคล้องกับสิ่งที่ระบบควรทำ

1. รหัสผิด -> `401 INVALID_CREDENTIALS`
2. รหัสถูก -> `200 success`
3. ผู้ใช้สามารถเข้าเว็บจริงได้อีกครั้ง

deployment ที่ยืนยันใช้งานได้:

1. Commit: `2eb37ba`
2. Branch: `hotfix/login-db-pool`
3. Production Worker Version: `d77e8848-0132-48ca-97bc-2f3de3bc0c3c`

## 9. สาเหตุหลักที่ทำให้ login ไม่ได้ สรุปรวมอีกครั้ง

ถ้าจะสรุปเฉพาะ “เหตุผลที่ทำให้ผู้ใช้ login ไม่ได้” ให้ตรงที่สุด มี 4 ข้อ

1. production domain เคยชี้ไม่ตรง deployment ที่ต้องการ เพราะ DNS conflict
2. code ที่ deploy กับ schema ของ production DB ไม่ตรงกัน
3. ตาราง `auth_sessions` บังคับ `id` แต่โค้ดเดิมไม่ส่งค่า ทำให้สร้าง session ไม่สำเร็จ
4. Prisma/connection flow เดิมไม่เสถียรพอใน Cloudflare Workers + production DB environment

ทั้ง 4 ข้อนี้รวมกันทำให้เกิดอาการว่า “ใส่รหัสถูกแล้วก็ยังเข้าไม่ได้”

## 10. บทเรียนและสิ่งที่ควรทำต่อ

incident นี้ปิดได้ด้วย hotfix แล้ว แต่ยังมีบทเรียนสำคัญที่ควรทำต่อเพื่อป้องกันปัญหาซ้ำ

1. ทำให้ schema ของ production DB กับ Prisma schema ใน repo ตรงกันจริง
2. สร้าง migration ที่ชัดเจนสำหรับตาราง auth และ session
3. ตรวจทุก custom domain/DNS record หลัง deploy เพื่อกัน routing conflict
4. แยก critical auth path ออกจากส่วนที่เปราะต่อ runtime ให้มากที่สุด
5. เพิ่ม health check และ structured logging สำหรับ `/api/admin/login`
6. ทดสอบ production-like environment ก่อน deploy route ที่แตะ auth/session

## 11. Final Conclusion

ปัญหานี้ไม่ใช่ bug จุดเดียว แต่เป็น incident ที่เกิดจาก `deployment routing + database schema drift + session table constraint + runtime connection instability` พร้อมกัน

สิ่งที่ทำให้ผู้ใช้เข้าใจว่าระบบ “เช็ครหัสผิด” จริง ๆ แล้วคือระบบล้มหลังผ่านการยืนยันตัวตนไปแล้ว โดยเฉพาะตอน query เพิ่มเติมและตอนสร้าง session

หลังเปลี่ยน admin login ให้ใช้เส้นทางที่ตรงและเสถียรกว่า พร้อมใส่ UUID ให้ `auth_sessions.id` อย่างชัดเจน ระบบจึงกลับมา login ได้บนเว็บจริงอีกครั้ง
