export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { requireUser, isCurrentUserDemo } from "@/lib/current-user";
import { getSecretValue } from "@/actions/settings";
import { checkRateLimit, RateLimitError, rateLimitResponse } from "@/lib/rate-limit";

export async function POST() {
  try {
    if (await isCurrentUserDemo()) {
      return NextResponse.json({ message: "Sync simulated in demo mode", synced: 0 });
    }
    const user = await requireUser();

    try {
      await checkRateLimit(String(user.id), "/api/sync/monobank");
    } catch (e) {
      if (e instanceof RateLimitError) return rateLimitResponse(e);
      console.warn("[rate-limit] Unexpected error in /api/sync/monobank, allowing request:", e);
    }

    const tokenValue = await getSecretValue(user.id, "monobank_token");
    if (!tokenValue) {
      return NextResponse.json({ error: "Monobank token not configured" }, { status: 400 });
    }

    // Monobank sync requires the Python backend scheduler
    return NextResponse.json({
      error: "Monobank sync is handled by the background scheduler. Data syncs automatically every 10 minutes.",
    });
  } catch (error) {
    console.error("[api/sync/monobank] Error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Sync failed" },
      { status: 500 }
    );
  }
}
