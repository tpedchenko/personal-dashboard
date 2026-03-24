"use server";

import { toEur, FALLBACK_TO_EUR } from "@/lib/brokers/fx-utils";

import { requireUser } from "@/lib/current-user";
import { prisma } from "@/lib/db";

// --- FX Rates for EUR conversion ---

export async function getUsdToEurRate(): Promise<number> {
  // Get NBU rates: UAH per 1 USD and UAH per 1 EUR → cross rate
  const today = new Date();
  const rates = await prisma.nbuRate.findMany({
    where: { currencyCode: { in: ["USD", "EUR"] }, date: { lte: today } },
    orderBy: { date: "desc" },
    take: 10, // get latest for each currency
  });
  const usdRate = rates.find(r => r.currencyCode === "USD")?.rate;
  const eurRate = rates.find(r => r.currencyCode === "EUR")?.rate;
  if (usdRate && eurRate && eurRate > 0) return usdRate / eurRate;
  return 0.92; // fallback
}

// Hardcoded fallbacks — used only when NBU DB has no data for a currency

export async function getCurrencyToEurRate(currency: string): Promise<number | null> {
  const today = new Date();
  const rates = await prisma.nbuRate.findMany({
    where: { currencyCode: { in: [currency, "EUR"] }, date: { lte: today } },
    orderBy: { date: "desc" },
    take: 10,
  });
  const currRate = rates.find(r => r.currencyCode === currency)?.rate;
  const eurRate = rates.find(r => r.currencyCode === "EUR")?.rate;
  if (currRate && eurRate && eurRate > 0) return currRate / eurRate;
  return null;
}

// --- Investments Summary (all brokers from DB) ---

export async function getInvestmentsSummary() {
  const user = await requireUser();

  const [positions, summaries, connectionKeys, usdToEur] = await Promise.all([
    prisma.brokerPosition.findMany({
      where: { userId: user.id },
      orderBy: [{ broker: "asc" }, { marketValue: "desc" }],
    }),
    prisma.brokerAccountSummary.findMany({
      where: { userId: user.id },
    }),
    prisma.secret.findMany({
      where: { userId: user.id, key: { in: ["ibkr_account_id", "etoro_user_key", "trading212_secret_key"] } },
      select: { key: true, value: true },
    }),
    getUsdToEurRate(),
  ]);

  const keyMap = Object.fromEntries(connectionKeys.map(k => [k.key, k.value]));
  const connected: Record<string, boolean> = {
    ibkr: !!keyMap["ibkr_account_id"],
    etoro: !!keyMap["etoro_user_key"],
    trading212: !!keyMap["trading212_secret_key"],
  };

  // Collect non-EUR/USD currencies that need FX rates
  const allCurrencies = new Set<string>();
  for (const s of summaries) allCurrencies.add(s.currency);
  for (const p of positions) allCurrencies.add(p.currency);
  const extraCurrencies = [...allCurrencies].filter(c => c !== "EUR" && c !== "USD" && c !== "BASE");

  // Build FX cache: currency → EUR rate (from NBU cross-rates, fallback to hardcoded)
  const fxCache: Record<string, number> = {};
  await Promise.all(
    extraCurrencies.map(async (c) => {
      const rate = await getCurrencyToEurRate(c);
      fxCache[c] = rate ?? FALLBACK_TO_EUR[c] ?? 1;
    }),
  );

  // Aggregate totals — convert everything to EUR
  let totalPortfolio = 0;
  let totalPnl = 0;
  for (const s of summaries) {
    totalPortfolio += toEur(Number(s.netLiquidation), s.currency, usdToEur, fxCache);
    totalPnl += toEur(Number(s.unrealizedPnl), s.currency, usdToEur, fxCache);
  }

  // Group positions by broker — add EUR values
  const positionsByBroker: Record<string, (typeof positions[0] & { marketValueEur: number; unrealizedPnlEur: number })[]> = {};
  for (const p of positions) {
    if (!positionsByBroker[p.broker]) positionsByBroker[p.broker] = [];
    positionsByBroker[p.broker].push({
      ...p,
      marketValueEur: toEur(Number(p.marketValue), p.currency, usdToEur, fxCache),
      unrealizedPnlEur: toEur(Number(p.unrealizedPnl), p.currency, usdToEur, fxCache),
    });
  }

  // Summary per broker — all in EUR
  const brokerSummaries: Record<string, { nav: number; navEur: number; pnl: number; pnlEur: number; cash: number; cashEur: number; currency: string }> = {};
  for (const s of summaries) {
    brokerSummaries[s.broker] = {
      nav: Number(s.netLiquidation),
      navEur: toEur(Number(s.netLiquidation), s.currency, usdToEur, fxCache),
      pnl: Number(s.unrealizedPnl),
      pnlEur: toEur(Number(s.unrealizedPnl), s.currency, usdToEur, fxCache),
      cash: Number(s.totalCashValue),
      cashEur: toEur(Number(s.totalCashValue), s.currency, usdToEur, fxCache),
      currency: s.currency,
    };
  }

  return {
    totalPortfolio: Math.round(totalPortfolio * 100) / 100,
    totalPnl: Math.round(totalPnl * 100) / 100,
    connectedCount: Object.values(connected).filter(Boolean).length,
    positionsCount: positions.length,
    connected,
    positionsByBroker,
    brokerSummaries,
    usdToEur: Math.round(usdToEur * 10000) / 10000,
  };
}

// --- Broker Transactions (shared across brokers) ---

export async function getBrokerTransactions(broker?: string, limit = 50) {
  const user = await requireUser();
  const where: { userId: number; broker?: string } = { userId: user.id };
  if (broker) where.broker = broker;

  return prisma.brokerTransaction.findMany({
    where,
    orderBy: { executedAt: "desc" },
    take: limit,
  });
}

