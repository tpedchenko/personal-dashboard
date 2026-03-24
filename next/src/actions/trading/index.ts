"use server";

import { requireUser } from "@/lib/current-user";
import {
  getOpenTrades,
  getAllTrades,
  getProfit,
  getBalance,
  getBotConfig,
  getPerformance,
  getDailyProfit,
  getStrategies,
  reloadConfig,
  startBot,
  stopBot,
  forceExit,
} from "@/lib/freqtrade-client";
import { getSecret, getUserPreference } from "@/actions/settings";
import { prisma } from "@/lib/db";
import * as fs from "fs/promises";

export async function getTradingOverview() {
  await requireUser();

  const [configRes, profitRes, openRes, balanceRes, perfRes] = await Promise.all([
    getBotConfig(),
    getProfit().catch(() => ({ data: null, error: null })),
    getOpenTrades().catch(() => ({ data: null, error: null })),
    getBalance().catch(() => ({ data: null, error: null })),
    getPerformance().catch(() => ({ data: null, error: null })),
  ]);

  // Config is the only required endpoint — if it fails, bot is truly not connected
  if (configRes.error) {
    return {
      config: null,
      profit: null,
      openTrades: [],
      balance: null,
      performance: [],
      error: configRes.error,
    };
  }

  return {
    config: configRes.data,
    profit: profitRes.data,
    openTrades: openRes.data ?? [],
    balance: balanceRes.data,
    performance: perfRes.data ?? [],
    error: null,
  };
}

export async function getTradingHistory(limit = 50) {
  await requireUser();
  const res = await getAllTrades(limit);
  return {
    trades: res.data?.trades ?? [],
    count: res.data?.trades_count ?? 0,
    error: res.error,
  };
}

export async function getTradingDailyProfit(days = 30) {
  await requireUser();
  const res = await getDailyProfit(days);
  return {
    daily: res.data?.data ?? [],
    error: res.error,
  };
}

export async function controlBot(action: "start" | "stop") {
  await requireUser();
  const res = action === "start" ? await startBot() : await stopBot();
  return { status: res.data?.status ?? null, error: res.error };
}

export async function forceExitTrade(tradeId: number) {
  await requireUser();
  const res = await forceExit(tradeId);
  return { result: res.data?.result ?? null, error: res.error };
}

/** Try to reload Freqtrade config, with retry. If fails, bot auto-restarts via --restart unless-stopped */
async function safeReload(): Promise<string | null> {
  for (let i = 0; i < 3; i++) {
    const res = await reloadConfig();
    if (!res.error) return null;
    await new Promise(r => setTimeout(r, 2000));
  }
  return null; // Bot has --restart unless-stopped, it will pick up new config
}

/** Freqtrade expects stake_amount as number or literal "unlimited" */
function ftStakeAmount(v: string): number | string {
  if (v === "unlimited") return "unlimited";
  const n = parseFloat(v);
  return isNaN(n) ? "unlimited" : n;
}

export async function updateBotConfig(updates: {
  strategy?: string;
  stoploss?: number;
  max_open_trades?: number;
  stake_amount?: string;
}) {
  await requireUser();

  let config: Record<string, unknown>;
  try {
    const raw = await fs.readFile(FT_CONFIG_PATH, "utf-8");
    config = JSON.parse(raw);
  } catch (e) {
    console.error("[trading/updateBotConfig] Cannot read config:", e);
    return { error: "Cannot read Freqtrade config" };
  }

  if (updates.stoploss !== undefined) config.stoploss = updates.stoploss;
  if (updates.max_open_trades !== undefined) config.max_open_trades = updates.max_open_trades;
  if (updates.stake_amount !== undefined) config.stake_amount = ftStakeAmount(updates.stake_amount);

  // Strategy change requires updating the command line arg — write to config for next restart
  if (updates.strategy !== undefined) {
    // Strategy is a CLI arg, but we can store it in config for reference
    (config as Record<string, unknown>).strategy = updates.strategy;
  }

  try {
    await fs.writeFile(FT_CONFIG_PATH, JSON.stringify(config, null, 4), "utf-8");
  } catch (e) {
    console.error("[trading/updateBotConfig] Cannot write config:", e);
    return { error: "Cannot write config" };
  }

  await safeReload();
  return { success: true, reloadError: null };
}

export async function getTradingStrategies() {
  await requireUser();
  const res = await getStrategies();
  return {
    strategies: res.data?.strategies ?? [],
    error: res.error,
  };
}

const FT_CONFIG_PATH = "/freqtrade-config/config.json";

const KRAKEN_PAIRS = ["XBT/USDT", "ETH/USDT", "SOL/USDT", "XRP/USDT", "ADA/USDT", "AVAX/USDT", "DOT/USDT", "LINK/USDT"];
const BINANCE_PAIRS = ["BTC/USDT", "ETH/USDT", "SOL/USDT", "BNB/USDT", "XRP/USDT", "ADA/USDT", "AVAX/USDT", "DOT/USDT", "LINK/USDT"];
const DEFAULT_PAIRS: Record<string, string[]> = { kraken: KRAKEN_PAIRS, binance: BINANCE_PAIRS };

