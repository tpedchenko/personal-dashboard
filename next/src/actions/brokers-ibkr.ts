"use server";

import { requireUser, isCurrentUserDemo } from "@/lib/current-user";
import { getSecret, getUserPreference } from "@/actions/settings";
import {
  getAuthStatus, tickle, getAccounts, getPositions, getAccountSummary,
  getAllocation, getTrades, getTransactions, getPerformance,
  flexStatementRequest, flexStatementGet,
  type IbkrTrade, type IbkrAllocation, type IbkrPerformanceData,
} from "@/lib/brokers/ibkr-client";
import { prisma } from "@/lib/db";

export async function checkIbkrSession(): Promise<{ authenticated: boolean; gatewayUrl: string | null; message: string }> {
  await requireUser();
  const url = await getSecret("ibkr_gateway_url");
  if (!url) return { authenticated: false, gatewayUrl: null, message: "Not configured" };

  await tickle(url).catch(() => {});
  const res = await getAuthStatus(url);
  if (res.error) return { authenticated: false, gatewayUrl: url, message: `Gateway not reachable: ${res.error}` };
  if (!res.data) return { authenticated: false, gatewayUrl: url, message: "No response" };
  if (res.data.authenticated) return { authenticated: true, gatewayUrl: url, message: "Authenticated" };
  return { authenticated: false, gatewayUrl: url, message: "Session expired — click Login" };
}

export async function testIbkrConnection(): Promise<{ ok: boolean; message: string }> {
  await requireUser();
  const url = await getSecret("ibkr_gateway_url");
  if (!url) return { ok: false, message: "Gateway URL not configured" };

  // First tickle to wake up session
  await tickle(url);

  const res = await getAuthStatus(url);
  if (res.error) return { ok: false, message: `Connection failed: ${res.error}` };
  if (!res.data) return { ok: false, message: "No response from gateway" };

  if (res.data.authenticated) {
    return { ok: true, message: `Authenticated (${res.data.serverInfo?.serverName ?? "IBKR"})` };
  }

  return { ok: false, message: res.data.message || "Not authenticated — log in via browser at gateway URL" };
}

export async function getIbkrPortfolio() {
  const user = await requireUser();
  const [url, accountId] = await Promise.all([
    getSecret("ibkr_gateway_url"),
    getSecret("ibkr_account_id"),
  ]);
  if (!url || !accountId) return { error: "IBKR not configured" };

  // Tickle to keep session alive
  await tickle(url);

  const [authRes, positionsRes, summaryRes] = await Promise.all([
    getAuthStatus(url),
    getPositions(url, accountId).catch(() => ({ data: null, error: "positions failed" })),
    getAccountSummary(url, accountId).catch(() => ({ data: null, error: "summary failed" })),
  ]);

  if (!authRes.data?.authenticated) {
    return { error: "Session expired — re-authenticate in browser" };
  }

  const summary = summaryRes.data;
  const nav = summary?.netliquidation?.amount ?? summary?.netLiquidation?.amount ?? null;
  const unrealizedPnl = summary?.unrealizedpnl?.amount ?? null;
  const realizedPnl = summary?.realizedpnl?.amount ?? null;
  const totalCash = summary?.totalcashvalue?.amount ?? null;

  return {
    authenticated: true,
    positions: positionsRes.data ?? [],
    summary: {
      nav,
      unrealizedPnl,
      realizedPnl,
      totalCash,
      currency: summary?.netliquidation?.currency ?? "USD",
    },
    error: null,
  };
}

export async function getIbkrAccounts() {
  await requireUser();
  const url = await getSecret("ibkr_gateway_url");
  if (!url) return { accounts: [], error: "Not configured" };

  await tickle(url);
  const res = await getAccounts(url);
  return { accounts: res.data?.accounts ?? [], error: res.error };
}

// --- Sync IBKR data to DB ---

