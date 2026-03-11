# OT Request Feature

## Route

- Page: `/request`
- API:
  - `POST /api/ot-request`
  - `GET /api/ot-request`
  - `GET /api/ot-request/[id]`
  - `PUT /api/ot-request/[id]` (cancel)
  - `GET /api/ot-request/check-duplicate?date=YYYY-MM-DD`

## Business Rules

- OT request date must be today or earlier.
- OT request date can be backdated up to `OT_MAX_PAST_DAYS` (default 7).
- Minimum OT is 1 hour.
- Maximum OT per day is `OT_MAX_HOURS_PER_DAY` (default 4).
- Cross-midnight is supported (e.g. 22:00 to 01:00).
- Reason is required and must be at least 20 characters.
- Duplicate pending/approved OT request on the same date is blocked.
- Leave conflict check uses `leave_requests` if available.

## OT Types

- `normal` => 1.5x
- `holiday` => 2.0x
- `special` => 3.0x

## Database Migration

Run:

- `migrations/009_create_ot_requests.sql`

This migration creates:

- `ot_types`
- `ot_requests`
- `ot_monthly_summary` view
