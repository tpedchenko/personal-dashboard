export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { getCurrentUser, isCurrentUserDemo } from "@/lib/current-user";
import { prisma } from "@/lib/db";

export async function POST() {
  try {
    if (await isCurrentUserDemo()) {
      return NextResponse.json({ message: "Sync simulated in demo mode", synced: 0 });
    }
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Check last sync timestamp — avoid syncing more than once per hour
    const lastSyncPref = await prisma.userPreference.findUnique({
      where: { userId_key: { userId: user.id, key: "last_health_sync" } },
    });

    const now = new Date();
    if (lastSyncPref?.value) {
      const lastSync = new Date(lastSyncPref.value);
      const diffMs = now.getTime() - lastSync.getTime();
      const ONE_HOUR = 60 * 60 * 1000;
      if (diffMs < ONE_HOUR) {
        return NextResponse.json({
          status: "skipped",
          message: "Last sync was less than 1 hour ago",
          lastSync: lastSyncPref.value,
        });
      }
    }

    // Log sync request — actual sync is handled by the Python backend
    // This endpoint serves as a trigger/notification point
    console.log(`[Health Sync] Sync requested for user ${user.email} at ${now.toISOString()}`);

    // Update last sync timestamp
    await prisma.userPreference.upsert({
      where: { userId_key: { userId: user.id, key: "last_health_sync" } },
      update: { value: now.toISOString() },
      create: { userId: user.id, key: "last_health_sync", value: now.toISOString() },
    });

    return NextResponse.json({
      status: "ok",
      message: "Health sync requested",
      timestamp: now.toISOString(),
    });
  } catch (error) {
    console.error("[Health Sync] Error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
