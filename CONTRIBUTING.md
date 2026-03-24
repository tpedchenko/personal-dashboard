# Contributing to Personal Dashboard

Thank you for your interest in contributing! This guide will help you get started.

## Prerequisites

- **Node.js 22+** (recommended: use [nvm](https://github.com/nvm-sh/nvm))
- **Docker & Docker Compose** (for PostgreSQL + Redis)

## Development Setup

### 1. Clone and install

```bash
git clone https://github.com/tarascloud/personal-dashboard.git
cd personal-dashboard/next
npm install
```

### 2. Start PostgreSQL and Redis

```bash
cd ..  # back to repo root
docker compose up -d pg redis
```

This starts PostgreSQL 17 on `localhost:5432` and Redis 7 on `localhost:6379` using the root `docker-compose.yml`.

Or point `DATABASE_URL` to your own PostgreSQL instance.

### 3. Configure environment

```bash
cd next
cp .env.example .env
```

Edit `.env` — at minimum fill in:

| Variable | How to get |
|----------|-----------|
| `DATABASE_URL` | `postgresql://pd:pd@localhost:5432/pd` (matches docker-compose) |
| `PG_PASSWORD` | `pd` (matches docker-compose) |
| `AUTH_SECRET` | `openssl rand -base64 32` |
| `NEXTAUTH_SECRET` | Same as AUTH_SECRET |
| `ENCRYPTION_KEY` | `openssl rand -hex 32` |
| `GOOGLE_CLIENT_ID` | [console.cloud.google.com/apis/credentials](https://console.cloud.google.com/apis/credentials) |
| `GOOGLE_CLIENT_SECRET` | Same page as above |

GitHub OAuth and all other integrations are optional.

### 4. Run migrations and start

```bash
npx prisma migrate deploy
npx prisma generate
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). The first sign-in automatically becomes the **owner** account.

### Authentication

The app supports four auth methods:

- **Google OAuth** — primary, requires Client ID/Secret
- **GitHub OAuth** — optional, set `GITHUB_ID` + `GITHUB_SECRET`
- **Passkeys/WebAuthn** — can be added after first login in Settings > Security
- **Demo mode** — read-only access without OAuth, set `DEMO_SECRET`

## Running Tests

```bash
# Unit tests (Vitest)
npm run test:unit

# E2E tests (Playwright — requires a running dev server)
npx playwright install --with-deps
npx playwright test
```

## Project Structure

```
next/
├── prisma/              # Schema & migrations
├── public/              # Static assets, screenshots
├── src/
│   ├── actions/         # Server Actions (finance, gym, health, …)
│   │   ├── dashboard/   # KPI, analytics, trends
│   │   ├── finance/     # Transactions, budgets, export
│   │   ├── gym/         # Workouts, exercises, programs
│   │   ├── reporting/   # Tax reports (UA, ES)
│   │   └── *.ts         # Top-level actions (chat, food, settings, …)
│   ├── app/
│   │   ├── (auth)/      # Login page
│   │   ├── (dashboard)/ # Authenticated pages
│   │   │   ├── admin/       # Admin panel
│   │   │   ├── ai-chat/     # AI assistant
│   │   │   ├── dashboard/   # Main dashboard
│   │   │   ├── finance/     # Finance module
│   │   │   ├── food/        # Food tracking
│   │   │   ├── gym/         # Gym & workouts
│   │   │   ├── list/        # Shopping lists
│   │   │   ├── my-day/      # Daily journal
│   │   │   ├── reporting/   # Tax reporting
│   │   │   ├── settings/    # App settings & integrations
│   │   │   └── trading/     # Freqtrade bot
│   │   ├── about/       # Public landing page
│   │   └── api/         # REST endpoints (health, sync, chat, …)
│   ├── components/      # React components
│   │   ├── ui/          # shadcn/ui primitives
│   │   ├── shared/      # Sidebar, language toggle, …
│   │   └── */           # Module-specific (finance, gym, chat, …)
│   ├── generated/       # Prisma-generated client (do not edit)
│   ├── hooks/           # Custom React hooks
│   └── lib/             # Shared utilities (db, auth, redis, encryption, …)
├── tests/               # Playwright E2E & Vitest unit tests
└── messages/            # i18n translations (en.json, uk.json, es.json)

setup/                   # Setup Wizard (standalone Next.js app)
deploy/                  # Docker configs for production
docker-compose.yml       # PostgreSQL + Redis + app (self-hosted)
```

### Key modules

| Module | Pages | Server Actions |
|--------|-------|---------------|
| **Finance** | `finance/` | `actions/finance/` |
| **Investments** | `finance/investments/` | `actions/brokers*.ts` |
| **Health** | `dashboard/` | `api/sync/garmin`, `api/sync/withings` |
| **Gym** | `gym/` | `actions/gym/` |
| **My Day** | `my-day/` | `actions/my-day.ts` |
| **Food** | `food/` | `actions/food.ts` |
| **Shopping** | `list/` | `actions/shopping.ts` |
| **Trading** | `trading/` | `actions/trading/` |
| **Tax Reporting** | `reporting/` | `actions/reporting/` |
| **AI Chat** | `ai-chat/` | `actions/chat*.ts` |
| **Dashboard** | `dashboard/` | `actions/dashboard/` |

## Tech Stack

| Layer | Technologies |
|-------|-------------|
| **Frontend** | Next.js 16, React 19, TypeScript 5, Tailwind CSS 4, shadcn/ui, Recharts, cmdk |
| **Backend** | Next.js App Router, Server Actions, Prisma 7, NextAuth 5 |
| **Database** | PostgreSQL 17, Redis 7 |
| **AI** | Vercel AI SDK, Gemini 2.5 Flash, Groq, Ollama (local) |
| **Auth** | Google OAuth, GitHub OAuth, Passkeys (WebAuthn), Demo mode |
| **i18n** | next-intl (English, Ukrainian, Spanish) |
| **PWA** | Serwist service worker |
| **Testing** | Playwright (E2E), Vitest (unit) |

## Code Style

- **TypeScript** in strict mode — no `any` unless absolutely necessary
- **Tailwind CSS 4** for styling — no custom CSS files
- **Prisma** for all database access — no raw SQL in application code
- **Server Actions** (`src/actions/`) for data mutations
- **next-intl** for i18n — all user-facing strings in `messages/*.json`
- Format with Prettier: `npm run lint`

## Pull Request Process

1. Fork the repo and create a branch from `main`
2. Make your changes — keep PRs focused on a single feature or fix
3. Add or update tests for your changes
4. Ensure all tests pass: `npm run test:unit && npm run lint`
5. Write a clear PR description explaining **what** and **why**
6. Submit the PR — a maintainer will review it

### Test guidelines

- Tests must create their own data and **clean up after themselves**
- Use `test.afterEach` for cleanup
- Do not modify existing demo/seed data

## License

By contributing, you agree that your contributions will be licensed under the [AGPL-3.0 License](LICENSE).
