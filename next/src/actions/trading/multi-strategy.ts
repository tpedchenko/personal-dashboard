"use server";

import { requireUser } from "@/lib/current-user";
import { prisma } from "@/lib/db";
import { getSecretValue } from "@/actions/settings";
import * as fs from "fs/promises";

const FT_CONFIG_DIR = "/freqtrade-config";
const BASE_PORT = 8080; // main bot
const STRATEGY_PORT_START = 8090; // additional bots start from here

/**
 * Generate a Freqtrade config.json for a strategy instance.
 * Each instance gets its own port, bot name, and DB file.
 */
function generateConfig(
  strategy: { id: number; name: string; strategyFile: string; exchange: string; stakeCurrency: string; stakeAmount: string; maxOpenTrades: number; stoploss: number; dryRun: boolean },
  port: number,
  exchangeKey: string,
  exchangeSecret: string,
): Record<string, unknown> {
  const pairWhitelist = strategy.exchange === "kraken"
    ? ["XBT/USDT", "ETH/USDT", "SOL/USDT", "XRP/USDT", "ADA/USDT", "AVAX/USDT", "DOT/USDT", "LINK/USDT"]
    : ["BTC/USDT", "ETH/USDT", "SOL/USDT", "BNB/USDT", "XRP/USDT", "ADA/USDT", "AVAX/USDT", "DOT/USDT", "LINK/USDT"];

  const stakeAmount = strategy.stakeAmount === "unlimited" ? "unlimited" : parseFloat(strategy.stakeAmount) || "unlimited";

  return {
    max_open_trades: strategy.maxOpenTrades,
    stake_currency: strategy.stakeCurrency,
    stake_amount: stakeAmount,
    tradable_balance_ratio: 0.99,
    fiat_display_currency: "EUR",
    dry_run: strategy.dryRun,
    dry_run_wallet: 1000,
    cancel_open_orders_on_exit: false,
    trading_mode: "spot",
    margin_mode: "",
    stoploss: strategy.stoploss,
    unfilledtimeout: { entry: 10, exit: 10, exit_timeout_count: 0, unit: "minutes" },
    entry_pricing: { price_side: "same", use_order_book: true, order_book_top: 1 },
    exit_pricing: { price_side: "same", use_order_book: true, order_book_top: 1 },
    exchange: {
      name: strategy.exchange,
      key: exchangeKey,
      secret: exchangeSecret,
      ccxt_config: {},
      ccxt_sync_config: {},
      pair_whitelist: pairWhitelist,
      pair_blacklist: [],
    },
    pairlists: [{ method: "StaticPairList" }],
    api_server: {
      enabled: true,
      listen_ip_address: "0.0.0.0",
      listen_port: port,
      verbosity: "error",
      enable_openapi: false,
      jwt_secret_key: `ft_secret_${strategy.id}`,
      CORS_origins: ["https://pd.taras.cloud"],
      username: "freqtrade",
      password: `ft_pass_${strategy.id}_${Date.now().toString(36)}`,
    },
    bot_name: strategy.name.replace(/[^a-zA-Z0-9_-]/g, "_"),
    initial_state: "running",
    force_entry_enable: false,
    internals: { process_throttle_secs: 5 },
  };
}

/**
 * Write strategy config to /freqtrade-config/strategy-configs/strategy-{id}/config.json
 */
export async function writeStrategyConfig(strategyId: number): Promise<{ ok: boolean; message: string; port?: number }> {
  const user = await requireUser();
  const strategy = await prisma.tradingStrategy.findFirst({ where: { id: strategyId, userId: user.id } });
  if (!strategy) return { ok: false, message: "Strategy not found" };

  // Get exchange keys from main config
  let exchangeKey = "";
  let exchangeSecret = "";
  try {
    const mainConfig = JSON.parse(await fs.readFile(`${FT_CONFIG_DIR}/config.json`, "utf-8"));
    exchangeKey = mainConfig.exchange?.key ?? "";
    exchangeSecret = mainConfig.exchange?.secret ?? "";
  } catch (e) { console.error("[trading/writeStrategyConfig] Cannot read main config:", e); }

  const port = STRATEGY_PORT_START + strategyId;
  const config = generateConfig(strategy, port, exchangeKey, exchangeSecret);

  const dir = `${FT_CONFIG_DIR}/strategy-configs/strategy-${strategyId}`;
  try {
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(`${dir}/config.json`, JSON.stringify(config, null, 4), "utf-8");
  } catch (e) {
    return { ok: false, message: `Cannot write config: ${e instanceof Error ? e.message : "unknown"}` };
  }

  return { ok: true, message: `Config written for ${strategy.name}`, port };
}

