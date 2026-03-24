export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/current-user";
import { getBudgetBalance } from "@/lib/reporting/dps-client";

/**
 * GET /api/reporting/dps/balance?year=2025
 * Get budget balance (борг/переплата) from DPS.
 */
export async function GET(req: NextRequest) {
  try {
    const user = await requireUser();
    const year = parseInt(
      req.nextUrl.searchParams.get("year") || String(new Date().getFullYear()),
    );

    const balance = await getBudgetBalance(user.id, year);
    return NextResponse.json(balance);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch balance" },
      { status: 500 },
    );
  }
}
