# Deploy Checklist - Attendance Scan Module

## A) What Copilot already completed in code

- Added scan page and routes:
  - `/scan`
  - `/attendance` (redirect)
  - `/check-in` (redirect)
- Added attendance APIs:
  - `POST /api/attendance/scan`
  - `GET /api/attendance/today`
  - `POST /api/attendance/verify-location`
  - `GET /api/work-locations`
- Added admin APIs and pages:
  - `POST/GET /api/attendance/admin/reset-device`
  - `GET/POST/PUT/DELETE /api/work-locations`
  - `/admin/work-locations`
  - `/admin/device-binding`
- Added migration:
  - `migrations/008_create_attendance_scan_tables.sql`
- Added logging table support and utility helpers.
- Build is passing locally (`npm run build`).

## B) What you must do (outside code)

### 1) Vercel environment variables (Production)

Set these in Vercel Project Settings -> Environment Variables:

- `NEXT_PUBLIC_APP_BASE_URL=https://tdone-erp.com`
- `NEXT_PUBLIC_LIFF_ID=2009413188-4647l7eA`
- `LINE_LOGIN_CHANNEL_ID=2009413188`
- `ATTENDANCE_ALLOW_DEV_WITHOUT_LIFF=false`
- Keep existing Supabase variables unchanged.

### 2) Deploy to Vercel

Run in repo root:

```bash
git add .
git commit -m "feat(attendance): add scan in/out module with GPS, device binding, admin location/device tools"
git push origin main
```

### 3) LINE Developers check

- LIFF Endpoint URL should be `https://tdone-erp.com`
- Test via LIFF URL:
  - `https://liff.line.me/2009413188-4647l7eA`

## C) Production smoke test (must pass)

1. Open LIFF URL in LINE app.
2. Login/link flow works.
3. Open `/scan` and refresh GPS.
4. Inside work area -> `Scan In` enabled.
5. `Scan In` success, then `Scan Out` success.
6. Outside work area -> blocked with `OUTSIDE_WORK_AREA`.
7. Device mismatch (new device) -> blocked with `DEVICE_MISMATCH`.
8. Admin pages usable:
   - `/admin/work-locations`
   - `/admin/device-binding`

## D) SQL verification queries

```sql
select date, scan_in_time, scan_out_time, status
from attendance
order by created_at desc
limit 20;
```

```sql
select action_type, success, reason, distance_meters, created_at
from attendance_scan_logs
order by created_at desc
limit 30;
```
