import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";

import {
  DEFAULT_LANG,
  getLocaleTag,
  LANGUAGE_COOKIE_MAX_AGE,
  LANGUAGE_COOKIE_NAME,
  LANGUAGE_STORAGE_KEY,
  type LangCode,
  isLangCode,
  parseLangCode,
} from "~/lib/i18n.shared";

type TranslationEntry = Record<LangCode, string>;

type I18nContextValue = {
  lang: LangCode;
  locale: string;
  setLang: (next: LangCode) => void;
  tLiteral: (value: string) => string;
  formatNumber: (value: number, options?: Intl.NumberFormatOptions) => string;
  formatDate: (value: Date | number | string, options?: Intl.DateTimeFormatOptions) => string;
  formatDateTime: (value: Date | number | string, options?: Intl.DateTimeFormatOptions) => string;
};

type OriginalTextRecord = {
  original: string;
  translated: string;
};

type PatternTranslator = {
  regex: RegExp;
  translate: (match: RegExpMatchArray, lang: LangCode) => string;
};

const LITERAL_ENTRIES: TranslationEntry[] = [
  { th: "พนักงาน", en: "Employee", lo: "ພະນັກງານ" },
  { th: "เข้า", en: "Check in", lo: "ເຂົ້າວຽກ" },
  { th: "ทำงาน/เดือน", en: "Work days / month", lo: "ມື້ເຮັດວຽກ / ເດືອນ" },
  { th: "กะกลางคืน", en: "Night shift", lo: "ກະກາງຄືນ" },
  { th: "OT สะสม", en: "Accumulated OT", lo: "OT ສະສົມ" },
  { th: "หลัก", en: "Main navigation", lo: "ເມນູຫຼັກ" },
  { th: "หน้าหลัก", en: "Home", lo: "ໜ້າຫຼັກ" },
  { th: "สแกน", en: "Scan", lo: "ສະແກນ" },
  { th: "คำขอ", en: "Requests", lo: "ຄຳຂໍ" },
  { th: "โปรไฟล์", en: "Profile", lo: "ໂປຣໄຟລ໌" },
  { th: "Forgot Password", en: "Forgot Password", lo: "ລືມລະຫັດຜ່ານ" },
  { th: "Verify", en: "Verify", lo: "ກວດສອບ" },
  { th: "Verifying...", en: "Verifying...", lo: "ກຳລັງກວດສອບ..." },
  { th: "Reset Password", en: "Reset Password", lo: "ຣີເຊັດລະຫັດຜ່ານ" },
  { th: "Saving...", en: "Saving...", lo: "ກຳລັງບັນທຶກ..." },
  { th: "Back to dashboard", en: "Back to dashboard", lo: "ກັບໄປ dashboard" },
  { th: "Set Password", en: "Set Password", lo: "ຕັ້ງລະຫັດຜ່ານ" },
  { th: "Activate Account", en: "Activate Account", lo: "ເປີດໃຊ້ບັນຊີ" },
  { th: "Activating...", en: "Activating...", lo: "ກຳລັງເປີດໃຊ້..." },
  { th: "Sign in", en: "Sign in", lo: "ເຂົ້າລະບົບ" },
  { th: "Employee Login", en: "Employee Login", lo: "ເຂົ້າລະບົບພະນັກງານ" },
  { th: "Employee ID", en: "Employee ID", lo: "ລະຫັດພະນັກງານ" },
  { th: "Password", en: "Password", lo: "ລະຫັດຜ່ານ" },
  { th: "Current Password", en: "Current Password", lo: "ລະຫັດຜ່ານປັດຈຸບັນ" },
  { th: "New Password", en: "New Password", lo: "ລະຫັດຜ່ານໃໝ່" },
  { th: "Confirm Password", en: "Confirm Password", lo: "ຢືນຢັນລະຫັດຜ່ານ" },
  { th: "Date of Birth", en: "Date of Birth", lo: "ວັນເກີດ" },
  { th: "Start Month", en: "Start Month", lo: "ເດືອນເລີ່ມວຽກ" },
  { th: "Start Year", en: "Start Year", lo: "ປີເລີ່ມວຽກ" },
  { th: "Select month", en: "Select month", lo: "ເລືອກເດືອນ" },
  { th: "Select year", en: "Select year", lo: "ເລືອກປີ" },
  { th: "Back to login", en: "Back to login", lo: "ກັບໄປໜ້າເຂົ້າລະບົບ" },
  { th: "Day Work Summary", en: "Day Work Summary", lo: "ສະຫຼຸບວຽກປະຈຳເດືອນ" },
  { th: "Year", en: "Year", lo: "ປີ" },
  { th: "Month", en: "Month", lo: "ເດືອນ" },
  { th: "View summary", en: "View summary", lo: "ເບິ່ງສະຫຼຸບ" },
  { th: "Error", en: "Error", lo: "ຂໍ້ຜິດພາດ" },
  { th: "Back", en: "Back", lo: "ກັບ" },
  { th: "Home", en: "Home", lo: "ໜ້າຫຼັກ" },
  { th: "No data found", en: "No data found", lo: "ບໍ່ພົບຂໍ້ມູນ" },
  { th: "Employee Information", en: "Employee Information", lo: "ຂໍ້ມູນພະນັກງານ" },
  { th: "Employee ID:", en: "Employee ID:", lo: "ລະຫັດພະນັກງານ:" },
  { th: "Name:", en: "Name:", lo: "ຊື່:" },
  { th: "Position:", en: "Position:", lo: "ຕຳແໜ່ງ:" },
  { th: "Department:", en: "Department:", lo: "ພະແນກ:" },
  { th: "Work location:", en: "Work location:", lo: "ສະຖານທີ່ເຮັດວຽກ:" },
  { th: "Day Work Result", en: "Day Work Result", lo: "ຜົນສະຫຼຸບການເຮັດວຽກ" },
  { th: "คำขอของฉัน", en: "My Requests", lo: "ຄຳຂໍຂອງຂ້ອຍ" },
  { th: "ยื่นคำขอและติดตามสถานะได้ในที่เดียว", en: "Submit requests and track statuses in one place", lo: "ສົ່ງຄຳຂໍ ແລະ ຕິດຕາມສະຖານະໄດ້ໃນບ່ອນດຽວ" },
  { th: "ลาพักร้อน/ป่วย/กิจ", en: "Leave / Sick / Personal", lo: "ລາພັກ / ລາປ່ວຍ / ລາກິດ" },
  { th: "ยื่นคำขอลาและแนบเอกสาร", en: "Submit leave requests with attachments", lo: "ສົ່ງຄຳຂໍລາພ້ອມແນບເອກະສານ" },
  { th: "ขอ OT", en: "OT Request", lo: "ຂໍ OT" },
  { th: "ยื่นคำขอทำงานล่วงเวลา", en: "Submit overtime requests", lo: "ສົ່ງຄຳຂໍເຮັດ OT" },
  { th: "แก้ไขเวลา", en: "Time Correction", lo: "ແກ້ໄຂເວລາ" },
  { th: "แจ้งแก้ไขเวลาสแกนที่ผิดพลาด", en: "Request scan time corrections", lo: "ແຈ້ງແກ້ໄຂເວລາສະແກນທີ່ຜິດພາດ" },
  { th: "รายการคำขอ", en: "Request List", lo: "ລາຍການຄຳຂໍ" },
  { th: "ทุกประเภท", en: "All types", lo: "ທຸກປະເພດ" },
  { th: "ลา", en: "Leave", lo: "ລາ" },
  { th: "ทุกสถานะ", en: "All statuses", lo: "ທຸກສະຖານະ" },
  { th: "รออนุมัติ", en: "Pending approval", lo: "ລໍອະນຸມັດ" },
  { th: "กำลังโหลด...", en: "Loading...", lo: "ກຳລັງໂຫຼດ..." },
  { th: "ไม่มีข้อมูลคำขอ", en: "No request data", lo: "ບໍ່ມີຂໍ້ມູນຄຳຂໍ" },
  { th: "วันที่ยื่น:", en: "Submitted:", lo: "ວັນທີສົ່ງ:" },
  { th: "ดูรายละเอียด →", en: "View details →", lo: "ເບິ່ງລາຍລະອຽດ →" },
  { th: "รอดำเนินการ", en: "In progress", lo: "ລໍດຳເນີນການ" },
  { th: "ไม่อนุมัติ", en: "Rejected", lo: "ບໍ່ອະນຸມັດ" },
  { th: "← กลับ Dashboard", en: "← Back to Dashboard", lo: "← ກັບໄປ Dashboard" },
  { th: "ขออนุมัติการลา", en: "Create request", lo: "ສ້າງຄຳຂໍໃໝ່" },
  { th: "ขอลา", en: "Leave Request", lo: "ຂໍລາ" },
  { th: "ยื่นคำขอลาพักร้อน ลาป่วย ลากิจ", en: "Submit vacation, sick, or personal leave", lo: "ສົ່ງຄຳຂໍລາພັກ ລາປ່ວຍ ຫຼື ລາກິດ" },
  { th: "ประเภทการลา", en: "Leave type", lo: "ປະເພດການລາ" },
  { th: "คงเหลือ:", en: "Remaining:", lo: "ຄົງເຫຼືອ:" },
  { th: "ใช้ไปแล้ว:", en: "Used:", lo: "ໃຊ້ໄປແລ້ວ:" },
  { th: "วันเริ่มลา", en: "Leave start date", lo: "ວັນເລີ່ມລາ" },
  { th: "วันสิ้นสุดการลา", en: "Leave end date", lo: "ວັນສິ້ນສຸດການລາ" },
  { th: "จำนวนวันลา:", en: "Leave days:", lo: "ຈຳນວນວັນລາ:" },
  { th: "เหตุผล", en: "Reason", lo: "ເຫດຜົນ" },
  { th: "ไฟล์แนบ (ไม่บังคับ)", en: "Attachment (optional)", lo: "ໄຟລ໌ແນບ (ບໍ່ບັງຄັບ)" },
  { th: "รองรับ JPG, PNG, WEBP, PDF ขนาดไม่เกิน 5 MB", en: "Supports JPG, PNG, WEBP, PDF up to 5 MB", lo: "ຮອງຮັບ JPG, PNG, WEBP, PDF ສູງສຸດ 5 MB" },
  { th: "อนุญาตเฉพาะ JPG, PNG, WEBP, PDF", en: "Only JPG, PNG, WEBP, PDF are allowed", lo: "ອະນຸຍາດສະເພາະ JPG, PNG, WEBP, PDF" },
  { th: "ไฟล์ต้องไม่เกิน 5 MB", en: "File size must be 5 MB or less", lo: "ໄຟລ໌ຕ້ອງບໍ່ເກີນ 5 MB" },
  { th: "กำลังอัปโหลดไฟล์...", en: "Uploading file...", lo: "ກຳລັງອັບໂຫຼດໄຟລ໌..." },
  { th: "ยื่นคำขอลาสำเร็จ", en: "Leave request submitted successfully", lo: "ສົ່ງຄຳຂໍລາສຳເລັດ" },
  { th: "ยกเลิกคำขอลาสำเร็จ", en: "Leave request cancelled successfully", lo: "ຍົກເລີກຄຳຂໍລາສຳເລັດ" },
  { th: "ยื่นคำขอ", en: "Submit request", lo: "ສົ່ງຄຳຂໍ" },
  { th: "ประวัติการขอลา", en: "Leave history", lo: "ປະຫວັດການລາ" },
  { th: "ไม่มีข้อมูล", en: "No data", lo: "ບໍ່ມີຂໍ້ມູນ" },
  { th: "สถานะ:", en: "Status:", lo: "ສະຖານະ:" },
  { th: "ยกเลิก", en: "Cancel", lo: "ຍົກເລີກ" },
  { th: "OT ปกติ", en: "Normal OT", lo: "OT ປົກກະຕິ" },
  { th: "OT วันหยุด", en: "Holiday OT", lo: "OT ວັນພັກ" },
  { th: "OT พิเศษ", en: "Special OT", lo: "OT ພິເສດ" },
  { th: "⚡ ขอ OT", en: "⚡ OT Request", lo: "⚡ ຂໍ OT" },
  { th: "กรอกข้อมูล OT", en: "OT request form", lo: "ຟອມຂໍ OT" },
  { th: "ประเภท OT", en: "OT type", lo: "ປະເພດ OT" },
  { th: "วันที่", en: "Date", lo: "ວັນທີ" },
  { th: "อัตราค่าแรง", en: "Rate multiplier", lo: "ອັດຕາຄ່າແຮງ" },
  { th: "เวลาเริ่ม", en: "Start time", lo: "ເວລາເລີ່ມ" },
  { th: "เวลาสิ้นสุด", en: "End time", lo: "ເວລາສິ້ນສຸດ" },
  { th: "รวมชั่วโมง", en: "Total hours", lo: "ລວມຊົ່ວໂມງ" },
  { th: "(ข้ามคืน)", en: "(overnight)", lo: "(ຂ້າມຄືນ)" },
  { th: "เหตุผล (อย่างน้อย 20 ตัวอักษร)", en: "Reason (minimum 20 characters)", lo: "ເຫດຜົນ (ຢ່າງນ້ອຍ 20 ຕົວອັກສອນ)" },
  { th: "Project Ref (ไม่บังคับ)", en: "Project Ref (optional)", lo: "Project Ref (ບໍ່ບັງຄັບ)" },
  { th: "⚠️ มีคำขอ OT ในวันที่เลือกแล้ว", en: "⚠️ An OT request already exists for this date", lo: "⚠️ ມີຄຳຂໍ OT ສຳລັບວັນນີ້ແລ້ວ" },
  { th: "❌ วันที่เลือกมีคำขอลาอยู่ ไม่สามารถยื่น OT ได้", en: "❌ Leave already exists on this date, so OT cannot be requested", lo: "❌ ວັນທີເລືອກມີຄຳຂໍລາແລ້ວ ຈຶ່ງຂໍ OT ບໍ່ໄດ້" },
  { th: "ยื่นคำขอ OT สำเร็จ", en: "OT request submitted successfully", lo: "ສົ່ງຄຳຂໍ OT ສຳເລັດ" },
  { th: "มีคำขอ OT วันนี้แล้ว", en: "An OT request already exists for today", lo: "ມີຄຳຂໍ OT ສຳລັບມື້ນີ້ແລ້ວ" },
  { th: "วันนั้นมีคำขอลาอยู่", en: "There is a leave request on that date", lo: "ວັນນັ້ນມີຄຳຂໍລາຢູ່" },
  { th: "กรุณาระบุเหตุผลอย่างน้อย 20 ตัวอักษร", en: "Please provide at least 20 characters for the reason", lo: "ກະລຸນາລະບຸເຫດຜົນຢ່າງນ້ອຍ 20 ຕົວອັກສອນ" },
  { th: "ประวัติคำขอ OT ของฉัน", en: "My OT request history", lo: "ປະຫວັດຄຳຂໍ OT ຂອງຂ້ອຍ" },
  { th: "⏱️ แก้ไขเวลา", en: "⏱️ Time Correction", lo: "⏱️ ແກ້ໄຂເວລາ" },
  { th: "แจ้งแก้ไขเวลาสแกนที่ผิดพลาดหรือลืมสแกน", en: "Request corrections for missed or incorrect scan times", lo: "ແຈ້ງແກ້ໄຂເວລາສະແກນທີ່ຜິດ ຫຼື ລືມສະແກນ" },
  { th: "ประเภทการแก้ไข", en: "Correction type", lo: "ປະເພດການແກ້ໄຂ" },
  { th: "ลืมสแกนเข้า", en: "Forgot scan-in", lo: "ລືມສະແກນເຂົ້າ" },
  { th: "ลืมสแกนออก", en: "Forgot scan-out", lo: "ລືມສະແກນອອກ" },
  { th: "ลืมทั้งเข้าและออก", en: "Forgot both in and out", lo: "ລືມທັງເຂົ້າແລະອອກ" },
  { th: "เวลาเข้า (จริง)", en: "Actual scan-in time", lo: "ເວລາເຂົ້າ (ຈິງ)" },
  { th: "เวลาออก (จริง)", en: "Actual scan-out time", lo: "ເວລາອອກ (ຈິງ)" },
  { th: "ยื่นคำขอแก้ไขเวลาสำเร็จ", en: "Time correction request submitted successfully", lo: "ສົ່ງຄຳຂໍແກ້ໄຂເວລາສຳເລັດ" },
  { th: "ประวัติคำขอแก้ไขเวลา", en: "Time correction history", lo: "ປະຫວັດຄຳຂໍແກ້ໄຂເວລາ" },
  { th: "เวลาเข้า:", en: "Scan in:", lo: "ເວລາເຂົ້າ:" },
  { th: "/ เวลาออก:", en: "/ Scan out:", lo: "/ ເວລາອອກ:" },
  { th: "Work days", en: "Work days", lo: "ມື້ເຮັດວຽກ" },
  { th: "Sick leave", en: "Sick leave", lo: "ລາປ່ວຍ" },
  { th: "Personal leave", en: "Personal leave", lo: "ລາກິດ" },
  { th: "Annual leave", en: "Annual leave", lo: "ລາພັກປະຈຳປີ" },
  { th: "Unpaid leave", en: "Unpaid leave", lo: "ລາບໍ່ຮັບຄ່າຈ້າງ" },
  { th: "No scan", en: "No scan", lo: "ບໍ່ສະແກນ" },
  { th: "Rest days", en: "Rest days", lo: "ມື້ພັກ" },
  { th: "Official off", en: "Official off", lo: "ວັນພັກທາງການ" },
  { th: "Night shift", en: "Night shift", lo: "ກະກາງຄືນ" },
  { th: "Attendance metrics", en: "Attendance metrics", lo: "ຕົວຊີ້ວັດການເຂົ້າວຽກ" },
  { th: "Attendance rate", en: "Attendance rate", lo: "ອັດຕາເຂົ້າວຽກ" },
  { th: "Total leave", en: "Total leave", lo: "ລາລວມ" },
  { th: "Total unpaid", en: "Total unpaid", lo: "ລາບໍ່ຮັບຄ່າຈ້າງລວມ" },
  { th: "Total paid days", en: "Total paid days", lo: "ມື້ຈ່າຍຄ່າຈ້າງລວມ" },
  { th: "ADMIN PANEL", en: "ADMIN PANEL", lo: "ແຜງຜູ້ບໍລິຫານ" },
  { th: "HR", en: "HR", lo: "HR" },
  { th: "ขออนุมัติ", en: "WORKFLOW", lo: "ການອະນຸມັດ" },
  { th: "ภาพรวม", en: "OVERVIEW", lo: "ພາບລວມ" },
  { th: "บุคลากร", en: "PEOPLE", lo: "ພະນັກງານ" },
  { th: "เงินเดือน", en: "PAYROLL", lo: "ເງິນເດືອນ" },
  { th: "ความปลอดภัย", en: "SECURITY", lo: "ຄວາມປອດໄພ" },
  { th: "ตั้งค่า", en: "SETTINGS", lo: "ຕັ້ງຄ່າ" },
  { th: "หน้าหลัก", en: "Dashboard", lo: "ແດຊບອດ" },
  { th: "ทะเบียนลูกจ้าง", en: "Employees", lo: "ພະນັກງານ" },
  { th: "การเข้างานและการลา", en: "Attendance", lo: "ການເຂົ້າວຽກ" },
  { th: "คำขออนุมัติ (ลา)", en: "Requests", lo: "ຄຳຂໍ" },
  { th: "การสรรหาพนักงาน", en: "Recruitment", lo: "ສະຫາພະນັກງານ" },
  { th: "แรงงานสัมพันธ์", en: "HR-ER", lo: "HR-ER" },
  { th: "รอบประมวลผลเงินเดือน", en: "Salary Run", lo: "ຮອບຄິດເງິນເດືອນ" },
  { th: "รอบประมวลผล OT", en: "OT Run", lo: "ຮອບຄິດ OT" },
  { th: "สลิปเงินเดือน", en: "Pay Slips", lo: "ໃບສະຫຼຸບຈ່າຍ" },
  { th: "ประวัติ", en: "History", lo: "ປະຫວັດ" },
  { th: "อุปกรณ์", en: "Devices", lo: "ອຸປະກອນ" },
  { th: "บันทึกตรวจสอบ", en: "Audit Logs", lo: "ບັນທຶກການກວດສອບ" },
  { th: "สถานที่ทำงาน", en: "Work Sites", lo: "ສະຖານທີ່ເຮັດວຽກ" },
  { th: "นโยบายค่าจ้าง", en: "Pay Policy", lo: "ນະໂຍບາຍຄ່າຈ້າງ" },
  { th: "กะงาน", en: "Shifts", lo: "ກະ" },
  { th: "รายการหัก", en: "Deductions", lo: "ລາຍການຫັກ" },
  { th: "บัญชีแอดมิน", en: "Admin Accs", lo: "ບັນຊີແອດມິນ" },
  { th: "TD One ERP", en: "TD One ERP", lo: "TD One ERP" },
  { th: "ออกจากระบบ", en: "Logout", lo: "ອອກຈາກລະບົບ" },
  { th: "รายการสแกนเข้างานที่ถูกแจ้งเตือน", en: "Flagged Attendance Scans", lo: "ການສະແກນເຂົ້າວຽກທີ່ຖືກທຸງເຕືອນ" },
  { th: "กิจกรรมล่าสุด", en: "Recent Activity", lo: "ກິດຈະກຳຫຼ້າສຸດ" },
  { th: "พนักงาน", en: "EMPLOYEE", lo: "ພະນັກງານ" },
  { th: "เวลา", en: "TIME", lo: "ເວລາ" },
  { th: "คะแนน", en: "SCORE", lo: "ຄະແນນ" },
  { th: "สัญญาณเตือน", en: "FLAGS", lo: "ສັນຍານເຕືອນ" },
  { th: "การดำเนินการ", en: "ACTION", lo: "ການດຳເນີນການ" },
  { th: "ชื่อ", en: "NAME", lo: "ຊື່" },
  { th: "สถานะ", en: "STATUS", lo: "ສະຖານະ" },
  { th: "วันที่", en: "DATE", lo: "ວັນທີ" },
  { th: "อนุมัติ", en: "Approve", lo: "ອະນຸມັດ" },
  { th: "ปฏิเสธ", en: "Reject", lo: "ປະຕິເສດ" },
  { th: "ไม่มีรายการสแกนที่รอตรวจสอบ", en: "No flagged scans awaiting review", lo: "ບໍ່ມີລາຍການລໍຖ້າກວດສອບ" },
  { th: "ไม่มีกิจกรรมล่าสุด", en: "No recent activity", lo: "ບໍ່ມີກິດຈະກຳຫຼ້າສຸດ" },
  { th: "ทุกประเภท", en: "All Types", lo: "ທຸກປະເພດ" },
  { th: "ลา", en: "Leave", lo: "ລາ" },
  { th: "แก้ไขเวลา", en: "Time Correction", lo: "ແກ້ໄຂເວລາ" },
  { th: "ทุกสถานะ", en: "All Status", lo: "ທຸກສະຖານະ" },
  { th: "รออนุมัติ", en: "Pending", lo: "ລໍຖ້າ" },
  { th: "อนุมัติแล้ว", en: "Approved", lo: "ອະນຸມັດແລ້ວ" },
  { th: "ไม่อนุมัติ", en: "Rejected", lo: "ບໍ່ອະນຸມັດ" },
  { th: "ยกเลิก", en: "Cancelled", lo: "ຍົກເລີກ" },
  { th: "รหัสพนักงาน", en: "EMP", lo: "ພນ" },
  { th: "ประเภท", en: "TYPE", lo: "ປະເພດ" },
  { th: "รายละเอียด", en: "DETAILS", lo: "ລາຍລະອຽດ" },
  { th: "การดำเนินการ", en: "ACTIONS", lo: "ຄຳສັ່ງ" },
  { th: "ปฏิเสธคำขอ", en: "Reject Request", lo: "ປະຕິເສດຄຳຂໍ" },
  { th: "เหตุผลที่ปฏิเสธ (ไม่บังคับ)", en: "Rejection reason (optional)", lo: "ເຫດຜົນການປະຕິເສດ (ຖ້າມີ)" },
  { th: "ยกเลิก", en: "Cancel", lo: "ຍົກເລີກ" },
  { th: "ยืนยันการปฏิเสธ", en: "Confirm Reject", lo: "ຢືນຢັນປະຕິເສດ" },
  { th: "กำลังปฏิเสธ…", en: "Rejecting…", lo: "ກຳລັງປະຕິເສດ…" },
  { th: "ไม่พบคำขอ", en: "No requests found", lo: "ບໍ່ພົບຄຳຂໍ" },
  { th: "ตั้งค่าเงินเดือนพนักงาน", en: "Employee Payroll Settings", lo: "ຕັ້ງຄ່າເງິນເດືອນພະນັກງານ" },
  { th: "+ เพิ่มพนักงาน", en: "+ Add Employee", lo: "+ ເພີ່ມພະນັກງານ" },
  { th: "รหัสพนักงาน", en: "EMP CODE", lo: "ລະຫັດພະນັກງານ" },
  { th: "ประเภทค่าจ้าง", en: "PAY TYPE", lo: "ປະເພດຄ່າຈ້າງ" },
  { th: "อัตรา", en: "RATE", lo: "ອັດຕາ" },
  { th: "สถานที่ทำงาน", en: "WORK SITE", lo: "ສະຖານທີ່ເຮັດວຽກ" },
  { th: "ยังไม่มีข้อมูลพนักงาน กด \"Add Employee\" เพื่อเริ่ม", en: "No employee data — click \"Add Employee\" to start", lo: "ຍັງບໍ່ມີຂໍ້ມູນພະນັກງານ ກົດ \"Add Employee\" ເພື່ອເລີ່ມ" },
  { th: "แก้ไข", en: "Edit", lo: "ແກ້ໄຂ" },
  { th: "แก้ไขพนักงาน", en: "Edit Employee", lo: "ແກ້ໄຂພະນັກງານ" },
  { th: "เพิ่มพนักงาน", en: "Add Employee", lo: "ເພີ່ມພະນັກງານ" },
  { th: "รหัสพนักงาน *", en: "Employee Code *", lo: "ລະຫັດພະນັກງານ *" },
  { th: "ประเภทค่าจ้าง *", en: "Pay Type *", lo: "ປະເພດຄ່າຈ້າງ *" },
  { th: "เงินเดือนรายเดือน", en: "Monthly Salary", lo: "ເງິນເດືອນປະຈຳ" },
  { th: "อัตรารายวัน", en: "Daily Rate", lo: "ອັດຕາລາຍວັນ" },
  { th: "เงินเดือนพื้นฐาน (₭/เดือน) *", en: "Base Salary (₭/month) *", lo: "ເງິນເດືອນພື້ນຖານ (₭/ເດືອນ) *" },
  { th: "อัตรารายวัน (₭/วัน) *", en: "Daily Rate (₭/day) *", lo: "ອັດຕາລາຍວັນ (₭/ວັນ) *" },
  { th: "สถานที่ทำงาน", en: "Work Site", lo: "ສະຖານທີ່ເຮັດວຽກ" },
  { th: "— ไม่มี —", en: "— None —", lo: "— ບໍ່ມີ —" },
  { th: "ธนาคาร", en: "Bank Name", lo: "ຊື່ທະນາຄານ" },
  { th: "เลขที่บัญชี", en: "Account No.", lo: "ເລກບັນຊີ" },
  { th: "บันทึก", en: "Save", lo: "ບັນທຶກ" },
  { th: "เครือข่ายผิดพลาด", en: "Network error", lo: "ເຄືອຂ່າຍຜິດພາດ" },
  { th: "บันทึกล้มเหลว", en: "Save failed", lo: "ບັນທຶກບໍ່ສຳເລັດ" },
  { th: "กำลังบันทึก…", en: "Saving…", lo: "ກຳລັງບັນທຶກ…" },
  { th: "API สถานที่ทำงาน", en: "Work locations API", lo: "API ສະຖານທີ່ເຮັດວຽກ" },
  { th: "API บันทึกการรีเซ็ตรหัสผ่าน", en: "Password reset audit API", lo: "API ບັນທຶກການຣີເຊັດລະຫັດຜ່ານ" },
  { th: "เครื่องมือรีเซ็ตรหัสผ่าน", en: "Password reset tools", lo: "ເຄື່ອງມືຣີເຊັດລະຫັດຜ່ານ" },
  { th: "API รีเซ็ตอุปกรณ์", en: "Reset device API", lo: "API ຣີເຊັດອຸປະກອນ" },
  { th: "พอร์ทัลผู้ดูแลระบบ", en: "Admin Portal", lo: "ພອດທອນຜູ້ບໍລິຫານ" },
  { th: "บทบาท:", en: "Role:", lo: "ບົດບາດ:" },
  { th: "ผู้ดูแล", en: "Admin", lo: "ແອດມິນ" },
  { th: "ไม่มีสิทธิ์", en: "FORBIDDEN", lo: "ບໍ່ອະນຸຍາດ" },
  { th: "ไม่มีข้อมูลการเข้างาน", en: "No attendance data", lo: "ບໍ່ມີຂໍ້ມູນການເຂົ້າວຽກ" },
  { th: "ไม่มีบันทึก audit", en: "No audit entries", lo: "ບໍ່ມີລາຍການ audit" },
  { th: "ไม่พบอุปกรณ์", en: "No devices found", lo: "ບໍ່ພົບອຸປະກອນ" },
  { th: "รายการเข้างานวันนี้", en: "Today Attendance Records", lo: "ລາຍການເຂົ້າວຽກມື້ນີ້" },
  { th: "รีเซ็ตรหัสผ่าน / ตรวจสอบแอดมิน", en: "Password Reset / Admin Audit", lo: "ຣີເຊັດລະຫັດຜ່ານ / Audit ແອດມິນ" },
  { th: "โหลดอุปกรณ์", en: "Load Devices", lo: "ໂຫຼດອຸປະກອນ" },
  { th: "ปิดการใช้งานอุปกรณ์ทั้งหมด", en: "Deactivate All Devices", lo: "ປິດການໃຊ້ງານອຸປະກອນທັງໝົດ" },
  { th: "รีเฟรชรายการ", en: "Refresh List", lo: "ໂຫຼດລາຍການໃໝ່" },
  { th: "เช็กอินวันนี้", en: "Today Checked In", lo: "ເຂົ້າວຽກມື້ນີ້" },
  { th: "เช็กอินแล้ว", en: "CHECKED IN", lo: "ເຂົ້າວຽກແລ້ວ" },
  { th: "คำขอรออนุมัติ", en: "PENDING REQUESTS", lo: "ຄຳຂໍລໍຖ້າອະນຸມັດ" },
  { th: "การแจ้งเตือน", en: "ALERTS", lo: "ການເຕືອນ" },
  { th: "พนักงาน", en: "EMPLOYEES", lo: "ພະນັກງານ" },
  { th: "อัปเดตผลการตรวจสอบไม่สำเร็จ", en: "Failed to update scan review", lo: "ອັບເດດຜົນການກວດສອບບໍ່ສຳເລັດ" },
  { th: "รหัสพนักงาน", en: "EMP ID", lo: "ລະຫັດພະນັກງານ" },
  { th: "เวลาเข้า", en: "CHECK IN", lo: "ເວລາເຂົ້າ" },
  { th: "เวลาออก", en: "CHECK OUT", lo: "ເວລາອອກ" },
  { th: "ข้อมูลคำสั่งไม่ครบถ้วน", en: "Missing required action payload.", lo: "ຂໍ້ມູນຄຳສັ່ງບໍ່ຄົບ" },
  { th: "ต้องระบุ Device ID เพื่อปิดการใช้งาน", en: "Device ID is required for deactivation.", lo: "ຕ້ອງລະບຸ Device ID ເພື່ອປິດການໃຊ້ງານ" },
  { th: "ต้องระบุเหตุผล", en: "Reason is required.", lo: "ຕ້ອງລະບຸເຫດຜົນ" },
  { th: "ดำเนินการไม่สำเร็จ", en: "Action failed.", lo: "ດຳເນີນການບໍ່ສຳເລັດ" },
  { th: "ปิดการใช้งานอุปกรณ์ทั้งหมดแล้ว", en: "All devices deactivated.", lo: "ປິດການໃຊ້ງານອຸປະກອນທັງໝົດແລ້ວ" },
  { th: "ปิดการใช้งานอุปกรณ์แล้ว", en: "Device deactivated.", lo: "ປິດການໃຊ້ງານອຸປະກອນແລ້ວ" },
  { th: "ต้องการปิดการใช้งานอุปกรณ์ทั้งหมดของพนักงานคนนี้หรือไม่?", en: "Deactivate all devices for this employee?", lo: "ຕ້ອງການປິດການໃຊ້ງານອຸປະກອນທັງໝົດຂອງພະນັກງານຄົນນີ້ບໍ?" },
  { th: "รีเฟรช", en: "Refresh", lo: "ໂຫຼດໃໝ່" },
  { th: "เหตุผล (ทุกอุปกรณ์)", en: "Reason (all devices)", lo: "ເຫດຜົນ (ທຸກອຸປະກອນ)" },
  { th: "เช่น โทรศัพท์หาย / เหตุการณ์ด้านความปลอดภัย", en: "e.g. lost phone / security incident", lo: "ເຊັ່ນ ໂທລະສັບຫາຍ / ເຫດການດ້ານຄວາມປອດໄພ" },
  { th: "อุปกรณ์ที่ลงทะเบียน", en: "Registered Devices", lo: "ອຸປະກອນທີ່ລົງທະບຽນ" },
  { th: "รหัสอุปกรณ์", en: "DEVICE ID", lo: "ລະຫັດອຸປະກອນ" },
  { th: "ชื่ออุปกรณ์", en: "DEVICE NAME", lo: "ຊື່ອຸປະກອນ" },
  { th: "แพลตฟอร์ม", en: "PLATFORM", lo: "ແພລດຟອມ" },
  { th: "ใช้งานล่าสุด", en: "LAST ACTIVE", lo: "ໃຊ້ງານຫຼ້າສຸດ" },
  { th: "ใช้งานอยู่", en: "Active", lo: "ກຳລັງໃຊ້ງານ" },
  { th: "ไม่ได้ใช้งาน", en: "Inactive", lo: "ບໍ່ໄດ້ໃຊ້ງານ" },
  { th: "ปิดการใช้งาน", en: "Deactivate", lo: "ປິດການໃຊ້ງານ" },
  { th: "รอบเงินเดือน", en: "Salary Runs", lo: "ຮອບເງິນເດືອນ" },
  { th: "รอบ OT", en: "OT Runs", lo: "ຮອບ OT" },
  { th: "เทมเพลตรายการหัก", en: "Deduction Templates", lo: "ແມ່ແບບລາຍການຫັກ" },
  { th: "สถานที่ทำงาน", en: "Work Locations", lo: "ສະຖານທີ່ເຮັດວຽກ" },
  { th: "นโยบายค่าจ้างแต่ละไซต์", en: "Site Pay Policies", lo: "ນະໂຍບາຍຄ່າຈ້າງຕາມສະຖານທີ່" },
  { th: "ประเภทกะ", en: "Shift Types", lo: "ປະເພດກະ" },
  { th: "รูปแบบกะ", en: "Shift Patterns", lo: "ຮູບແບບກະ" },
  { th: "Employee account is blocked.", en: "Employee account is blocked.", lo: "ບັນຊີພະນັກງານຖືກລັອກ" },
  { th: "Employee not found.", en: "Employee not found.", lo: "ບໍ່ພົບພະນັກງານ" },
  { th: "Date of birth is incorrect.", en: "Date of birth is incorrect.", lo: "ວັນເກີດບໍ່ຖືກຕ້ອງ" },
  { th: "Password must be at least 12 characters.", en: "Password must be at least 12 characters.", lo: "ລະຫັດຜ່ານຕ້ອງຢ່າງນ້ອຍ 12 ຕົວອັກສອນ" },
  { th: "Password must be 12-128 characters.", en: "Password must be 12-128 characters.", lo: "ລະຫັດຜ່ານຕ້ອງມີ 12-128 ຕົວອັກສອນ" },
  { th: "Password is too simple. Please use a stronger password.", en: "Password is too simple. Please use a stronger password.", lo: "ລະຫັດຜ່ານງ່າຍເກີນໄປ ກະລຸນາໃຊ້ລະຫັດຜ່ານທີ່ແຂງແຮງກວ່າ" },
  { th: "Password must not contain your employee ID.", en: "Password must not contain your employee ID.", lo: "ລະຫັດຜ່ານຫ້າມມີລະຫັດພະນັກງານຂອງທ່ານ" },
  { th: "Password does not match.", en: "Password does not match.", lo: "ລະຫັດຜ່ານບໍ່ກົງກັນ" },
  { th: "Unable to set password.", en: "Unable to set password.", lo: "ບໍ່ສາມາດຕັ້ງລະຫັດຜ່ານໄດ້" },
  { th: "Unable to reset password. Please try again.", en: "Unable to reset password. Please try again.", lo: "ບໍ່ສາມາດຣີເຊັດລະຫັດຜ່ານໄດ້ ກະລຸນາລອງໃໝ່" },
  { th: "Unable to verify information. Please try again.", en: "Unable to verify information. Please try again.", lo: "ບໍ່ສາມາດກວດສອບຂໍ້ມູນໄດ້ ກະລຸນາລອງໃໝ່" },
  { th: "Unable to generate reset token.", en: "Unable to generate reset token.", lo: "ບໍ່ສາມາດສ້າງ reset token ໄດ້" },
  { th: "Token is invalid or expired.", en: "Token is invalid or expired.", lo: "token ບໍ່ຖືກຕ້ອງ ຫຼື ໝົດອາຍຸ" },
  { th: "Reset token is missing or expired.", en: "Reset token is missing or expired.", lo: "reset token ຫາຍໄປ ຫຼື ໝົດອາຍຸ" },
  { th: "Current password is required.", en: "Current password is required.", lo: "ຕ້ອງໃສ່ລະຫັດຜ່ານປັດຈຸບັນ" },
  { th: "Current password is incorrect.", en: "Current password is incorrect.", lo: "ລະຫັດຜ່ານປັດຈຸບັນບໍ່ຖືກຕ້ອງ" },
  { th: "Temporary password expired. Please contact HR.", en: "Temporary password expired. Please contact HR.", lo: "ລະຫັດຜ່ານຊົ່ວຄາວໝົດອາຍຸ ກະລຸນາຕິດຕໍ່ HR" },
  { th: "New password cannot be the same as recent passwords.", en: "New password cannot be the same as recent passwords.", lo: "ລະຫັດຜ່ານໃໝ່ຕ້ອງບໍ່ຊ້ຳກັບລະຫັດຜ່ານຫຼ້າສຸດ" },
  { th: "Unable to change password. Please try again.", en: "Unable to change password. Please try again.", lo: "ບໍ່ສາມາດປ່ຽນລະຫັດຜ່ານໄດ້ ກະລຸນາລອງໃໝ່" },
  { th: "Password set successfully. Redirecting to login...", en: "Password set successfully. Redirecting to login...", lo: "ຕັ້ງລະຫັດຜ່ານສຳເລັດ ກຳລັງກັບໄປໜ້າເຂົ້າລະບົບ..." },
  { th: "Password reset successfully. Redirecting to login...", en: "Password reset successfully. Redirecting to login...", lo: "ຣີເຊັດລະຫັດຜ່ານສຳເລັດ ກຳລັງກັບໄປໜ້າເຂົ້າລະບົບ..." },
  { th: "Min 12 characters. Use mix of letters, numbers, symbols.", en: "Min 12 characters. Use mix of letters, numbers, symbols.", lo: "ຢ່າງນ້ອຍ 12 ຕົວອັກສອນ ໃຫ້ປະສົມຕົວອັກສອນ ຕົວເລກ ແລະ ສັນຍາລັກ" },
  { th: "Confirm password", en: "Confirm password", lo: "ຢືນຢັນລະຫັດຜ່ານ" },
  { th: "12+ characters", en: "12+ characters", lo: "12+ ຕົວອັກສອນ" },
];

