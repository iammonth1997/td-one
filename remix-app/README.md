# TDOne Remix App (Cloudflare)

Employee portal migration from Next.js to React Router/Remix runtime, deployed on Cloudflare Workers.

## Local Development

```bash
npm install
npm run dev
```

## Validate Before Deploy

```bash
npm run typecheck
npm run build
```

## Required Environment Variables

Use `.env.example` as the source of truth.

### Non-secret vars (`wrangler.jsonc -> vars`)

- `NEXT_PUBLIC_APP_BASE_URL`
- `NEXT_PUBLIC_LIFF_ID`
- `LINE_LOGIN_CHANNEL_ID`
- `ATTENDANCE_ALLOW_DEV_WITHOUT_LIFF`
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
2. Verify LIFF endpoint points to production domain.
3. Run smoke tests for login, scan in/out, request flows, and slip flows.
