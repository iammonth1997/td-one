# TD One ERP

Human Resource System for ThaiDrill Lao — built with Next.js 16 + Supabase.

## Features

- PIN-based employee login (bcrypt hashed)
- Date-of-birth verification for first-time PIN setup
- Role-based session (stored in localStorage)
- Optional device lock via `device_id_hash`
- Dashboard with attendance, payroll, and slip modules (in progress)

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 16 (App Router) |
| Database | Supabase (PostgreSQL) |
| Auth | Custom PIN + bcryptjs |
| Styling | Tailwind CSS v4 |
| Testing | Vitest + Testing Library |

## Database Tables

### `employees`
| Column | Type | Notes |
|--------|------|-------|
| `employee_code` | text | PK, matches `login_users.emp_id` |
| `status` | text | `active` \| `inactive` \| `terminated` |
| `date_of_birth` | date | Used for PIN setup verification |

### `login_users`
| Column | Type | Notes |
|--------|------|-------|
| `emp_id` | text | PK |
| `pin_hash` | text | bcrypt hash of PIN |
| `role` | text | `admin` \| `employee` |
| `is_registered` | boolean | true after first PIN set |
| `device_id_hash` | text | optional bcrypt hash for device lock |

## Setup

1. Clone the repo and install dependencies:
   ```bash
   npm install
   ```

2. Copy `.env.example` to `.env.local` and fill in your Supabase credentials:
   ```bash
   cp .env.example .env.local
   ```

3. Run the development server:
   ```bash
   npm run dev
   ```

Open [http://localhost:3000](http://localhost:3000) — it redirects to `/login`.

## Environment Variables

See [`.env.example`](.env.example) for required variables.

| Variable | Required | Description |
|----------|----------|-------------|
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes | Supabase anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Supabase service role key (server-side only) |

## First-Time Login Flow

1. Employee goes to `/set-pin`, enters Employee ID + Date of Birth + new PIN
2. PIN is hashed and stored in `login_users`
3. Employee logs in at `/login` with Employee ID + PIN
4. Session is stored in `localStorage` as `tdone_session`

## Scripts

```bash
npm run dev        # Start development server
npm run build      # Build for production
npm run test       # Run unit tests (vitest)
npm run test:smoke # Smoke test against running server (requires npm run dev)
npm run lint       # Run ESLint
```

## Project Structure

```
app/
  api/login/          # POST /api/login — PIN authentication
  api/login/set-pin/  # POST /api/login/set-pin — first-time PIN setup
  components/         # Header, Sidebar (shared UI)
  dashboard/          # Protected dashboard page
  login/              # Login page
  set-pin/            # PIN setup page
lib/
  supabaseClient.js   # Browser Supabase client
  supabaseServer.js   # Server Supabase client (service role)
tests/
  api/                # Unit tests for API route handlers
  components/         # Component render tests
  smoke.js            # End-to-end smoke test
```
