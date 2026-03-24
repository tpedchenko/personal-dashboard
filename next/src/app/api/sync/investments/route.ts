export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { requireUser, isCurrentUserDemo } from "@/lib/current-user";
import { syncIbkrToDb } from "@/actions/brokers-ibkr";
import { syncTrading212Portfolio } from "@/actions/brokers-trading212";
import { syncEtorroPortfolio } from "@/actions/brokers-etorro";
import { checkRateLimit, RateLimitError, rateLimitResponse } from "@/lib/rate-limit";

/**
 * Auto-sync all broker portfolios.
 * Called by scheduler or cron job.
 */
export async function POST() {
  try {
    if (await isCurrentUserDemo()) {
      return NextResponse.json({ message: "Sync simulated in demo mode", synced: 0 });
    }
    const user = await requireUser();

    try {
      await checkRateLimit(String(user.id), "/api/sync/investments");
    } catch (e) {
      if (e instanceof RateLimitError) return rateLimitResponse(e);
    }

    const results = await Promise.allSettled([
      syncIbkrToDb(),
      syncTrading212Portfolio(),
      syncEtorroPortfolio(),
    ]);

    const summary = results.map((r, i) => {
      const broker = ["IBKR", "Trading212", "eToro"][i];
      if (r.status === "fulfilled") return { broker, ...r.value };
      return { broker, ok: false, message: r.reason?.message ?? "Failed" };
    });

    return NextResponse.json({ results: summary });
  } catch (e) {
    console.error("[api/sync/investments] Error:", e);
    return NextResponse.json({ error: e instanceof Error ? e.message : "Unauthorized" }, { status: 401 });
  }
}
