export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { requireUser, isCurrentUserDemo } from "@/lib/current-user";
import { getSecretValue } from "@/actions/settings";

export async function POST() {
  try {
    if (await isCurrentUserDemo()) {
      return NextResponse.json({ message: "Sync simulated in demo mode", synced: 0 });
    }
    const user = await requireUser();
    const tokenValue = await getSecretValue(user.id, "withings_access_token");
    if (!tokenValue) {
      return NextResponse.json({ error: "Withings not connected" }, { status: 400 });
    }

    // Withings sync requires the Python backend
    return NextResponse.json({
      error: "Withings sync is handled by the background scheduler.",
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Sync failed" },
      { status: 500 }
    );
  }
}