export async function syncIbkrToDb(): Promise<{ ok: boolean; message: string }> {
  if (await isCurrentUserDemo()) {
    return { ok: true, message: "Demo mode" };
  }
  const user = await requireUser();

  // Prefer Flex Web Service (no gateway needed)
  const flexQueryId = await getUserPreference("ibkr_flex_query_id");
  const flexToken = await getSecret("ibkr_flex_token");
  if (flexToken && flexQueryId) {
    return importFlexStatement(flexQueryId);
  }

  // Fallback: CP Gateway (requires Java app + browser login)
  const [url, accountId] = await Promise.all([
    getSecret("ibkr_gateway_url"),
    getSecret("ibkr_account_id"),
  ]);
  if (!url || !accountId) return { ok: false, message: "IBKR not configured. Set Flex Token + Query ID in Settings → IBKR." };

  await tickle(url);
  const authRes = await getAuthStatus(url);
  if (!authRes.data?.authenticated) {
    return { ok: false, message: "CP Gateway session expired. Use Flex Web Service instead (Settings → IBKR)." };
  }

  const [positionsRes, summaryRes] = await Promise.all([
    getPositions(url, accountId).catch(() => ({ data: null, error: "failed" })),
    getAccountSummary(url, accountId).catch(() => ({ data: null, error: "failed" })),
  ]);

  // Batch upsert positions in a single transaction
  const positions = positionsRes.data ?? [];
  if (positions.length > 0) {
    await prisma.$transaction(
      positions.map((p) =>
        prisma.brokerPosition.upsert({
          where: { userId_broker_symbol: { userId: user.id, broker: "IBKR", symbol: p.contractDesc || String(p.conid) } },
          update: {
            conid: String(p.conid),
            name: p.ticker ?? p.contractDesc,
            quantity: p.position,
            avgCost: p.avgCost,
            marketPrice: p.mktPrice,
            marketValue: p.mktValue,
            unrealizedPnl: p.unrealizedPnl,
            realizedPnl: p.realizedPnl,
            currency: p.currency,
            assetClass: p.assetClass,
            lastSyncedAt: new Date(),
          },
          create: {
            userId: user.id, broker: "IBKR", symbol: p.contractDesc || String(p.conid),
            conid: String(p.conid), name: p.ticker ?? p.contractDesc,
            quantity: p.position, avgCost: p.avgCost, marketPrice: p.mktPrice,
            marketValue: p.mktValue, unrealizedPnl: p.unrealizedPnl, realizedPnl: p.realizedPnl,
            currency: p.currency, assetClass: p.assetClass,
          },
        })
      )
    );
  }

  // Upsert account summary
  const summary = summaryRes.data as Record<string, { amount?: number; currency?: string }> | null;
  if (summary) {
    const nav = summary.netliquidation?.amount ?? summary.netLiquidation?.amount ?? 0;
    const cash = summary.totalcashvalue?.amount ?? 0;
    const gpv = summary.grosspositionvalue?.amount ?? 0;
    const upnl = summary.unrealizedpnl?.amount ?? 0;
    const rpnl = summary.realizedpnl?.amount ?? 0;
    const curr = summary.netliquidation?.currency ?? "USD";

    await prisma.brokerAccountSummary.upsert({
      where: { userId_broker_accountId: { userId: user.id, broker: "IBKR", accountId } },
      update: { netLiquidation: nav, totalCashValue: cash, grossPositionValue: gpv, unrealizedPnl: upnl, realizedPnl: rpnl, currency: curr, syncedAt: new Date() },
      create: { userId: user.id, broker: "IBKR", accountId, netLiquidation: nav, totalCashValue: cash, grossPositionValue: gpv, unrealizedPnl: upnl, realizedPnl: rpnl, currency: curr },
    });
  }

  return { ok: true, message: `Synced ${positions.length} positions` };
}

// --- IBKR Extended: Allocation, Performance, Transactions ---

async function getIbkrConfig() {
  await requireUser();
  const [url, accountId] = await Promise.all([
    getSecret("ibkr_gateway_url"),
    getSecret("ibkr_account_id"),
  ]);
  if (!url || !accountId) return null;
  return { url, accountId };
}

export async function getIbkrAllocation(): Promise<{ data: IbkrAllocation | null; error: string | null }> {
  const cfg = await getIbkrConfig();
  if (!cfg) return { data: null, error: "IBKR not configured" };

  await tickle(cfg.url);
  const res = await getAllocation(cfg.url, cfg.accountId);
  return { data: res.data, error: res.error };
}