const COUNT_PATTERNS = [
  "Requests",
  "Employee Payroll Settings",
  "Registered Devices",
  "Deduction Templates",
  "Work Locations",
  "Salary Runs",
  "OT Runs",
  "Site Pay Policies",
  "Shift Types",
  "Shift Patterns",
];

const exactTranslations = new Map<string, TranslationEntry>();
for (const entry of LITERAL_ENTRIES) {
  exactTranslations.set(entry.th, entry);
  exactTranslations.set(entry.en, entry);
  exactTranslations.set(entry.lo, entry);
}

function translateExact(value: string, lang: LangCode) {
  return exactTranslations.get(value)?.[lang] ?? value;
}

function translateLabeledSegments(value: string, lang: LangCode) {
  const parts = value.split(", ");
  if (parts.length < 2 || !parts.every((part) => part.includes(":"))) {
    return value;
  }

  return parts
    .map((part) => {
      const [label, rest] = part.split(/:\s*/, 2);
      return `${translateExact(`${label}:`, lang).replace(/:$/, "")}: ${rest}`;
    })
    .join(", ");
}

const PATTERN_TRANSLATORS: PatternTranslator[] = [
  ...COUNT_PATTERNS.map<PatternTranslator>((label) => ({
    regex: new RegExp(`^${label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")} \\((.+)\\)$`),
    translate: (match, lang) => `${translateExact(label, lang)} (${match[1]})`,
  })),
  {
    regex: /^Role: (.+)$/,
    translate: (match, lang) => `${translateExact("Role:", lang)} ${match[1]}`,
  },
  {
    regex: /^(.+) ₭\/day$/,
    translate: (match, lang) => `${match[1]} ${lang === "lo" ? "₭/ວັນ" : lang === "th" ? "₭/วัน" : "₭/day"}`,
  },
  {
    regex: /^(.+) ₭\/month$/,
    translate: (match, lang) => `${match[1]} ${lang === "lo" ? "₭/ເດືອນ" : lang === "th" ? "₭/เดือน" : "₭/month"}`,
  },
  {
    regex: /^วันลาคงเหลือไม่พอ \(เหลือ (.+) วัน\)$/,
    translate: (match, lang) =>
      lang === "th"
        ? `วันลาคงเหลือไม่พอ (เหลือ ${match[1]} วัน)`
        : lang === "en"
          ? `Insufficient leave balance (${match[1]} day(s) remaining)`
          : `ຈຳນວນວັນລາຄົງເຫຼືອບໍ່ພຽງພໍ (ເຫຼືອ ${match[1]} ວັນ)`,
  },
  {
    regex: /^(\d+)\/20 ตัวอักษรขั้นต่ำ$/,
    translate: (match, lang) =>
      lang === "th"
        ? `${match[1]}/20 ตัวอักษรขั้นต่ำ`
        : lang === "en"
          ? `${match[1]}/20 minimum characters`
          : `${match[1]}/20 ຕົວອັກສອນຂັ້ນຕ່ຳ`,
  },
];

