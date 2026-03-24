# Personal Dashboard

**Your life, your data, your server.**

Open-source, self-hosted personal dashboard for finance, health, fitness, investments, trading, and tax reporting. Built with Next.js 16, React 19, Prisma, and Tailwind CSS.

[![License: AGPL-3.0](https://img.shields.io/badge/License-AGPL--3.0-blue.svg)](LICENSE)

![Dashboard Screenshot](next/public/screenshots/dashboard.png)

> **[See all features with screenshots →](https://pd.taras.cloud/about)**

## Features

- **Finance** — Transaction tracking with Monobank & bunq sync, monthly budgets, multi-currency (EUR/UAH/USD), category breakdown, recurring payments
- **Investments** — Portfolio tracking across IBKR, Trading 212, and eToro. NAV history, P&L, asset allocation
- **Health** — Garmin Connect sync (sleep, HRV, Body Battery, stress, VO2max) and Withings (weight, body fat)
- **Gym & Workouts** — 100+ exercise library, custom programs, set/rep/weight tracking, PR detection, muscle recovery heatmap
- **AI Assistant** — Chat with your data using Gemini, Groq, or local Ollama models. RAG context across all modules
- **My Day** — Daily mood, energy, stress tracking with journal entries
- **Food Tracking** — Calorie and protein tracking with daily targets and 30-day trend charts
- **Shopping List** — Shared lists with purchase history and AI-powered spending insights
- **Trading** — Freqtrade bot integration with real-time control, P&L charts, and per-pair analysis
- **Tax Reporting** — Ukrainian FOP (DPS API) and Spanish IRPF (Modelo 100 simulator, broker report parsers)
- **Dashboard** — Unified KPIs, lifestyle correlations (sleep vs mood vs exercise vs spending)
- **PWA** — Installable on mobile via Serwist service worker
- **Multi-language** — Ukrainian and English (next-intl)
- **Multi-user** — Google OAuth with owner/guest roles and invite system

## Integrations

Garmin Connect, Monobank, bunq, Interactive Brokers, Trading 212, eToro, Freqtrade, Withings, Telegram Bot, Kraken, Binance, Cobee, DPS (UA Tax)

## Quick Start

### Docker (recommended)

```bash
git clone https://github.com/tpedchenko/personal-dashboard.git
cd personal-dashboard

# Configure environment
cp next/.env.example .env
# Edit .env — fill in DATABASE_URL, AUTH_SECRET, GOOGLE_CLIENT_ID, etc.

# Start everything
docker compose up -d
```

Open [http://localhost:3000](http://localhost:3000). The first sign-in becomes the owner.

### Local Development

```bash
cd next
npm install
cp .env.example .env
# Edit .env

npx prisma migrate deploy
npx prisma generate
npm run dev
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for the full development guide.

## Tech Stack

| Layer | Technologies |
|-------|-------------|
| **Frontend** | Next.js 16, React 19, TypeScript 5, Tailwind CSS 4, shadcn/ui, Recharts, cmdk |
| **Backend** | Next.js App Router, Server Actions, Prisma 7, NextAuth 5 (beta) |
| **Database** | PostgreSQL 17, Redis 7, PgBouncer |
| **AI** | Vercel AI SDK, Gemini 2.5 Flash, Groq, Ollama (local) |
| **Infra** | Docker (multi-stage), Node 22-alpine, Serwist (PWA) |
| **Testing** | Playwright (E2E), Vitest (unit) |

## About

Visit the [/about](https://pd.taras.cloud/about) page for a full visual overview of all modules with screenshots.

## License

This project is licensed under the [GNU Affero General Public License v3.0](LICENSE).

If you use this software to provide a service over a network, you must make the source code available to users of that service.

## Contributing

Contributions are welcome! Please read [CONTRIBUTING.md](CONTRIBUTING.md) before submitting a pull request.
