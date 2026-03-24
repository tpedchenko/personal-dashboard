export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";
import { dateToString } from "@/lib/date-utils";

// Minimal health check for unauthenticated access (uptime monitors)
async function minimalHealthCheck() {
  try {
    const start = Date.now();
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json({ status: "ok", responseTimeMs: Date.now() - start });
  } catch (e) {
    console.error("[api/health] DB health check failed:", e);
    return NextResponse.json({ status: "error" }, { status: 503 });
  }
}

interface CheckResult {
  status: "ok" | "degraded" | "error";
  responseTimeMs?: number;
  error?: string;
}

interface IntegrationCheck {
  lastSync: string | null;
  lastDataDate: string | null;
  status: "ok" | "stale" | "never_synced" | "error";
}

interface HealthResponse {
  status: "ok" | "degraded" | "error";
  timestamp: string;
  version: string;
  checks: {
    database: CheckResult;
    integrations: Record<string, IntegrationCheck>;
    errors: { last24h: number };
    // Legacy fields for backward compatibility
    [key: string]: unknown;
  };
  // Legacy top-level fields
  [key: string]: unknown;
}

const STALE_THRESHOLD_MS = 48 * 60 * 60 * 1000; // 48 hours

function integrationStatus(
  lastSync: string | null,
  lastDataDate: string | null,
): IntegrationCheck["status"] {
  if (!lastSync && !lastDataDate) return "never_synced";
  const ref = lastSync ?? lastDataDate;
  if (!ref) return "never_synced";
  const age = Date.now() - new Date(ref).getTime();
  return age > STALE_THRESHOLD_MS ? "stale" : "ok";
}

export async function GET(request: Request) {
  // Unauthenticated access gets minimal health check only
  const session = await auth();
  if (!session?.user) {
    return minimalHealthCheck();
  }
  const legacyChecks: Record<string, string> = {};
  let dbCheck: CheckResult;
  let integrations: Record<string, IntegrationCheck> = {};
  let errorCount24h = 0;

  // 1. DB connection with timing
  const dbStart = performance.now();
  try {
    await prisma.$queryRaw`SELECT 1`;
    const dbTime = Math.round(performance.now() - dbStart);
    dbCheck = { status: "ok", responseTimeMs: dbTime };
    legacyChecks.database = "ok";
  } catch (e) {
    const dbTime = Math.round(performance.now() - dbStart);
    dbCheck = {
      status: "error",
      responseTimeMs: dbTime,
      error: e instanceof Error ? e.message : "Unknown error",
    };
    legacyChecks.database = "error";
  }

  // 2. Data freshness + integration sync status + error count
  try {
    const [
      userCount,
      latestTx,
      latestGarmin,
      latestWithings,
      latestLog,
      totalErrorCount,
      errorCount24hResult,
      syncPrefs,
    ] = await Promise.all([
      prisma.user.count(),
      prisma.transaction.findFirst({
        orderBy: { date: "desc" },
        select: { date: true },
      }),
      prisma.garminDaily.findFirst({
        orderBy: { date: "desc" },
        select: { date: true },
      }),
      prisma.withingsMeasurement.findFirst({
        orderBy: { date: "desc" },
        select: { date: true },
      }),
      prisma.dailyLog.findFirst({
        orderBy: { date: "desc" },
        select: { date: true },
      }),
      prisma.auditLog.count({ where: { action: "ERROR" } }),
      prisma.auditLog.count({
        where: {
          action: "ERROR",
          createdAt: {
            gte: new Date(Date.now() - 24 * 60 * 60 * 1000),
          },
        },
      }),
      prisma.userPreference.findMany({
        where: {
          key: {
            in: [
              "garmin_last_sync",
              "withings_last_sync",
              "monobank_last_sync",
            ],
          },
        },
        select: { key: true, value: true },
      }),
    ]);

    // Build sync prefs map
    const syncMap = new Map(syncPrefs.map((p) => [p.key, p.value]));

    integrations = {
      garmin: {
        lastSync: syncMap.get("garmin_last_sync") ?? null,
        lastDataDate: latestGarmin ? dateToString(latestGarmin.date) : null,
        status: integrationStatus(
          syncMap.get("garmin_last_sync") ?? null,
          latestGarmin ? dateToString(latestGarmin.date) : null,
        ),
      },
      withings: {
        lastSync: syncMap.get("withings_last_sync") ?? null,
        lastDataDate: latestWithings ? dateToString(latestWithings.date) : null,
        status: integrationStatus(
          syncMap.get("withings_last_sync") ?? null,
          latestWithings ? dateToString(latestWithings.date) : null,
        ),
      },
      monobank: {
        lastSync: syncMap.get("monobank_last_sync") ?? null,
        lastDataDate: latestTx ? dateToString(latestTx.date) : null,
        status: integrationStatus(
          syncMap.get("monobank_last_sync") ?? null,
          latestTx ? dateToString(latestTx.date) : null,
        ),
      },
    };

    errorCount24h = errorCount24hResult;

    // Legacy fields
    legacyChecks.users = String(userCount);
    legacyChecks.latestTransaction = latestTx ? dateToString(latestTx.date) : "none";
    legacyChecks.latestGarmin = latestGarmin ? dateToString(latestGarmin.date) : "none";
    legacyChecks.latestDailyLog = latestLog ? dateToString(latestLog.date) : "none";
    legacyChecks.errors = String(totalErrorCount);
  } catch (e) {
    console.error("[api/health] Data aggregation error:", e);
    legacyChecks.data = "error";
  }

  // Determine overall status
  const hasError =
    dbCheck.status === "error" || legacyChecks.data === "error";
  const hasStale = Object.values(integrations).some(
    (i) => i.status === "stale",
  );

  let overallStatus: "ok" | "degraded" | "error";
  if (hasError) {
    overallStatus = "error";
  } else if (hasStale || errorCount24h > 0) {
    overallStatus = "degraded";
  } else {
    overallStatus = "ok";
  }

  const response: HealthResponse = {
    status: overallStatus,
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version || "1.0.0",
    checks: {
      database: dbCheck,
      integrations,
      errors: { last24h: errorCount24h },
      // Spread legacy fields for backward compat
      ...legacyChecks,
    },
  };

  return NextResponse.json(response);
}