function translateText(value: string, lang: LangCode) {
  if (!value.trim()) {
    return value;
  }

  const exact = translateExact(value, lang);
  if (exact !== value) {
    return exact;
  }

  const segmentTranslation = translateLabeledSegments(value, lang);
  if (segmentTranslation !== value) {
    return segmentTranslation;
  }

  for (const pattern of PATTERN_TRANSLATORS) {
    const match = value.match(pattern.regex);
    if (match) {
      return pattern.translate(match, lang);
    }
  }

  return value;
}

function setLanguageCookie(lang: LangCode) {
  if (typeof document === "undefined") return;
  const secureFlag = window.location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${LANGUAGE_COOKIE_NAME}=${encodeURIComponent(lang)}; Path=/; Max-Age=${LANGUAGE_COOKIE_MAX_AGE}; SameSite=Lax${secureFlag}`;
}

function readStoredLanguage() {
  if (typeof window === "undefined") {
    return null;
  }

  const stored = window.localStorage.getItem(LANGUAGE_STORAGE_KEY);
  if (!stored || !isLangCode(stored)) {
    return null;
  }

  return parseLangCode(stored);
}

function canTranslateAttribute(element: Element, attribute: string) {
  if (element.closest("[data-i18n-skip='true']")) {
    return false;
  }

  if (attribute === "placeholder" && element instanceof HTMLInputElement) {
    return element.type !== "date" && element.type !== "number";
  }

  return true;
}

function applyAttributeTranslation(element: Element, attribute: string, lang: LangCode, store: WeakMap<Element, Map<string, OriginalTextRecord>>) {
  if (!canTranslateAttribute(element, attribute)) {
    return;
  }

  const currentValue = element.getAttribute(attribute);
  if (!currentValue) {
    return;
  }

  const attrStore = store.get(element) ?? new Map<string, OriginalTextRecord>();
  const existing = attrStore.get(attribute);
  const original = !existing || existing.translated !== currentValue ? currentValue : existing.original;
  const translated = translateText(original, lang);
  attrStore.set(attribute, { original, translated });
  store.set(element, attrStore);

  if (translated !== currentValue) {
    element.setAttribute(attribute, translated);
  }
}

function applyTextTranslation(node: Text, lang: LangCode, store: WeakMap<Text, OriginalTextRecord>) {
  const parent = node.parentElement;
  if (!parent || parent.closest("[data-i18n-skip='true']")) {
    return;
  }

  const tagName = parent.tagName;
  if (tagName === "SCRIPT" || tagName === "STYLE" || tagName === "NOSCRIPT") {
    return;
  }

  const currentValue = node.textContent ?? "";
  if (!currentValue.trim()) {
    return;
  }

  const existing = store.get(node);
  const original = !existing || existing.translated !== currentValue ? currentValue : existing.original;
  const translated = translateText(original, lang);
  store.set(node, { original, translated });

  if (translated !== currentValue) {
    node.textContent = translated;
  }
}

function translateTree(root: Node, lang: LangCode, textStore: WeakMap<Text, OriginalTextRecord>, attrStore: WeakMap<Element, Map<string, OriginalTextRecord>>) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_ALL);
  let node: Node | null = walker.currentNode;

  while (node) {
    if (node.nodeType === Node.TEXT_NODE) {
      applyTextTranslation(node as Text, lang, textStore);
    } else if (node.nodeType === Node.ELEMENT_NODE) {
      const element = node as Element;
      for (const attribute of ["placeholder", "aria-label", "title", "alt"]) {
        applyAttributeTranslation(element, attribute, lang, attrStore);
      }
    }

    node = walker.nextNode();
  }
}

function LocalizeDocument({ lang }: { lang: LangCode }) {
  const textStore = useRef(new WeakMap<Text, OriginalTextRecord>());
  const attrStore = useRef(new WeakMap<Element, Map<string, OriginalTextRecord>>());

  useEffect(() => {
    if (typeof document === "undefined") {
      return;
    }

    document.documentElement.lang = lang;
    translateTree(document.body, lang, textStore.current, attrStore.current);

    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type === "characterData" && mutation.target.nodeType === Node.TEXT_NODE) {
          applyTextTranslation(mutation.target as Text, lang, textStore.current);
          continue;
        }

        if (mutation.type === "attributes" && mutation.target instanceof Element && mutation.attributeName) {
          applyAttributeTranslation(mutation.target, mutation.attributeName, lang, attrStore.current);
          continue;
        }

        mutation.addedNodes.forEach((addedNode) => {
          if (addedNode.nodeType === Node.TEXT_NODE) {
            applyTextTranslation(addedNode as Text, lang, textStore.current);
          } else if (addedNode.nodeType === Node.ELEMENT_NODE) {
            translateTree(addedNode as Element, lang, textStore.current, attrStore.current);
          }
        });
      }
    });

    observer.observe(document.body, {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true,
      attributeFilter: ["placeholder", "aria-label", "title", "alt"],
    });

    return () => observer.disconnect();
  }, [lang]);

  return null;
}

const I18nContext = createContext<I18nContextValue | null>(null);

export function I18nProvider({ children, initialLang }: { children: React.ReactNode; initialLang: LangCode }) {
  const [lang, setLangState] = useState<LangCode>(initialLang);

  useEffect(() => {
    const stored = readStoredLanguage();
    if (stored && stored !== lang) {
      setLangState(stored);
      return;
    }

    setLanguageCookie(initialLang);
  }, [initialLang]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, lang);
    setLanguageCookie(lang);
    document.documentElement.lang = lang;
  }, [lang]);

  const value = useMemo<I18nContextValue>(
    () => ({
      lang,
      locale: getLocaleTag(lang),
      setLang: (next) => setLangState(next),
      tLiteral: (input) => translateText(input, lang),
      formatNumber: (input, options) => new Intl.NumberFormat(getLocaleTag(lang), options).format(input),
      formatDate: (input, options) =>
        new Intl.DateTimeFormat(getLocaleTag(lang), {
          day: "2-digit",
          month: "short",
          year: "numeric",
          timeZone: "Asia/Bangkok",
          ...options,
        }).format(new Date(input)),
      formatDateTime: (input, options) =>
        new Intl.DateTimeFormat(getLocaleTag(lang), {
          day: "2-digit",
          month: "short",
          year: "numeric",
          hour: "2-digit",
          minute: "2-digit",
          timeZone: "Asia/Bangkok",
          ...options,
        }).format(new Date(input)),
    }),
    [lang],
  );

  return (
    <I18nContext.Provider value={value}>
      <LocalizeDocument lang={lang} />
      {children}
    </I18nContext.Provider>
  );
}

export function useI18n() {
  const context = useContext(I18nContext);
  if (!context) {
    throw new Error("useI18n must be used within I18nProvider");
  }
  return context;
}

export function getLiteralTranslation(input: string, lang: LangCode) {
  return translateText(input, lang);
}
