/**
 * Interactive Brokers Client Portal Gateway REST API client.
 * Connects to CP Gateway running on localhost or NAS.
 * IBKR Gateway uses a self-signed certificate — set IBKR_SKIP_TLS_VERIFY=true
 * to allow connections (only when connecting to a trusted local gateway).
 */

import https from "node:https";

const agent = new https.Agent({
  rejectUnauthorized: process.env.IBKR_SKIP_TLS_VERIFY !== "true",
});

export interface IbkrAuthStatus {
  authenticated: boolean;
  connected: boolean;
  competing: boolean;
  fail: string;
  message: string;
  MAC: string;
  serverInfo?: { serverName: string; serverVersion: string };
}

export interface IbkrAccount {
  id: string;
  accountId: string;
  accountTitle: string;
  displayName: string;
  accountAlias: string;
  type: string;
  currency: string;
}

export interface IbkrPosition {
  acctId: string;
  conid: number;
  contractDesc: string;
  position: number;
  mktPrice: number;
  mktValue: number;
  avgCost: number;
  avgPrice: number;
  unrealizedPnl: number;
  realizedPnl: number;
  currency: string;
  assetClass: string;
  ticker?: string;
}

export interface IbkrSummary {
  [key: string]: {
    amount: number;
    currency: string;
    isNull: boolean;
  };
}

export interface IbkrLedgerEntry {
  currency: string;
  cashbalance: number;
  settledcash: number;
  exchangerate: number;
}

export interface IbkrTrade {
  execution_id: string;
  symbol: string;
  conid: number;
  side: string; // BUY / SELL
  order_description: string;
  contract_description_1: string;
  listing_exchange: string;
  trade_time: string;
  trade_time_r: number;
  size: number;
  price: number;
  commission: number;
  net_amount: number;
  account: string;
  sec_type: string; // STK, OPT, FUT, etc.
  currency: string;
  realized_pnl?: number;
}

export interface IbkrAllocation {
  assetClass?: { long: Record<string, number>; short: Record<string, number> };
  sector?: { long: Record<string, number>; short: Record<string, number> };
  group?: { long: Record<string, number>; short: Record<string, number> };
}

export interface IbkrPerformanceData {
  nav?: { data: number[]; dates: string[]; };
  cps?: { data: number[]; dates: string[]; };
  tpv?: { data: number[]; dates: string[]; };
  pm?: string;
}

export interface IbkrTransaction {
  acctId: string;
  conid: number;
  currency: string;
  desc: string;
  fxRate: number;
  date: string;
  type: string;
  amount: number;
}

interface IbkrResponse<T> {
  data: T | null;
  error: string | null;
}

async function ibkrFetch<T>(gatewayUrl: string, endpoint: string): Promise<IbkrResponse<T>> {
  try {
    const url = `${gatewayUrl}/v1/api${endpoint}`;
    const resp = await fetch(url, {
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
      // @ts-expect-error Node.js fetch supports agent
      agent: gatewayUrl.startsWith("https") ? agent : undefined,
    });

    if (!resp.ok) {
      return { data: null, error: `IBKR API error: ${resp.status}` };
    }

    const data = await resp.json() as T;
    return { data, error: null };
  } catch (e) {
    return { data: null, error: e instanceof Error ? e.message : "Connection failed" };
  }
}

async function ibkrPost<T>(gatewayUrl: string, endpoint: string): Promise<IbkrResponse<T>> {
  try {
    const url = `${gatewayUrl}/v1/api${endpoint}`;
    const resp = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
      // @ts-expect-error Node.js fetch supports agent
      agent: gatewayUrl.startsWith("https") ? agent : undefined,
    });

    if (!resp.ok) {
      return { data: null, error: `IBKR API error: ${resp.status}` };
    }

    const data = await resp.json() as T;
    return { data, error: null };
  } catch (e) {
    return { data: null, error: e instanceof Error ? e.message : "Connection failed" };
  }
}

// --- Public API ---

export async function getAuthStatus(gatewayUrl: string) {
  return ibkrFetch<IbkrAuthStatus>(gatewayUrl, "/iserver/auth/status");
}