export async function getIbkrPerformance(period: string = "1Y"): Promise<{ data: IbkrPerformanceData | null; error: string | null }> {
  const cfg = await getIbkrConfig();
  if (!cfg) return { data: null, error: "IBKR not configured" };

  await tickle(cfg.url);
  const res = await getPerformance(cfg.url, [cfg.accountId], period);
  const first = res.data?.data?.[0] ?? null;
  return { data: first, error: res.error };
}

export async function getIbkrTrades(): Promise<{ trades: IbkrTrade[]; error: string | null }> {
  const cfg = await getIbkrConfig();
  if (!cfg) return { trades: [], error: "IBKR not configured" };

  await tickle(cfg.url);
  const res = await getTrades(cfg.url, cfg.accountId);
  return { trades: res.data ?? [], error: res.error };
}

export async function syncIbkrTradesToDb(): Promise<{ ok: boolean; message: string }> {
  const user = await requireUser();
  const cfg = await getIbkrConfig();
  if (!cfg) return { ok: false, message: "IBKR not configured" };

  await tickle(cfg.url);
  const authRes = await getAuthStatus(cfg.url);
  if (!authRes.data?.authenticated) {
    return { ok: false, message: "Session expired" };
  }

  const tradesRes = await getTrades(cfg.url, cfg.accountId);
  const trades = tradesRes.data ?? [];

  // Batch all upserts in a single database transaction
  const upserts = trades.map((t) => {
    const side = t.side?.toUpperCase() ?? "BUY";
    const type = side === "B" || side === "BOT" || side === "BUY" ? "BUY" : "SELL";
    const executedAt = new Date(t.trade_time_r * 1000);

    return prisma.brokerTransaction.upsert({
      where: {
        userId_broker_symbol_type_executedAt: {
          userId: user.id, broker: "IBKR", symbol: t.symbol || t.contract_description_1, type, executedAt,
        },
      },
      update: {
        conid: String(t.conid), quantity: Math.abs(t.size), price: t.price,
        amount: t.net_amount, commission: t.commission, currency: t.currency,
      },
      create: {
        userId: user.id, broker: "IBKR", symbol: t.symbol || t.contract_description_1,
        conid: String(t.conid), type, quantity: Math.abs(t.size), price: t.price,
        amount: t.net_amount, commission: t.commission, currency: t.currency, executedAt,
      },
    });
  });

  if (upserts.length > 0) {
    await prisma.$transaction(upserts);
  }

  return { ok: true, message: `Synced ${trades.length} trades` };
}

// --- Flex Web Service ---

export async function requestFlexStatement(queryId: string): Promise<{ referenceCode: string | null; error: string | null }> {
  await requireUser();
  const token = await getSecret("ibkr_flex_token");
  if (!token) return { referenceCode: null, error: "Flex token not configured. Set it in Settings → IBKR → Flex Query Token." };

  const res = await flexStatementRequest(token, queryId);
  return { referenceCode: res.data?.referenceCode ?? null, error: res.error };
}

export async function getFlexStatement(referenceCode: string): Promise<{ xml: string | null; error: string | null }> {
  await requireUser();
  const token = await getSecret("ibkr_flex_token");
  if (!token) return { xml: null, error: "Flex token not configured" };

  const res = await flexStatementGet(token, referenceCode);
  return { xml: res.data, error: res.error };
}

