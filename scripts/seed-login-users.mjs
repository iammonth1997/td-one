// Allow self-signed certs (Aiven uses internal CA)
process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import pkg from "pg";
const { Pool } = pkg;

// ── Data from TDLao-Final.xlsx ──────────────────────────────────────────────
const users = [
  { emp_id: "L2304139", email: "inpanh1999@gmail.com",                  password: "TDLao2304139@HR",  role: "HR_TRAINING" },
  { emp_id: "L2312675", email: "Saengdalapakse@gmail.com",              password: "TDLao2312675@HR",  role: "HR_TIME_ATTENDANCE" },
  { emp_id: "L2312676", email: "kaiamphone514@gmail.com",               password: "TDLao2312676@HR",  role: "HR_TIME_ATTENDANCE" },
  { emp_id: "L2310469", email: null,                                     password: "TDLao2310469@HR",  role: "SECTION_MANAGER" },
  { emp_id: "L2402905", email: "thebthidaleuthvilaysak@gmail.com",      password: "TDLao2402905@HR",  role: "HR_RECRUITMENT" },
  { emp_id: "L2403077", email: null,                                     password: "TDLao2403077@HR",  role: "HR_TRAINING" },
  { emp_id: "L2406041", email: null,                                     password: "TDLao2406041@HR",  role: "HR_WELFARE" },
  { emp_id: "L2501033", email: null,                                     password: "TDLao2501033@HR",  role: "HR_PAYROLL" },
  { emp_id: "L2502004", email: null,                                     password: "TDLao2502004@HR",  role: "HR_RECRUITMENT" },
  { emp_id: "L2503003", email: null,                                     password: "TDLao2503003@HR",  role: "HR_WELFARE" },
  { emp_id: "L2504039", email: null,                                     password: "TDLao2504039@HR",  role: "HR_TRAINING" },
  { emp_id: "L2504102", email: "boudsakone.77@gmail.com",               password: "TDLao2504102@HR",  role: "HR_RECRUITMENT" },
  { emp_id: "L2504202", email: null,                                     password: "TDLao2504202@HR",  role: "HR_TRAINING" },
  { emp_id: "L2504210", email: null,                                     password: "TDLao2504210@HR",  role: "HR_TRAINING" },
  { emp_id: "L2504317", email: null,                                     password: "TDLao2504317@HR",  role: "HR_WELFARE" },
  { emp_id: "L2505157", email: null,                                     password: "TDLao2505157@HR",  role: "HR_WELFARE" },
  { emp_id: "L2506076", email: "phonepaseuth.thammavongsa22@gmail.com", password: "TDLao2506076@HR",  role: "HR_TIME_ATTENDANCE" },
  { emp_id: "L2506145", email: null,                                     password: "TDLao2506145@HR",  role: "HR_PAYROLL" },
  { emp_id: "L2507102", email: null,                                     password: "TDLao2507102@HR",  role: "HR_WELFARE" },
  { emp_id: "L2509051", email: null,                                     password: "TDLao2509051@HR",  role: "HR_TIME_ATTENDANCE" },
  { emp_id: "L2510135", email: "thittavanhtu@gmail.com",                password: "TDLao2510135@HR",  role: "HR_TIME_ATTENDANCE" },
  { emp_id: "L2311497", email: null,                                     password: "TDLao2311497@ACC", role: "ACCOUNTING_HEAD" },
  { emp_id: "L2403988", email: null,                                     password: "TDLao2403988@ACC", role: "ACCOUNTING_STAFF" },
  { emp_id: "L2505466", email: null,                                     password: "TDLao2505466@ACC", role: "ACCOUNTING_STAFF" },
  { emp_id: "L2506021", email: null,                                     password: "TDLao2506021@ACC", role: "ACCOUNTING_STAFF" },
  { emp_id: "L2506062", email: null,                                     password: "TDLao2506062@ACC", role: "ACCOUNTING_STAFF" },
  { emp_id: "L2509049", email: null,                                     password: "TDLao2509049@ACC", role: "ACCOUNTING_STAFF" },
  { emp_id: "L2212047", email: null,                                     password: "TDLao2212047@CAMP", role: "SECTION_MANAGER" },
  { emp_id: "L2307397", email: null,                                     password: "TDLao2307397@CAMP", role: "DEPT_ADMIN" },
  { emp_id: "L2304195", email: null,                                     password: "TDLao2304195@CAMP", role: "DEPT_ADMIN" },
  { emp_id: "L2308412", email: null,                                     password: "TDLao2308412@CAMP", role: "DEPT_ADMIN" },
  { emp_id: "L2401695", email: null,                                     password: "TDLao2401695@CAMP", role: "DEPT_ADMIN" },
  { emp_id: "L2401713", email: null,                                     password: "TDLao2401713@CAMP", role: "DEPT_ADMIN" },
  { emp_id: "L2507016", email: null,                                     password: "TDLao2507016@CAMP", role: "DEPT_ADMIN" },
  { emp_id: "L2505379", email: null,                                     password: "TDLao2505379@CTN", role: "DEPT_ADMIN" },
  { emp_id: "L2505380", email: "damlongboon@gmail.com",                 password: "TDLao2505380@CTN", role: "DEPT_ADMIN" },
  { emp_id: "L2505381", email: null,                                     password: "TDLao2505381@CTN", role: "DEPT_ADMIN" },
  { emp_id: "L2508030", email: null,                                     password: "TDLao2508030@CTN", role: "DEPT_ADMIN" },
  { emp_id: "L2401714", email: null,                                     password: "TDLao2401714@CCS", role: "DEPT_ADMIN" },
  { emp_id: "L2403059", email: null,                                     password: "TDLao2403059@CCS", role: "DEPT_ADMIN" },
  { emp_id: "L2402916", email: "chansouk.vorlasan@gmail.com",           password: "TDLao2402916@MECH", role: "DEPT_ADMIN" },
  { emp_id: "L2504349", email: "zonzan12@gmail.com",                    password: "TDLao2504349@MECH", role: "DEPT_ADMIN" },
  { emp_id: "L2507098", email: null,                                     password: "TDLao2507098@MECH", role: "DEPT_ADMIN" },
  { emp_id: "L2302055", email: null,                                     password: "TDLao2302055@MECH", role: "SECTION_MANAGER" },
  { emp_id: "L2401694", email: null,                                     password: "TDLao2401694@MECH", role: "DEPT_ADMIN" },
  { emp_id: "L2404139", email: null,                                     password: "TDLao2404139@MECH", role: "DEPT_ADMIN" },
  { emp_id: "L2409015", email: null,                                     password: "TDLao2409015@MECH", role: "DEPT_ADMIN" },
  { emp_id: "L2510019", email: null,                                     password: "TDLao2510019@MECH", role: "DEPT_ADMIN" },
  { emp_id: "L2510109", email: null,                                     password: "TDLao2510109@MECH", role: "SECTION_MANAGER" },
  { emp_id: "L2505370", email: null,                                     password: "TDLao2505370@OPR", role: "DEPT_ADMIN" },
  { emp_id: "L2506084", email: "boudsy16122002@gmail.com",              password: "TDLao2506084@OPR", role: "DEPT_ADMIN" },
  { emp_id: "L2310458", email: "eungkhamdaongam@gmail.com",             password: "TDLao2310458@OPR", role: "DEPT_ADMIN" },
  { emp_id: "L2303067", email: "Vadfc.sbp@gmail.com",                   password: "TDLao2303067@OPR", role: "SECTION_MANAGER" },
  { emp_id: "L2302028", email: "Phetsamaiwaii@gmail.com",               password: "TDLao2302028@OPR", role: "DEPT_ADMIN" },
  { emp_id: "L2401794", email: null,                                     password: "TDLao2401794@OPR", role: "DEPT_ADMIN" },
  { emp_id: "L2402875", email: null,                                     password: "TDLao2402875@OPR", role: "DEPT_ADMIN" },
  { emp_id: "L2306352", email: null,                                     password: "TDLao2306352@PC",  role: "DEPT_ADMIN" },
  { emp_id: "L2507104", email: null,                                     password: "TDLao2507104@PC",  role: "DEPT_ADMIN" },
  { emp_id: "L2509020", email: null,                                     password: "TDLao2509020@PC",  role: "DEPT_ADMIN" },
  { emp_id: "L2509021", email: null,                                     password: "TDLao2509021@PC",  role: "DEPT_ADMIN" },
  { emp_id: "L2509027", email: null,                                     password: "TDLao2509027@PC",  role: "DEPT_ADMIN" },
  { emp_id: "L2303104", email: null,                                     password: "TDLao2303104@PUR", role: "SECTION_MANAGER" },
  { emp_id: "L2310460", email: "bolitakittiladlungsy@gmail.com",        password: "TDLao2310460@PUR", role: "DEPT_ADMIN" },
  { emp_id: "L2503127", email: null,                                     password: "TDLao2503127@PUR", role: "DEPT_ADMIN" },
  { emp_id: "L2509101", email: null,                                     password: "TDLao2509101@PUR", role: "DEPT_ADMIN" },
  { emp_id: "L2510181", email: null,                                     password: "TDLao2510181@PUR", role: "DEPT_ADMIN" },
  { emp_id: "L2511012", email: null,                                     password: "TDLao2511012@PUR", role: "DEPT_ADMIN" },
  { emp_id: "L2511054", email: null,                                     password: "TDLao2511054@PUR", role: "DEPT_ADMIN" },
  { emp_id: "L2304138", email: null,                                     password: "TDLao2304138@SHE", role: "SHE_OFFICER" },
  { emp_id: "L2506104", email: null,                                     password: "TDLao2506104@SHE", role: "DEPT_ADMIN" },
  { emp_id: "L2312628", email: null,                                     password: "TDLao2312628@SHE", role: "SHE_OFFICER" },
  { emp_id: "L2401795", email: null,                                     password: "TDLao2401795@SHE", role: "SHE_OFFICER" },
  { emp_id: "L2402817", email: null,                                     password: "TDLao2402817@SHE", role: "SHE_OFFICER" },
  { emp_id: "L2403057", email: null,                                     password: "TDLao2403057@WH",  role: "DEPT_ADMIN" },
  { emp_id: "L2303071", email: null,                                     password: "TDLao2303071@WH",  role: "WAREHOUSE_HEAD" },
  { emp_id: "L2404069", email: null,                                     password: "TDLao2404069@WH",  role: "DEPT_ADMIN" },
  { emp_id: "L2408022", email: null,                                     password: "TDLao2408022@WH",  role: "DEPT_ADMIN" },
  { emp_id: "L2505079", email: null,                                     password: "TDLao2505079@WH",  role: "DEPT_ADMIN" },
  { emp_id: "L2509028", email: null,                                     password: "TDLao2509028@WH",  role: "DEPT_ADMIN" },
  { emp_id: "L2506090", email: null,                                     password: "TDLao2506090@HR",  role: "DEPT_ADMIN" },
];

async function main() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });
  const adapter = new PrismaPg(pool);
  const prisma = new PrismaClient({ adapter });

  console.log(`Seeding ${users.length} users...`);
  let inserted = 0;
  let skipped = 0;

  for (const u of users) {
    const email = u.email?.trim() || `${u.emp_id}@gmail.com`;
    const hash = await bcrypt.hash(u.password, 10);

    try {
      await prisma.loginUser.upsert({
        where: { emp_id: u.emp_id },
        update: {
          admin_email: email,
          admin_password_hash: hash,
          role: u.role,
        },
        create: {
          emp_id: u.emp_id,
          role: u.role,
          admin: false,
          admin_email: email,
          admin_password_hash: hash,
        },
      });
      console.log(`  ✓ ${u.emp_id} (${u.role})`);
      inserted++;
    } catch (err) {
      console.error(`  ✗ ${u.emp_id}: ${err.message}`);
      skipped++;
    }
  }

  console.log(`\nDone: ${inserted} upserted, ${skipped} failed.`);
  await prisma.$disconnect();
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