export async function tickle(gatewayUrl: string) {
  return ibkrPost<{ session: string; ssoExpires: number }>(gatewayUrl, "/tickle");
}

export async function getAccounts(gatewayUrl: string) {
  return ibkrFetch<{ accounts: string[]; selectedAccount: string }>(gatewayUrl, "/portfolio/accounts");
}

export async function getPositions(gatewayUrl: string, accountId: string) {
  return ibkrFetch<IbkrPosition[]>(gatewayUrl, `/portfolio/${accountId}/positions/0`);
}

export async function getAccountSummary(gatewayUrl: string, accountId: string) {
  return ibkrFetch<IbkrSummary>(gatewayUrl, `/portfolio/${accountId}/summary`);
}

export async function getLedger(gatewayUrl: string, accountId: string) {
  return ibkrFetch<Record<string, IbkrLedgerEntry>>(gatewayUrl, `/portfolio/${accountId}/ledger`);
}

export async function getPerformance(gatewayUrl: string, accountIds: string[], period: string = "1Y") {
  const ids = accountIds.join(",");
  return ibkrPost<{ currencyType: string; data: IbkrPerformanceData[] }>(gatewayUrl, `/pa/performance?acctIds=${ids}&period=${period}`);
}

export async function getAllocation(gatewayUrl: string, accountId: string) {
  return ibkrFetch<IbkrAllocation>(gatewayUrl, `/portfolio/${accountId}/allocation`);
}

export async function getTrades(gatewayUrl: string, accountId: string) {
  return ibkrFetch<IbkrTrade[]>(gatewayUrl, `/iserver/account/${accountId}/trades`);
}

export async function getTransactions(gatewayUrl: string, accountId: string, conid?: number, currency?: string, days?: number) {
  const params = new URLSearchParams();
  params.set("acctId", accountId);
  if (conid) params.set("conid", String(conid));
  if (currency) params.set("currency", currency);
  if (days) params.set("days", String(days));
  return ibkrFetch<{ transactions: IbkrTransaction[]; id: string }>(gatewayUrl, `/portfolio/transactions?${params.toString()}`);
}

// --- Flex Web Service (separate from CP Gateway) ---

const FLEX_BASE = "https://gdcdyn.interactivebrokers.com/Universal/servlet";

export async function flexStatementRequest(token: string, queryId: string) {
  try {
    const url = `${FLEX_BASE}/FlexStatementService.SendRequest?t=${token}&q=${queryId}&v=3`;
    const resp = await fetch(url);
    const text = await resp.text();

    const statusMatch = text.match(/<Status>(\w+)<\/Status>/);
    const refCodeMatch = text.match(/<ReferenceCode>(\w+)<\/ReferenceCode>/);
    const errorMatch = text.match(/<ErrorMessage>([^<]+)<\/ErrorMessage>/);

    if (statusMatch?.[1] !== "Success" || !refCodeMatch?.[1]) {
      return { data: null, error: errorMatch?.[1] ?? "Flex request failed" };
    }
    return { data: { referenceCode: refCodeMatch[1] }, error: null };
  } catch (e) {
    return { data: null, error: e instanceof Error ? e.message : "Flex request failed" };
  }
}

export async function flexStatementGet(token: string, referenceCode: string) {
  try {
    const url = `${FLEX_BASE}/FlexStatementService.GetStatement?t=${token}&q=${referenceCode}&v=3`;
    const resp = await fetch(url);
    const text = await resp.text();

    // Check if still generating
    if (text.includes("<Status>Warn</Status>") && text.includes("Statement generation in progress")) {
      return { data: null, error: "GENERATING" };
    }

    const errorMatch = text.match(/<ErrorMessage>([^<]+)<\/ErrorMessage>/);
    if (errorMatch?.[1]) {
      return { data: null, error: errorMatch[1] };
    }

    return { data: text, error: null };
  } catch (e) {
    return { data: null, error: e instanceof Error ? e.message : "Flex fetch failed" };
  }
}
