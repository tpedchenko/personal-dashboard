"use server";

import { requireUser, isCurrentUserDemo } from "@/lib/current-user";
import { getSecret } from "@/actions/settings";
import { getPnl as getEtorroPnl, testConnection as testEtorroConnection, getInstrumentInfo as getEtorroInstruments } from "@/lib/brokers/etorro-client";
import { prisma } from "@/lib/db";

export async function syncEtorroPortfolio(): Promise<{ ok: boolean; message: string }> {
  if (await isCurrentUserDemo()) {
    return { ok: true, message: "Demo mode" };
  }
  const user = await requireUser();
  const [apiKey, userKey] = await Promise.all([
    getSecret("etoro_api_key"),
    getSecret("etoro_user_key"),
  ]);
  if (!apiKey || !userKey) return { ok: false, message: "eToro API keys not configured (need both Public key and User key)" };

  const pnlRes = await getEtorroPnl(apiKey, userKey);
  if (pnlRes.error) return { ok: false, message: `eToro: ${pnlRes.error}` };
  if (!pnlRes.data?.clientPortfolio) return { ok: false, message: "eToro: empty response" };

  const cp = pnlRes.data.clientPortfolio;
  const positions = cp.positions ?? [];
  const now = new Date();

  // Resolve instrument IDs to ticker symbols and names
  const instrumentIds = [...new Set(positions.map(p => p.instrumentID))];
  const instrumentMap = new Map<number, { symbol: string; name: string }>();
  if (instrumentIds.length > 0) {
    const infoRes = await getEtorroInstruments(apiKey, userKey, instrumentIds);
    for (const inst of infoRes.data?.instrumentDisplayDatas ?? []) {
      instrumentMap.set(inst.instrumentID, {
        symbol: inst.symbolFull || String(inst.instrumentID),
        name: inst.instrumentDisplayName || inst.symbolFull || "",
      });
    }
  }

  // Calculate totals
  let totalInvested = 0;
  const totalUnrealizedPnl = cp.unrealizedPnL ?? 0;
  for (const p of positions) {
    totalInvested += p.amount ?? 0;
  }
  const credit = cp.credit ?? 0;
  const equity = Math.abs(credit) + totalInvested + totalUnrealizedPnl;
  const availableCash = credit > 0 ? credit : 0;

  if (positions.length > 0) {
    await prisma.$transaction(
      positions.map((p) => {
        const info = instrumentMap.get(p.instrumentID);
        const symbol = info?.symbol || String(p.instrumentID);
        const name = info?.name || symbol;
        const closeRate = p.unrealizedPnL?.closeRate ?? p.openRate;
        const marketValue = p.unrealizedPnL?.exposureInAccountCurrency ?? (p.units * closeRate);
        const unrealizedPnl = p.unrealizedPnL?.pnL ?? 0;
        const assetClass = p.leverage > 1 ? "CFD" : "STK";
        return prisma.brokerPosition.upsert({
          where: { userId_broker_symbol: { userId: user.id, broker: "ETORRO", symbol } },
          update: { name, quantity: p.units, avgCost: p.openRate, marketPrice: closeRate, marketValue, unrealizedPnl, currency: "USD", lastSyncedAt: now },
          create: { userId: user.id, broker: "ETORRO", symbol, name, quantity: p.units, avgCost: p.openRate, marketPrice: closeRate, marketValue, unrealizedPnl, realizedPnl: 0, currency: "USD", assetClass },
        });
      })
    );
  }

  const symbols = positions.map(p => instrumentMap.get(p.instrumentID)?.symbol || String(p.instrumentID));
  if (symbols.length > 0) {
    await prisma.brokerPosition.deleteMany({ where: { userId: user.id, broker: "ETORRO", symbol: { notIn: symbols } } });
  }

  const accountId = "etorro";
  await prisma.brokerAccountSummary.upsert({
    where: { userId_broker_accountId: { userId: user.id, broker: "ETORRO", accountId } },
    update: { netLiquidation: equity, totalCashValue: availableCash, grossPositionValue: totalInvested, unrealizedPnl: totalUnrealizedPnl, realizedPnl: 0, currency: "USD", syncedAt: now },
    create: { userId: user.id, broker: "ETORRO", accountId, netLiquidation: equity, totalCashValue: availableCash, grossPositionValue: totalInvested, unrealizedPnl: totalUnrealizedPnl, realizedPnl: 0, currency: "USD" },
  });

  return { ok: true, message: `Synced ${positions.length} positions (equity: $${equity.toFixed(2)})` };
}
