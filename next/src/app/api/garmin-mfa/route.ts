export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { checkRateLimit, RateLimitError, rateLimitResponse } from "@/lib/rate-limit";

/**
 * Public API endpoint for receiving Garmin MFA codes.
 * Called by Cloudflare Email Worker or external automation.
 * Auth: Bearer token from GARMIN_MFA_API_TOKEN env var.
 *
 * POST /api/garmin-mfa
 * Body: { "code": "123456" } or { "emailBody": "...raw email text..." }
 */
export async function POST(request: Request) {
  try {
    const apiToken = process.env.GARMIN_MFA_API_TOKEN;
    if (!apiToken) {
      return NextResponse.json({ error: "GARMIN_MFA_API_TOKEN not configured" }, { status: 500 });
    }

    const authHeader = request.headers.get("authorization");
    if (!authHeader || authHeader !== `Bearer ${apiToken}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // IP-based rate limiting for this public endpoint
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
      || request.headers.get("cf-connecting-ip")
      || "unknown";
    try {
      await checkRateLimit(`ip:${ip}`, "/api/garmin-mfa");
    } catch (e) {
      if (e instanceof RateLimitError) return rateLimitResponse(e);
    }

    const body = await request.json();
    let mfaCode: string | null = null;

    if (body.code) {
      // Direct code submission
      mfaCode = String(body.code).trim();
    } else if (body.emailBody) {
      // Parse MFA code from email body text
      mfaCode = extractMfaCode(body.emailBody);
    }

    if (!mfaCode || !/^\d{6}$/.test(mfaCode)) {
      return NextResponse.json({ error: "Invalid or missing MFA code" }, { status: 400 });
    }

    // Find user waiting for MFA (garmin_mfa_status = "required")
    // If body.garminEmail provided, match by garmin_email secret for exact user
    // Otherwise find any user with pending MFA status
    let targetUserId: number | null = null;

    if (body.userId && typeof body.userId === "number") {
      // Explicit userId from Email Worker (if it tracks which user triggered MFA)
      targetUserId = body.userId;
    } else {
      // Find user with garmin_mfa_status = "required" (waiting for MFA code)
      const pendingUser = await prisma.userPreference.findFirst({
        where: { key: "garmin_mfa_status", value: "required" },
        select: { userId: true },
        orderBy: { userId: "asc" },
      });
      if (pendingUser) targetUserId = pendingUser.userId;
    }

    if (!targetUserId) {
      return NextResponse.json({ error: "No user waiting for MFA" }, { status: 404 });
    }

    // Store MFA code for the matched user — scheduler picks it up
    await prisma.userPreference.upsert({
      where: { userId_key: { userId: targetUserId, key: "garmin_mfa_code" } },
      update: { value: mfaCode },
      create: { userId: targetUserId, key: "garmin_mfa_code", value: mfaCode },
    });

    // Reset MFA status so scheduler retries
    await prisma.userPreference.upsert({
      where: { userId_key: { userId: targetUserId, key: "garmin_mfa_status" } },
      update: { value: "code_received" },
      create: { userId: targetUserId, key: "garmin_mfa_status", value: "code_received" },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[Garmin MFA API] Error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed" },
      { status: 500 }
    );
  }
}

/** Extract 6-digit MFA code from Garmin email body */
function extractMfaCode(text: string): string | null {
  // Garmin MFA emails contain a 6-digit verification code
  // Common patterns: "verification code is 123456", "code: 123456", standalone 6-digit number
  const patterns = [
    /verification\s+code\s*(?:is|:)\s*(\d{6})/i,
    /code\s*(?:is|:)\s*(\d{6})/i,
    /\b(\d{6})\b/,
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) return match[1];
  }
  return null;
}
