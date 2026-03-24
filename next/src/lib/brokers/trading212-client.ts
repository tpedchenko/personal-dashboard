/**
 * Trading 212 REST API client.
 * Base URL: https://live.trading212.com/api/v0/
 * Auth: Basic Auth (base64(apiKey:apiSecret))
 * Docs: https://docs.trading212.com/api
 */

export interface T212Position {
  ticker: string;
  quantity: number;
  averagePrice: number;
  currentPrice: number;
  ppl: number;
  fxPpl: number | null;
  initialFillDate: string;
  frontend: string;
  maxBuy: number;
  maxSell: number;
  pieQuantity: number;
}

export interface T212AccountCash {
  free: number;
  total: number;
  ppl: number;
  result: number;
  invested: number;
  pieCash: number;
  blocked: number;
}

export interface T212AccountInfo {
  currencyCode: string;
  id: number;
}

interface T212Response<T> {
  data: T | null;
  error: string | null;
}

const BASE_URL = "https://live.trading212.com/api/v0";

function makeBasicAuth(apiKey: string, apiSecret: string): string {
  return "Basic " + Buffer.from(`${apiKey}:${apiSecret}`).toString("base64");
}

async function t212Fetch<T>(apiKey: string, apiSecret: string, endpoint: string): Promise<T212Response<T>> {
  try {
    const resp = await fetch(`${BASE_URL}${endpoint}`, {
      headers: {
        Authorization: makeBasicAuth(apiKey, apiSecret),
        "Content-Type": "application/json",
      },
      cache: "no-store",
    });
    if (!resp.ok) return { data: null, error: `Trading 212 API error: ${resp.status}` };
    return { data: await resp.json() as T, error: null };
  } catch (e) {
    return { data: null, error: e instanceof Error ? e.message : "Connection failed" };
  }
}

export async function getPortfolio(apiKey: string, apiSecret: string) {
  return t212Fetch<T212Position[]>(apiKey, apiSecret, "/equity/portfolio");
}

export async function getAccountCash(apiKey: string, apiSecret: string) {
  return t212Fetch<T212AccountCash>(apiKey, apiSecret, "/equity/account/cash");
}

export async function getAccountInfo(apiKey: string, apiSecret: string) {
  return t212Fetch<T212AccountInfo>(apiKey, apiSecret, "/equity/account/info");
}

export async function testConnection(apiKey: string, apiSecret: string): Promise<{ ok: boolean; message: string }> {
  const res = await getAccountInfo(apiKey, apiSecret);
  if (res.error) return { ok: false, message: res.error };
  if (!res.data) return { ok: false, message: "No response" };
  return { ok: true, message: `Connected: Account #${res.data.id} (${res.data.currencyCode})` };
}