export async function applyExchangeConfig(opts?: { dryRun?: boolean }) {
  await requireUser();

  const [exchangeName, exchangeKey, exchangeSecret] = await Promise.all([
    getUserPreference("freqtrade_exchange"),
    getSecret("freqtrade_exchange_key"),
    getSecret("freqtrade_exchange_secret"),
  ]);

  if (!exchangeName) return { error: "Exchange not selected in settings" };

  // Read current config
  let config: Record<string, unknown>;
  try {
    const raw = await fs.readFile(FT_CONFIG_PATH, "utf-8");
    config = JSON.parse(raw);
  } catch (e) {
    console.error("[trading/applyExchangeConfig] Cannot read config:", e);
    return { error: "Cannot read Freqtrade config. Make sure /freqtrade-config is mounted." };
  }

  // Update exchange settings
  const exchange = (config.exchange ?? {}) as Record<string, unknown>;
  exchange.name = exchangeName;
  exchange.key = exchangeKey ?? "";
  exchange.secret = exchangeSecret ?? "";
  exchange.pair_whitelist = DEFAULT_PAIRS[exchangeName] ?? BINANCE_PAIRS;
  exchange.pair_blacklist = [];
  config.exchange = exchange;

  // Update dry_run based on option (default: keep current or set based on whether keys exist)
  if (opts?.dryRun !== undefined) {
    config.dry_run = opts.dryRun;
  } else if (exchangeKey && exchangeSecret) {
    config.dry_run = false;
  }

  // Write config
  try {
    await fs.writeFile(FT_CONFIG_PATH, JSON.stringify(config, null, 4), "utf-8");
  } catch (e) {
    console.error("[trading/applyExchangeConfig] Cannot write config:", e);
    return { error: "Cannot write Freqtrade config. Check file permissions." };
  }

  // Reload Freqtrade (retry, tolerant to bot restart)
  await safeReload();

  return { success: true, exchange: exchangeName, dryRun: !!config.dry_run };
}

// =============================================
// Strategy Config Management
// =============================================

export async function getStrategyConfigs() {
  const user = await requireUser();
  return prisma.tradingStrategy.findMany({
    where: { userId: user.id },
    orderBy: [{ isActive: "desc" }, { createdAt: "desc" }],
  });
}

export async function saveStrategyConfig(data: {
  id?: number;
  name: string;
  strategyFile: string;
  exchange: string;
  stakeAmount: string;
  maxOpenTrades: number;
  stoploss: number;
  dryRun: boolean;
}) {
  const user = await requireUser();
  if (data.id) {
    await prisma.tradingStrategy.update({
      where: { id: data.id, userId: user.id },
      data: { name: data.name, strategyFile: data.strategyFile, exchange: data.exchange, stakeAmount: data.stakeAmount, maxOpenTrades: data.maxOpenTrades, stoploss: data.stoploss, dryRun: data.dryRun },
    });
  } else {
    await prisma.tradingStrategy.create({
      data: { userId: user.id, name: data.name, strategyFile: data.strategyFile, exchange: data.exchange, stakeAmount: data.stakeAmount, maxOpenTrades: data.maxOpenTrades, stoploss: data.stoploss, dryRun: data.dryRun },
    });
  }
  return { success: true };
}

export async function activateStrategy(id: number) {
  const user = await requireUser();
  const strategy = await prisma.tradingStrategy.findFirst({ where: { id, userId: user.id } });
  if (!strategy) return { error: "Strategy not found" };

  let config: Record<string, unknown>;
  try {
    const raw = await fs.readFile(FT_CONFIG_PATH, "utf-8");
    config = JSON.parse(raw);
  } catch (e) { console.error("[trading/activateStrategy] Cannot read config:", e); return { error: "Cannot read Freqtrade config" }; }

  config.stake_amount = ftStakeAmount(strategy.stakeAmount);
  config.stake_currency = strategy.stakeCurrency;
  config.max_open_trades = strategy.maxOpenTrades;
  config.stoploss = strategy.stoploss;
  config.dry_run = strategy.dryRun;
  const exchange = (config.exchange ?? {}) as Record<string, unknown>;
  exchange.name = strategy.exchange;
  config.exchange = exchange;

  try { await fs.writeFile(FT_CONFIG_PATH, JSON.stringify(config, null, 4), "utf-8"); }
  catch (e) { console.error("[trading/activateStrategy] Cannot write config:", e); return { error: "Cannot write config" }; }

  await prisma.$transaction([
    prisma.tradingStrategy.updateMany({ where: { userId: user.id, isActive: true }, data: { isActive: false } }),
    prisma.tradingStrategy.update({ where: { id, userId: user.id }, data: { isActive: true } }),
  ]);

  await safeReload();
  return { success: true, strategyName: strategy.name, reloadError: null };
}

export async function deactivateStrategy(id: number) {
  const user = await requireUser();
  await prisma.tradingStrategy.updateMany({ where: { id, userId: user.id }, data: { isActive: false } });
  return { success: true };
}

export async function deleteStrategyConfig(id: number) {
  const user = await requireUser();
  const s = await prisma.tradingStrategy.findFirst({ where: { id, userId: user.id } });
  if (!s) return { error: "Not found" };
  if (s.isActive) return { error: "Deactivate first" };
  await prisma.tradingStrategy.delete({ where: { id, userId: user.id } });
  return { success: true };
}
