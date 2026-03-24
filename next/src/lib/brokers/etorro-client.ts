/**
 * eToro Public API client.
 * API Portal: https://api-portal.etoro.com/
 * Base URL: https://public-api.etoro.com/api/v1
 * Auth: x-api-key (public) + x-user-key (user/private)
 */

const BASE_URL = "https://public-api.etoro.com/api/v1";

export interface EtorroPosition {
  positionId: number;
  instrumentId: number;
  instrumentName?: string;
  ticker?: string;
  direction: string; // "Buy" | "Sell"
  amount: number;
  units: number;
  openRate: number;
  currentRate: number;
  netProfit: number;
  leverage: number;
  isCFD: boolean;
  openDate: string;
  stopLossRate?: number;
  takeProfitRate?: number;
  unrealizedPnl?: { pnL: number; pnLPct: number };
}

export interface EtorroPortfolio {
  positions: EtorroPosition[];
  orders?: unknown[];
}

export interface EtorroPnlResponse {
  clientPortfolio: {
    positions: EtorroRawPosition[];
    credit: number;
    unrealizedPnL: number;
    accountCurrencyId: number;
    orders: unknown[];
  };
}

export interface EtorroRawPosition {
  positionID: number;
  instrumentID: number;
  isBuy: boolean;
  openRate: number;
  amount: number;
  units: number;
  leverage: number;
  openDateTime: string;
  takeProfitRate?: number;
  stopLossRate?: number;
  totalFees: number;
  unrealizedPnL?: {
    pnL: number;
    pnlAssetCurrency: number;
    exposureInAccountCurrency: number;
    closeRate: number;
  };
}

export interface EtorroUserInfo {
  gcid: number;
  realAccountId: number;
  demoAccountId: number;
  username: string;
}

interface EtorroResponse<T> {
  data: T | null;
  error: string | null;
}

async function etorroFetch<T>(apiKey: string, userKey: string, endpoint: string): Promise<EtorroResponse<T>> {
  try {
    const resp = await fetch(`${BASE_URL}${endpoint}`, {
      headers: {
        "x-api-key": apiKey,
        "x-user-key": userKey,
        "x-request-id": crypto.randomUUID(),
        "Content-Type": "application/json",
      },
      cache: "no-store",
    });
    if (!resp.ok) {
      const body = await resp.text().catch(() => "");
      return { data: null, error: `eToro API error: ${resp.status} ${body.substring(0, 200)}` };
    }
    return { data: await resp.json() as T, error: null };
  } catch (e) {
    return { data: null, error: e instanceof Error ? e.message : "Connection failed" };
  }
}

/** Get current user identity */
export async function getMe(apiKey: string, userKey: string) {
  return etorroFetch<EtorroUserInfo>(apiKey, userKey, "/me");
}

/** Get real account portfolio (positions + orders) */
export async function getPortfolio(apiKey: string, userKey: string) {
  return etorroFetch<EtorroPortfolio>(apiKey, userKey, "/trading/info/portfolio");
}

/** Get real account P&L with equity, cash, positions */
export async function getPnl(apiKey: string, userKey: string) {
  return etorroFetch<EtorroPnlResponse>(apiKey, userKey, "/trading/info/real/pnl");
}

/** Get trade history */
export async function getTradeHistory(apiKey: string, userKey: string) {
  return etorroFetch<unknown[]>(apiKey, userKey, "/trading/info/trade/history");
}

/** Resolve instrument IDs to ticker symbols and display names */
export interface EtorroInstrumentInfo {
  instrumentID: number;
  symbolFull: string;
  instrumentDisplayName: string;
  instrumentTypeID: number;
}

export async function getInstrumentInfo(apiKey: string, userKey: string, instrumentIds: number[]) {
  const ids = instrumentIds.join(",");
  return etorroFetch<{ instrumentDisplayDatas: EtorroInstrumentInfo[] }>(apiKey, userKey, `/market-data/instruments?instrumentIds=${ids}`);
}

/** Test connection by calling /me */
export async function testConnection(apiKey: string, userKey: string): Promise<{ ok: boolean; message: string }> {
  const res = await getMe(apiKey, userKey);
  if (res.error) return { ok: false, message: res.error };
  if (!res.data) return { ok: false, message: "No response" };
  return { ok: true, message: `Connected: ${res.data.username} (GCID: ${res.data.gcid})` };
}
