export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { requireUser } from "@/lib/current-user";
import { getPayerCard } from "@/lib/reporting/dps-client";

/**
 * GET /api/reporting/dps/payer-card
 * Get taxpayer card from DPS.
 */
export async function GET() {
  try {
    const user = await requireUser();
    const card = await getPayerCard(user.id);
    return NextResponse.json(card);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch payer card" },
      { status: 500 },
    );
  }
}