/**
 * Get status of all strategy containers.
 * Checks if each strategy's API is reachable.
 */
export async function getMultiStrategyStatus(): Promise<Record<number, { running: boolean; port: number }>> {
  const user = await requireUser();
  const strategies = await prisma.tradingStrategy.findMany({ where: { userId: user.id } });

  const statuses: Record<number, { running: boolean; port: number }> = {};

  for (const s of strategies) {
    const port = STRATEGY_PORT_START + s.id;
    const url = `http://freqtrade-s${s.id}:${port}`;

    try {
      const [ftUser, ftPass] = await Promise.all([
        getSecretValue(user.id, "freqtrade_username"),
        getSecretValue(user.id, "freqtrade_password"),
      ]);
      const auth = Buffer.from(`${ftUser ?? "freqtrade"}:${ftPass ?? ""}`).toString("base64");
      const resp = await fetch(`${url}/api/v1/ping`, {
        headers: { Authorization: `Basic ${auth}` },
        cache: "no-store",
        signal: AbortSignal.timeout(2000),
      });
      statuses[s.id] = { running: resp.ok, port };
    } catch (e) {
      console.error(`[trading/getMultiStrategyStatus] Strategy ${s.id} ping failed:`, e instanceof Error ? e.message : e);
      statuses[s.id] = { running: false, port };
    }
  }

  return statuses;
}

/**
 * Generate a docker-compose snippet for launching strategy containers.
 * This is saved as a file that can be run on NAS.
 */
export async function generateMultiStrategyCompose(): Promise<{ ok: boolean; message: string }> {
  const user = await requireUser();
  const strategies = await prisma.tradingStrategy.findMany({ where: { userId: user.id, isActive: true } });

  if (strategies.length === 0) return { ok: false, message: "No active strategies" };

  // First write all configs
  for (const s of strategies) {
    await writeStrategyConfig(s.id);
  }

  const services: Record<string, unknown> = {};

  for (const s of strategies) {
    const port = STRATEGY_PORT_START + s.id;
    const containerName = `freqtrade-s${s.id}`;
    const configPath = `/opt/docker/freqtrade/user_data/strategy-configs/strategy-${s.id}`;

    services[containerName] = {
      image: "freqtradeorg/freqtrade:stable",
      container_name: containerName,
      restart: "unless-stopped",
      volumes: [
        `/opt/docker/freqtrade/user_data/strategies:/freqtrade/user_data/strategies:ro`,
        `/opt/docker/freqtrade/user_data/data:/freqtrade/user_data/data`,
        `${configPath}/config.json:/freqtrade/user_data/config.json`,
      ],
      command: `trade --config /freqtrade/user_data/config.json --strategy ${s.strategyFile}`,
      networks: ["pd-frontend-prod"],
    };
  }

  const compose = {
    services,
    networks: { "pd-frontend-prod": { external: true, name: "pd-frontend-prod" } },
  };

  try {
    const yaml = JSON.stringify(compose, null, 2); // JSON is valid YAML
    await fs.writeFile(`${FT_CONFIG_DIR}/strategy-configs/docker-compose.json`, yaml, "utf-8");
  } catch (e) {
    return { ok: false, message: `Write failed: ${e instanceof Error ? e.message : "unknown"}` };
  }

  return {
    ok: true,
    message: `Generated configs for ${strategies.length} strategies. Run on server:\ncd /opt/docker/freqtrade/user_data/strategy-configs && for d in strategy-*/; do sudo docker run -d --name freqtrade-$(basename $d) --network pd-frontend-prod -v ...`,
  };
}
