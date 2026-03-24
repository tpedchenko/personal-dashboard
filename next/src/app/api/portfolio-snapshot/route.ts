import { NextResponse } from "next/server";
import { savePortfolioSnapshot } from "@/actions/finance/portfolio-snapshots";
import { requireUser } from "@/lib/current-user";
import { checkRateLimit, RateLimitError, rateLimitResponse } from "@/lib/rate-limit";

export async function POST() {
  try {
    const user = await requireUser();

    try {
      await checkRateLimit(String(user.id), "/api/portfolio-snapshot");
    } catch (e) {
      if (e instanceof RateLimitError) return rateLimitResponse(e);
    }

    const result = await savePortfolioSnapshot();
    return NextResponse.json(result);
  } catch (e) {
    console.error("[api/portfolio-snapshot] Error:", e);
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed" }, { status: 500 });
  }
}
