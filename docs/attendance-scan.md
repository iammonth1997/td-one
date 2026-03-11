# Attendance Scan (Check-in / Check-out)

## Routes

- Page: `/scan`
- Alias: `/attendance` and `/check-in` redirect to `/scan`

## API

- `GET /api/attendance/today`
- `POST /api/attendance/verify-location`
- `POST /api/attendance/scan`
- `GET /api/work-locations`
- `POST /api/attendance/admin/reset-device` (admin/hr reset device binding)

## Security

- Requires session token in `Authorization` header.
- Requires LIFF ID token in `x-line-id-token` for scan and location verification.
- LIFF token is verified against linked LINE user (`login_users.line_user_id`).
- GPS validation is done server-side against `work_locations` radius.
- Every scan attempt is logged in `attendance_scan_logs`.

## Required migration

Run:

- `migrations/008_create_attendance_scan_tables.sql`

## Optional env configuration

```bash
ATTENDANCE_MIN_RADIUS_METERS=100
ATTENDANCE_MAX_RADIUS_METERS=500
ATTENDANCE_DEFAULT_RADIUS_METERS=200
```

## Notes

- Face verification and liveness are UI-ready placeholders in this version.
- To enable real face match, integrate camera upload + face comparison service (next phase).