export async function importFlexStatement(queryId: string): Promise<{ ok: boolean; message: string }> {
  const user = await requireUser();
  const token = await getSecret("ibkr_flex_token");
  if (!token) return { ok: false, message: "Flex token not configured. Go to Settings → IBKR." };

  // Step 1: Request statement generation
  const reqRes = await flexStatementRequest(token, queryId);
  if (reqRes.error || !reqRes.data) return { ok: false, message: reqRes.error ?? "Request failed" };

  // Step 2: Poll for result (max 3 attempts, 3s apart)
  let xml: string | null = null;
  for (let i = 0; i < 3; i++) {
    const getRes = await flexStatementGet(token, reqRes.data.referenceCode);
    if (getRes.error === "GENERATING") {
      await new Promise(r => setTimeout(r, 3000));
      continue;
    }
    if (getRes.error) return { ok: false, message: getRes.error };
    xml = getRes.data;
    break;
  }

  if (!xml) return { ok: false, message: "Statement still generating. Try again in a few seconds." };

  // Step 3: Parse Open Positions from Flex XML (order-independent attribute extraction)
  function attr(tag: string, name: string): string {
    const m = tag.match(new RegExp(`${name}="([^"]*)"`));
    return m?.[1] ?? "";
  }

  const positionTags = xml.match(/<OpenPosition\s[^>]*?\/>/g) || [];
  const now = new Date();

  // Build all positions, then batch insert
  const positionsData = positionTags
    .map(tag => {
      const symbol = attr(tag, "symbol");
      const qty = attr(tag, "position");
      if (!symbol || !qty || parseFloat(qty) === 0) return null;
      return {
        userId: user.id,
        broker: "IBKR" as const,
        symbol,
        name: attr(tag, "description"),
        conid: attr(tag, "conid"),
        quantity: parseFloat(qty),
        avgCost: parseFloat(attr(tag, "costBasisMoney")) / parseFloat(qty) || 0,
        marketPrice: parseFloat(attr(tag, "markPrice")),
        marketValue: parseFloat(attr(tag, "positionValue")),
        unrealizedPnl: parseFloat(attr(tag, "fifoPnlUnrealized")),
        realizedPnl: 0,
        currency: attr(tag, "currency"),
        assetClass: attr(tag, "assetCategory") || "STK",
        lastSyncedAt: now,
      };
    })
    .filter((p): p is NonNullable<typeof p> => p !== null);

  // Batch: delete old + create all in one transaction
  await prisma.$transaction([
    prisma.brokerPosition.deleteMany({ where: { userId: user.id, broker: "IBKR" } }),
    ...positionsData.map(data => prisma.brokerPosition.create({ data })),
  ]);
  const posCount = positionsData.length;

  // Step 4: Parse NAV from EquitySummaryByReportDateInBase (last entry)
  const navTags = xml.match(/<EquitySummaryByReportDateInBase\s[^>]*?\/>/g) || [];
  const lastNavTag = navTags[navTags.length - 1];

  if (lastNavTag) {
    const accountId = await getSecret("ibkr_account_id") || "IBKR";
    const cash = parseFloat(attr(lastNavTag, "cash"));
    const stock = parseFloat(attr(lastNavTag, "stock"));
    const total = parseFloat(attr(lastNavTag, "total"));

    await prisma.brokerAccountSummary.upsert({
      where: { userId_broker_accountId: { userId: user.id, broker: "IBKR", accountId } },
      update: {
        netLiquidation: total,
        totalCashValue: cash,
        grossPositionValue: stock,
        unrealizedPnl: posCount > 0 ? (await prisma.brokerPosition.aggregate({ where: { userId: user.id, broker: "IBKR" }, _sum: { unrealizedPnl: true } }))._sum.unrealizedPnl || 0 : 0,
        realizedPnl: 0,
        currency: "EUR",
        syncedAt: new Date(),
      },
      create: {
        userId: user.id,
        broker: "IBKR",
        accountId,
        netLiquidation: total,
        totalCashValue: cash,
        grossPositionValue: stock,
        unrealizedPnl: 0,
        realizedPnl: 0,
        currency: "EUR",
        syncedAt: new Date(),
      },
    });
  }

  // Step 5: Parse dividends from OpenDividendAccrual
  const divMatches = xml.matchAll(/<OpenDividendAccrual[^>]*?symbol="([^"]*)"[^>]*?grossAmount="([^"]*)"[^>]*?tax="([^"]*)"[^>]*?netAmount="([^"]*)"[^>]*?\/>/g);
  let divCount = 0;
  for (const m of divMatches) {
    divCount++;
  }

  const parts: string[] = [];
  if (posCount > 0) parts.push(`${posCount} positions`);
  if (lastNavTag) parts.push(`NAV EUR ${parseFloat(attr(lastNavTag, "total")).toFixed(0)}`);
  if (divCount > 0) parts.push(`${divCount} dividend accruals`);

  return { ok: true, message: parts.length > 0 ? `Synced: ${parts.join(", ")}` : "No data in Flex statement" };
}
