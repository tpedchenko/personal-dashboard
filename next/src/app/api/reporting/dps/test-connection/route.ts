export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { requireUser } from "@/lib/current-user";
import { testConnection } from "@/lib/reporting/dps-client";

/**
 * POST /api/reporting/dps/test-connection
 * Test connection to DPS Electronic Cabinet API.
 */
export async function POST() {
  try {
    const user = await requireUser();
    const result = await testConnection(user.id);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { connected: false, error: error instanceof Error ? error.message : "Connection failed" },
      { status: 500 },
    );
  }
}
