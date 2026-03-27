/**
 * Freqtrade REST API client.
 * Connects to Freqtrade bot API for trading data.
 * Uses HTTP Basic authentication.
 *
 * Config resolution order:
 * 1. User secrets from DB (freqtrade_api_url, freqtrade_username, freqtrade_password)
 * 2. Environment variables (FREQTRADE_URL, FREQTRADE_USER, FREQTRADE_PASS)
 */

import { getCurrentUserId } from "@/lib/current-user";
import { prisma } from "@/lib/db";

/** Read env vars at runtime — bypass Next.js build-time inlining */
function getEnvConfig() {
  // Use dynamic property access to prevent Next.js from inlining at build time
  const env = globalThis.process?.env ?? {};
  return {
    url: env["FREQTRADE_URL"] || "http://localhost:8082",
    user: env["FREQTRADE_USER"] || "",
    pass: env["FREQTRADE_PASS"] || "",
  };
}

/** Read a user secret from DB, decrypting if needed. */
async function readSecret(userId: number, key: string): Promise<string | null> {
  const secret = await prisma.secret.findUnique({
    where: { userId_key: { userId, key } },
  });
  if (!secret?.value) return null;
  try {
    const { decryptGraceful } = await import("@/lib/encryption");
    return decryptGraceful(secret.value);
  } catch {
    return secret.value;
  }
}

/** Get Freqtrade config: try user secrets from DB first, fall back to env vars */
async function getConfig() {
  try {
    const userId = await getCurrentUserId();
    if (userId) {
      const [dbUrl, dbUser, dbPass] = await Promise.all([
        readSecret(userId, "freqtrade_api_url"),
        readSecret(userId, "freqtrade_username"),
        readSecret(userId, "freqtrade_password"),
      ]);
      if (dbUrl) {
        return {
          url: dbUrl,
          user: dbUser ?? "",
          pass: dbPass ?? "",
        };
      }
    }
  } catch {
    // No authenticated user or DB error — fall back to env vars
  }
  return getEnvConfig();
}

interface FreqtradeResponse<T = unknown> {
  data: T | null;
  error: string | null;
}

async function ftFetch<T>(endpoint: string, options?: RequestInit): Promise<FreqtradeResponse<T>> {
  try {
    const { url, user, pass } = await getConfig();
    if (!url || url === "http://localhost:8082") {
      console.error("[Freqtrade] FREQTRADE_URL not set! env:", process.env.FREQTRADE_URL, "fallback:", url);
    }
    const auth = Buffer.from(`${user}:${pass}`).toString("base64");
    const resp = await fetch(`${url}/api/v1${endpoint}`, {
      ...options,
      headers: {
        "Authorization": `Basic ${auth}`,
        "Content-Type": "application/json",
        ...options?.headers,
      },
      cache: "no-store",
    });

    if (!resp.ok) {
      return { data: null, error: `Freqtrade API error: ${resp.status}` };
    }

    const data = await resp.json() as T;
    return { data, error: null };
  } catch (e) {
    return { data: null, error: e instanceof Error ? e.message : "Connection failed" };
  }
}

// Types
export interface FtTrade {
  trade_id: number;
  pair: string;
  is_open: boolean;
  fee_open: number;
  fee_close: number;
  amount: number;
  stake_amount: number;
  open_rate: number;
  close_rate: number | null;
  profit_ratio: number;
  profit_abs: number;
  profit_pct: number;
  open_date: string;
  close_date: string | null;
  open_order_id: string | null;
  close_profit: number | null;
  close_profit_abs: number | null;
  sell_reason: string | null;
  exit_reason: string | null;
  strategy: string;
  timeframe: string;
  enter_tag: string | null;
}

export interface FtProfit {
  profit_all_coin: number;
  profit_all_percent_mean: number;
  profit_all_ratio_mean: number;
  profit_all_percent_sum: number;
  profit_all_ratio_sum: number;
  profit_all_fiat: number;
  trade_count: number;
  closed_trade_count: number;
  first_trade_date: string;
  latest_trade_date: string;
  avg_duration: string;
  best_pair: string;
  best_rate: number;
  winning_trades: number;
  losing_trades: number;
}

export interface FtBalance {
  currencies: Array<{
    currency: string;
    free: number;
    balance: number;
    used: number;
    est_stake: number;
  }>;
  total: number;
  symbol: string;
  value: number;
  stake: string;
  note: string;
}

export interface FtStatus {
  trade_id: number;
  pair: string;
  base_currency: string;
  stake_amount: number;
  amount: number;
  open_rate: number;
  current_rate: number;
  current_profit: number;
  current_profit_abs: number;
  current_profit_pct: number;
  profit_ratio: number;
  profit_pct: number;
  profit_abs: number;
  stoploss_current_dist: number;
  stoploss_current_dist_pct: number;
  open_date: string;
  strategy: string;
}

export interface FtConfig {
  strategy: string;
  strategy_version: string | null;
  dry_run: boolean;
  exchange: string;
  state: string;
  runmode: string;
  stake_currency: string;
  stake_amount: string;
  max_open_trades: number;
  stoploss: number;
  trailing_stop: boolean;
  trailing_stop_positive: number;
  trailing_stop_positive_offset: number;
  trailing_only_offset_is_reached: boolean;
  minimal_roi: Record<string, number>;
  timeframe: string;
}

// API Methods
export async function getOpenTrades() {
  return ftFetch<FtStatus[]>("/status");
}

export async function getAllTrades(limit = 50) {
  return ftFetch<{ trades: FtTrade[]; trades_count: number }>(`/trades?limit=${limit}`);
}

export async function getProfit() {
  return ftFetch<FtProfit>("/profit");
}

export async function getBalance() {
  return ftFetch<FtBalance>("/balance");
}

export async function getBotConfig() {
  return ftFetch<FtConfig>("/show_config");
}

export async function getBotState() {
  return ftFetch<{ state: string }>("/state");
}

export async function getPerformance() {
  return ftFetch<Array<{ pair: string; profit: number; profit_abs: number; count: number }>>("/performance");
}

export async function getDailyProfit(days = 30) {
  return ftFetch<{ data: Array<{ date: string; abs_profit: number; trade_count: number }> }>(`/daily?timescale=${days}`);
}

export async function getStrategies() {
  return ftFetch<{ strategies: string[] }>("/strategies");
}

export async function reloadConfig() {
  return ftFetch<{ status: string }>("/reload_config", { method: "POST" });
}

export async function startBot() {
  return ftFetch<{ status: string }>("/start", { method: "POST" });
}

export async function stopBot() {
  return ftFetch<{ status: string }>("/stop", { method: "POST" });
}

export async function forceExit(tradeId: number) {
  return ftFetch<{ result: string }>("/forceexit", {
    method: "POST",
    body: JSON.stringify({ tradeid: String(tradeId) }),
  });
}
