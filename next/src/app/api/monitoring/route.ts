export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/current-user";

const startTime = Date.now();

interface ErrorStats {
  last1h: number;
  last24h: number;
  rate1h: number; // errors per minute
  rate24h: number;
}

interface MemoryStats {
  rss: string;
  heapTotal: string;
  heapUsed: string;
  external: string;
  heapUsagePercent: number;
}

interface DbStats {
  responseTimeMs: number;
  status: "ok" | "error";
  error?: string;
  poolConfig: {
    maxConnections: number;
    idleTimeoutMs: number;
    connectionTimeoutMs: number;
  };
}

interface RequestTrend {
  period: string;
  count: number;
  errors: number;
  errorRate: number;
}

interface MonitoringResponse {
  status: "ok" | "degraded" | "error";
  timestamp: string;
  uptime: {
    seconds: number;
    formatted: string;
  };
  memory: MemoryStats;
  database: DbStats;
  errors: ErrorStats;
  requestTrends: RequestTrend[];
  recentErrors: Array<{
    id: number;
    details: string | null;
    createdAt: Date | null;
  }>;
}

function formatBytes(bytes: number): string {
  const mb = bytes / 1024 / 1024;
  return `${mb.toFixed(1)} MB`;
}

function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const parts: string[] = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  parts.push(`${mins}m`);
  return parts.join(" ");
}

export async function GET() {
  try {
    await requireUser();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = Date.now();
  const uptimeSeconds = Math.floor((now - startTime) / 1000);

  // --- Memory usage ---
  const mem = process.memoryUsage();
  const memory: MemoryStats = {
    rss: formatBytes(mem.rss),
    heapTotal: formatBytes(mem.heapTotal),
    heapUsed: formatBytes(mem.heapUsed),
    external: formatBytes(mem.external),
    heapUsagePercent: Math.round((mem.heapUsed / mem.heapTotal) * 100),
  };

  // --- Database check with timing ---
  let dbStats: DbStats;
  const dbStart = performance.now();
  try {
    await prisma.$queryRaw`SELECT 1`;
    const dbTime = Math.round(performance.now() - dbStart);
    dbStats = {
      responseTimeMs: dbTime,
      status: "ok",
      poolConfig: {
        maxConnections: 3,
        idleTimeoutMs: 10_000,
        connectionTimeoutMs: 5_000,
      },
    };
  } catch (e) {
    const dbTime = Math.round(performance.now() - dbStart);
    dbStats = {
      responseTimeMs: dbTime,
      status: "error",
      error: e instanceof Error ? e.message : String(e),
      poolConfig: {
        maxConnections: 3,
        idleTimeoutMs: 10_000,
        connectionTimeoutMs: 5_000,
      },
    };
  }

  // --- Error stats from audit_log ---
  let errorStats: ErrorStats = {
    last1h: 0,
    last24h: 0,
    rate1h: 0,
    rate24h: 0,
  };
  let requestTrends: RequestTrend[] = [];
  let recentErrors: Array<{
    id: number;
    details: string | null;
    createdAt: Date | null;
  }> = [];

  try {
    const oneHourAgo = new Date(now - 60 * 60 * 1000);
    const twentyFourHoursAgo = new Date(now - 24 * 60 * 60 * 1000);

    const [errors1h, errors24h, recentErrorRows, trends] = await Promise.all([
      // Error count last 1h
      prisma.auditLog.count({
        where: {
          action: "ERROR",
          createdAt: { gte: oneHourAgo },
        },
      }),
      // Error count last 24h
      prisma.auditLog.count({
        where: {
          action: "ERROR",
          createdAt: { gte: twentyFourHoursAgo },
        },
      }),
      // Recent error details
      prisma.auditLog.findMany({
        where: { action: "ERROR" },
        orderBy: { id: "desc" },
        take: 10,
        select: { id: true, details: true, createdAt: true },
      }),
      // Request trends — count audit_log entries by time buckets
      // Using raw query for time-bucket grouping
      prisma.$queryRaw<
        Array<{ period: string; total: bigint; errors: bigint }>
      >`
        SELECT
          CASE
            WHEN created_at >= ${oneHourAgo}::timestamptz THEN 'last_1h'
            WHEN created_at >= ${twentyFourHoursAgo}::timestamptz THEN 'last_1h_to_24h'
            ELSE 'older'
          END AS period,
          COUNT(*)::bigint AS total,
          COUNT(*) FILTER (WHERE action = 'ERROR')::bigint AS errors
        FROM audit_log
        WHERE created_at >= ${twentyFourHoursAgo}::timestamptz
        GROUP BY period
        ORDER BY period
      `,
    ]);

    errorStats = {
      last1h: errors1h,
      last24h: errors24h,
      rate1h: errors1h > 0 ? Math.round((errors1h / 60) * 100) / 100 : 0,
      rate24h:
        errors24h > 0 ? Math.round((errors24h / 1440) * 100) / 100 : 0,
    };

    recentErrors = recentErrorRows;

    requestTrends = trends.map((t) => {
      const total = Number(t.total);
      const errors = Number(t.errors);
      return {
        period: t.period,
        count: total,
        errors,
        errorRate: total > 0 ? Math.round((errors / total) * 10000) / 100 : 0,
      };
    });
  } catch (e) {
    console.error("[api/monitoring] Audit log queries failed:", e);
  }

  // --- Overall status ---
  let status: "ok" | "degraded" | "error" = "ok";
  if (dbStats.status === "error") {
    status = "error";
  } else if (
    memory.heapUsagePercent > 90 ||
    errorStats.last1h > 10
  ) {
    status = "degraded";
  }

  const response: MonitoringResponse = {
    status,
    timestamp: new Date().toISOString(),
    uptime: {
      seconds: uptimeSeconds,
      formatted: formatUptime(uptimeSeconds),
    },
    memory,
    database: dbStats,
    errors: errorStats,
    requestTrends,
    recentErrors,
  };

  return NextResponse.json(response);
}
