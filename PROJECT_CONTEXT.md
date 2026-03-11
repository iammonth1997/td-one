# PROJECT CONTEXT - TD One ERP

## 1) Project Overview
- Name: TD One ERP
- Stack: Next.js App Router + Supabase
- Deploy: Vercel (Production) + Cloudflare domain
- Auth Model: Custom PIN login with server-side sessions table

## 2) Core Security Rules
- PIN stored as `pin_hash` only (bcrypt), never reversible.
- Employee cannot self-reset PIN anymore.
- PIN reset is restricted to HR Payroll/Super Admin flow.
- Temporary PIN is one-time operational flow and must force PIN change.

## 3) Current Auth/Session Behavior
- Session key in browser: `tdone_session`
- Session duration: 8 hours
- Home route (`/`) behavior:
  - If no valid session => `/login`
  - If `must_change_pin` => `/change-pin`
  - Else => `/dashboard`

## 4) Reset & Temporary PIN Policy
- HR Payroll / Super Admin can issue temporary PIN.
- Temporary PIN expires in 15 minutes.
- User logging in with temporary PIN must change PIN immediately.
- All reset/issue actions should be auditable.

## 5) Important Routes
- Login: `/login`
- Dashboard: `/dashboard`
- Daywork: `/day-work`, `/day-work/view`
- Forced PIN change: `/change-pin`
- PIN reset audit page: `/admin/pin-reset-audit`

## 6) Key API Endpoints
- `POST /api/login`
- `POST /api/login/set-pin`
- `POST /api/login/forgot-pin`
- `POST /api/login/reset-pin`
- `POST /api/login/change-pin`
- `POST /api/login/admin/issue-temp-pin`
- `GET  /api/login/admin/pin-reset-audit`

## 7) Required DB Migrations (Production)
- `migrations/004_add_login_performance_indexes.sql`
- `migrations/005_create_pin_reset_audit.sql`
- `migrations/006_add_temp_pin_controls.sql`

## 8) Roles in Use
- employee
- supervisor
- manager
- admin
- super_admin
- hr_payroll (also supports hr-payroll/hr payroll/hrpayroll variants in checks)

## 9) Operating Notes
- If login/route fails on production, verify missing tracked files on `main` first.
- Always run `npm run build` before pushing production fixes.
- For Vercel failures, read first red build error line and fix incrementally.

## 10) New Chat Bootstrap Prompt
Use this at the start of a new chat:

"Read `PROJECT_CONTEXT.md` and `HANDOFF.md` first, then continue from the latest production-safe state."
