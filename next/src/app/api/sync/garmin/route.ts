export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { requireUser, isCurrentUserDemo } from "@/lib/current-user";
import { prisma } from "@/lib/db";
import { getSecretValue } from "@/actions/settings";
import { dateToString } from "@/lib/date-utils";
import { checkRateLimit, RateLimitError, rateLimitResponse } from "@/lib/rate-limit";

export async function POST(request: Request) {
  try {
    if (await isCurrentUserDemo()) {
      return NextResponse.json({ message: "Sync simulated in demo mode", synced: 0 });
    }
    const user = await requireUser();

    try {
      await checkRateLimit(String(user.id), "/api/sync/garmin");
    } catch (e) {
      if (e instanceof RateLimitError) return rateLimitResponse(e);
    }

    // Get Garmin credentials (decrypted)
    const garminEmail = await getSecretValue(user.id, "garmin_email");
    const garminPassword = await getSecretValue(user.id, "garmin_password");

    if (!garminEmail || !garminPassword) {
      return NextResponse.json({ error: "Garmin credentials not configured" }, { status: 400 });
    }

    // Check if MFA code was sent — store it for the scheduler to pick up
    const body = await request.json().catch(() => null);
    if (body?.mfaCode) {
      await prisma.userPreference.upsert({
        where: { userId_key: { userId: user.id, key: "garmin_mfa_code" } },
        update: { value: body.mfaCode.trim() },
        create: { userId: user.id, key: "garmin_mfa_code", value: body.mfaCode.trim() },
      });
      return NextResponse.json({
        success: true,
        message: "MFA code saved. Scheduler will use it on next sync attempt (within 5 min).",
      });
    }

    // Get last sync info + data counts for verification
    // Check MFA status
    const mfaStatusPref = await prisma.userPreference.findUnique({
      where: { userId_key: { userId: user.id, key: "garmin_mfa_status" } },
    });
    const mfaRequired = mfaStatusPref?.value === "required";

    const [lastSyncPref, dailyCount, activityCount, sleepCount, bodyCompCount] = await Promise.all([
      prisma.userPreference.findUnique({
        where: { userId_key: { userId: user.id, key: "garmin_last_sync" } },
      }),
      prisma.garminDaily.count({ where: { userId: user.id } }),
      prisma.garminActivity.count({ where: { userId: user.id } }),
      prisma.garminSleep.count({ where: { userId: user.id } }),
      prisma.garminBodyComposition.count({ where: { userId: user.id } }),
    ]);

    // Get most recent data dates
    const [latestDaily, latestActivity, latestSleep] = await Promise.all([
      prisma.garminDaily.findFirst({ where: { userId: user.id }, orderBy: { date: "desc" }, select: { date: true } }),
      prisma.garminActivity.findFirst({ where: { userId: user.id }, orderBy: { date: "desc" }, select: { date: true } }),
      prisma.garminSleep.findFirst({ where: { userId: user.id }, orderBy: { date: "desc" }, select: { date: true } }),
    ]);

    return NextResponse.json({
      success: true,
      status: "scheduler_active",
      mfaRequired,
      message: mfaRequired
        ? "Garmin requires MFA verification. Enter the code from your email below."
        : "Garmin sync runs automatically via scheduler (every 5 min, 07:00-23:00 UTC).",
      lastSync: lastSyncPref?.value ?? null,
      dataCounts: {
        daily: dailyCount,
        activities: activityCount,
        sleep: sleepCount,
        bodyComposition: bodyCompCount,
      },
      latestDates: {
        daily: latestDaily ? dateToString(latestDaily.date) : null,
        activity: latestActivity ? dateToString(latestActivity.date) : null,
        sleep: latestSleep ? dateToString(latestSleep.date) : null,
      },
    });
  } catch (error) {
    console.error("[Garmin Sync] Error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Sync failed" },
      { status: 500 }
    );
  }
}

// GET — check integration status without triggering sync
export async function GET() {
  try {
    const user = await requireUser();

    try {
      await checkRateLimit(String(user.id), "/api/sync/garmin");
    } catch (e) {
      if (e instanceof RateLimitError) return rateLimitResponse(e);
    }

    const [garminEmailValue, lastSyncPref, dailyCount, mfaStatusPref] = await Promise.all([
      getSecretValue(user.id, "garmin_email"),
      prisma.userPreference.findUnique({
        where: { userId_key: { userId: user.id, key: "garmin_last_sync" } },
      }),
      prisma.garminDaily.count({ where: { userId: user.id } }),
      prisma.userPreference.findUnique({
        where: { userId_key: { userId: user.id, key: "garmin_mfa_status" } },
      }),
    ]);

    const latestDaily = await prisma.garminDaily.findFirst({
      where: { userId: user.id },
      orderBy: { date: "desc" },
      select: { date: true },
    });

    const today = new Date().toISOString().slice(0, 10);
    const isUpToDate = latestDaily ? dateToString(latestDaily.date) === today : false;
    const mfaRequired = mfaStatusPref?.value === "required";

    return NextResponse.json({
      configured: !!garminEmailValue,
      lastSync: lastSyncPref?.value ?? null,
      totalDays: dailyCount,
      latestDate: latestDaily ? dateToString(latestDaily.date) : null,
      isUpToDate,
      mfaRequired,
      status: !garminEmailValue
        ? "not_configured"
        : mfaRequired
          ? "mfa_required"
          : isUpToDate
            ? "up_to_date"
            : dailyCount > 0
              ? "syncing"
              : "no_data",
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Check failed" },
      { status: 500 }
    );
  }
}
