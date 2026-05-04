# TDOne Remix App (Cloudflare)

Employee portal built on React Router/Remix runtime, deployed on Cloudflare Workers.

## Local Development

```bash
npm install
npm run dev
```

### Safer local test modes

Use a dedicated local test environment when you want localhost to exercise the real end-to-end flow without writing into the same database that `.dev.vars` uses.

1. Copy `.dev.vars.local-test.example` to `.dev.vars.local-test`
2. Point `DATABASE_URL` and `CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_DB` to a test database
3. Point Cloudinary keys to a test account or folder
4. Run `npm run dev:local-test`

For a full production-like smoke test against the default `.dev.vars` target, run:

```bash
npm run dev:production-like
```

`npm run dev:local-test` refuses to start if `.dev.vars.local-test` is missing required keys or still points at the same `DATABASE_URL` as `.dev.vars`.

## Validate Before Deploy

```bash
npm run typecheck
npm run build
```

## Required Environment Variables

Use `.env.example` as the source of truth.

### Non-secret vars (`wrangler.jsonc -> vars`)

- `ATTENDANCE_MIN_RADIUS_METERS`
- `ATTENDANCE_MAX_RADIUS_METERS`
- `ATTENDANCE_DEFAULT_RADIUS_METERS`
- `OT_MAX_HOURS_PER_DAY`
- `OT_MAX_PAST_DAYS`

### Secrets (set in Cloudflare)

```bash
wrangler secret put NEXT_PUBLIC_SUPABASE_URL
wrangler secret put NEXT_PUBLIC_SUPABASE_ANON_KEY
wrangler secret put SUPABASE_SERVICE_ROLE_KEY
wrangler secret put RESET_PIN_SECRET
wrangler secret put CRON_SECRET
wrangler secret put NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME
wrangler secret put CLOUDINARY_API_KEY
wrangler secret put CLOUDINARY_API_SECRET
wrangler secret put LINE_CHANNEL_ACCESS_TOKEN
wrangler secret put LINE_ADMIN_API_KEY
wrangler secret put GOOGLE_SERVICE_ACCOUNT_EMAIL
wrangler secret put GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY
wrangler secret put GOOGLE_SHEETS_LEAVE_SPREADSHEET_ID
wrangler secret put GOOGLE_SHEETS_LEAVE_SHEET_NAME
wrangler secret put GOOGLE_APPS_SCRIPT_SYNC_URL
```

### One-shot setup (ค่าเริ่มต้น: Linux/macOS)

```bash
npm run cf:setup
```

### One-shot setup (Windows PowerShell)

```bash
npm run cf:setup:ps
```

### One-shot setup (Linux/macOS แบบระบุชัดเจน)

```bash
npm run cf:setup:sh
```

Optional flags (run script directly):

```powershell
powershell -ExecutionPolicy Bypass -File ./scripts/setup-cloudflare.ps1 -WorkerName tdone-remix
powershell -ExecutionPolicy Bypass -File ./scripts/setup-cloudflare.ps1 -WorkerName tdone-remix -EnvironmentName production
```

```bash
bash ./scripts/setup-cloudflare.sh --worker-name tdone-remix
bash ./scripts/setup-cloudflare.sh --worker-name tdone-remix --env production
bash ./scripts/setup-cloudflare.sh --worker-name tdone-remix --skip-login --skip-deploy
```

## Deploy to Cloudflare

```bash
npx wrangler login
npm run deploy
```

## Post-Deploy Operations

1. Configure Cloudflare Cron Trigger for:
	- `GET /api/cron/cleanup-cancelled-leave-files`
	- Header `Authorization: Bearer <CRON_SECRET>`
2. Verify cron endpoint response manually:
	- `curl -H "Authorization: Bearer <CRON_SECRET>" https://tdone-erp.com/api/cron/cleanup-cancelled-leave-files`
3. Run smoke tests for login, scan in/out, request flows, and slip flows.
