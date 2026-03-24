# Changelog

## v1.0.0 (2026-03-24)

### Initial Release

**Personal Dashboard** — self-hosted all-in-one app for tracking your finances, health, workouts, and more.

#### Features

- **Finance** — transactions, budgets, accounts, recurring payments, multi-currency (EUR/UAH/USD), CSV import, bank sync (Monobank, bunq)
- **Investments** — portfolio tracking (IBKR, Trading 212, eToro), NAV history, P&L, allocation charts
- **Health** — Garmin Connect sync (daily stats, sleep, body composition, HRV, Body Battery, stress), Withings sync
- **Gym & Workouts** — exercise library (100+), workout programs, set/rep tracking, muscle recovery map, PR detection
- **AI Assistant** — chat with your data (Gemini, Groq, local Ollama), RAG context, cross-domain correlations
- **AI Insights** — auto-generated insights per page with like/dislike feedback loop
- **My Day** — mood, energy, stress, focus tracking, daily journal
- **Food Tracking** — calories, protein, daily summaries
- **Shopping List** — shared lists, quick expense, purchase history
- **Trading** — Freqtrade integration, strategy management
- **Tax Reporting** — Ukrainian FOP (DPS API), Spanish IRPF calculator
- **Dashboard** — KPIs, charts, trends, correlations across all modules

#### Tech Stack

- Next.js 16, React 19, TypeScript, Prisma, PostgreSQL
- Python scheduler, Docker, Tailwind CSS 4, PWA
- AI: Ollama (Qwen2.5 14B), Gemini, Groq, pgvector embeddings
- Multi-language: EN / UA / ES

#### Links

- Live demo: [pd.taras.cloud/about](https://pd.taras.cloud/about)
- License: AGPL-3.0
