"use server";

import { requireUser, isCurrentUserDemo } from "@/lib/current-user";
import { getSecret } from "@/actions/settings";
import { getPortfolio as getT212Portfolio, getAccountCash as getT212Cash, getAccountInfo as getT212Info } from "@/lib/brokers/trading212-client";
import { prisma } from "@/lib/db";

export async function syncTrading212Portfolio(): Promise<{ ok: boolean; message: string }> {
  if (await isCurrentUserDemo()) {
    return { ok: true, message: "Demo mode" };
  }
  const user = await requireUser();
  const [apiKey, apiSecret] = await Promise.all([
    getSecret("trading212_api_key_id"),
    getSecret("trading212_secret_key"),
  ]);
  if (!apiKey || !apiSecret) return { ok: false, message: "Trading 212 API key or secret not configured. Set both in Settings → Trading 212." };

  const [portfolioRes, cashRes, infoRes] = await Promise.all([
    getT212Portfolio(apiKey, apiSecret),
    getT212Cash(apiKey, apiSecret),
    getT212Info(apiKey, apiSecret),
  ]);

  if (portfolioRes.error) return { ok: false, message: `Portfolio: ${portfolioRes.error}` };

  const positions = portfolioRes.data ?? [];
  const cash = cashRes.data;
  const info = infoRes.data;
  const now = new Date();

  if (positions.length > 0) {
    await prisma.$transaction(
      positions.map((p) => {
        const marketValue = p.quantity * p.currentPrice;
        return prisma.brokerPosition.upsert({
          where: { userId_broker_symbol: { userId: user.id, broker: "TRADING212", symbol: p.ticker } },
          update: { quantity: p.quantity, avgCost: p.averagePrice, marketPrice: p.currentPrice, marketValue, unrealizedPnl: p.ppl, currency: info?.currencyCode ?? "EUR", lastSyncedAt: now },
          create: { userId: user.id, broker: "TRADING212", symbol: p.ticker, name: p.ticker, quantity: p.quantity, avgCost: p.averagePrice, marketPrice: p.currentPrice, marketValue, unrealizedPnl: p.ppl, realizedPnl: 0, currency: info?.currencyCode ?? "EUR", assetClass: "STK" },
        });
      })
    );
  }

  // Remove closed positions
  const tickers = positions.map(p => p.ticker);
  if (tickers.length > 0) {
    await prisma.brokerPosition.deleteMany({ where: { userId: user.id, broker: "TRADING212", symbol: { notIn: tickers } } });
  }

  const accountId = info?.id?.toString() ?? "trading212";
  // Clean up legacy fallback account_id if real ID is now available
  if (accountId !== "trading212") {
    await prisma.brokerAccountSummary.deleteMany({
      where: { userId: user.id, broker: "TRADING212", accountId: "trading212" },
    });
  }
  await prisma.brokerAccountSummary.upsert({
    where: { userId_broker_accountId: { userId: user.id, broker: "TRADING212", accountId } },
    update: { netLiquidation: cash?.total ?? 0, totalCashValue: cash?.free ?? 0, grossPositionValue: cash?.invested ?? 0, unrealizedPnl: positions.reduce((s, p) => s + p.ppl, 0), realizedPnl: cash?.result ?? 0, currency: info?.currencyCode ?? "EUR", syncedAt: now },
    create: { userId: user.id, broker: "TRADING212", accountId, netLiquidation: cash?.total ?? 0, totalCashValue: cash?.free ?? 0, grossPositionValue: cash?.invested ?? 0, unrealizedPnl: positions.reduce((s, p) => s + p.ppl, 0), realizedPnl: cash?.result ?? 0, currency: info?.currencyCode ?? "EUR" },
  });

  return { ok: true, message: `Synced ${positions.length} positions` };
}
