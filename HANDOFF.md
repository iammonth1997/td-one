# HANDOFF - TD One ERP

## Last Updated
- Date: 2026-03-10

## Latest Known Good Direction
- Main branch has ongoing auth hardening and HR reset controls.
- Deployment workflow is GitHub -> Vercel Production.

## Recent Feature Work (Summary)
- Improved login performance and timing instrumentation.
- Home auto-redirect based on valid session.
- Added daywork pages and daywork API route.
- Restricted reset PIN flows to HR Payroll role.
- Added PIN reset audit trail.
- Added temporary PIN + forced change PIN flow.
- Added admin audit UI page for PIN reset records.

## Critical Production Checklist
1. Ensure Vercel deployment for latest commit is `Ready`.
2. Apply migrations in Supabase production:
   - `004_add_login_performance_indexes.sql`
   - `005_create_pin_reset_audit.sql`
   - `006_add_temp_pin_controls.sql`
3. Smoke test:
   - Login success
   - Dashboard loads
   - Daywork route works
   - HR-only reset restrictions work
   - Temporary PIN flow forces `/change-pin`

## Current Open Tasks
- [ ] Confirm migration `006` applied in production.
- [ ] Validate temporary PIN end-to-end with real HR role account.
- [ ] (Optional) Add suspicious attendance anti-fraud module (GPS/device/risk score).

## Known Risks
- Role naming variations can cause permission mismatch if DB role values differ unexpectedly.
- Production issues often came from missing tracked files on `main`.

## Next Recommended Task
- Build Attendance anti-fraud v1:
  - scan logs
  - risk scoring
  - HR suspicious queue

## New Chat Starter (Copy/Paste)
"Please read `PROJECT_CONTEXT.md` and `HANDOFF.md` and continue from the latest state. First, verify migration status in production and then run a focused smoke-test plan."
