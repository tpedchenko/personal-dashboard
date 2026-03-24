# Contributing to Personal Dashboard

Thank you for your interest in contributing! This guide will help you get started.

## Prerequisites

- **Node.js 22+** (recommended: use [nvm](https://github.com/nvm-sh/nvm))
- **PostgreSQL 17+** (or use Docker)
- **Redis 7+** (or use Docker)
- **Docker & Docker Compose** (for the containerised setup)

## Development Setup

### 1. Clone the repository

```bash
git clone https://github.com/tpedchenko/personal-dashboard.git
cd personal-dashboard
```

### 2. Install dependencies

```bash
cd next
npm install
```

### 3. Configure environment

```bash
cp .env.example .env
# Edit .env — at minimum fill in:
#   DATABASE_URL, AUTH_SECRET, NEXTAUTH_SECRET,
#   GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, ENCRYPTION_KEY
```

Generate secrets:

```bash
# Auth secret
openssl rand -base64 32

# Encryption key (64 hex chars)
openssl rand -hex 32
```

### 4. Start the database

Either use the provided Docker Compose:

```bash
cd ..  # back to repo root
docker compose up -d pg redis
```

Or point `DATABASE_URL` to your own PostgreSQL instance.

### 5. Run Prisma migrations

```bash
cd next
npx prisma migrate deploy   # apply existing migrations
npx prisma generate          # generate the Prisma client
```

### 6. Start the dev server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). The first Google OAuth sign-in automatically becomes the **owner** account.

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
│   ├── app/             # Next.js App Router pages & API routes
│   │   ├── (dashboard)/ # Authenticated pages (finance, gym, health, …)
│   │   ├── about/       # Public /about page
│   │   ├── api/         # REST endpoints (health, sync, chat, …)
│   │   └── login/       # Auth pages
│   ├── components/      # React components (ui/, finance/, gym/, …)
│   ├── generated/       # Prisma-generated client (do not edit)
│   ├── hooks/           # Custom React hooks
│   └── lib/             # Shared utilities (db, auth, redis, encryption, …)
└── tests/               # Playwright E2E & Vitest unit tests
```

### Key modules

| Module | Description |
|--------|-------------|
| **Finance** | Transactions, budgets, accounts, bank sync |
| **Investments** | Broker positions, NAV charts, P&L |
| **Health** | Garmin & Withings sync, sleep, HRV |
| **Gym** | Workouts, exercises, programs, muscle recovery |
| **My Day** | Daily journal, mood & energy tracking |
| **Food** | Calorie/protein tracking with AI analysis |
| **List** | Shopping lists with purchase history |
| **Trading** | Freqtrade bot control & analytics |
| **Tax Reporting** | UA (FOP/DPS) and ES (IRPF/Modelo 100) |
| **AI Chat** | Multi-provider chat with RAG context |
| **Dashboard** | Unified KPIs, correlations, trends |

## Code Style

- **TypeScript** in strict mode — no `any` unless absolutely necessary
- **Tailwind CSS 4** for styling — no custom CSS files
- **Prisma** for all database access — no raw SQL in application code
- **Server Actions** (`src/actions/`) for data mutations
- **next-intl** for i18n (Ukrainian / English)
- Format with Prettier (`npm run lint` to check)

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
