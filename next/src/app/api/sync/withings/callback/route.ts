export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { getSecretValue, setSecretValue } from "@/actions/settings";
import { verifyOAuthState } from "@/lib/encryption";

/**
 * Withings OAuth2 callback endpoint.
 * Receives authorization code and exchanges it for access/refresh tokens.
 * Public route (no auth required) — Withings redirects here after user authorization.
 */

// Withings validates callback URL with HEAD/POST before redirect
export async function HEAD() {
  return new NextResponse(null, { status: 200 });
}

export async function POST() {
  return NextResponse.json({ status: "ok" });
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state"); // user email encoded in state

  // Withings validates callback URL without params — return 200
  if (!code && !state) {
    return NextResponse.json({ status: "ok", message: "Withings callback endpoint ready" });
  }

  if (!code) {
    return NextResponse.redirect(new URL("/settings/integrations/withings?error=no_code", request.url));
  }

  try {
    // Verify HMAC-signed state and extract email
    const userEmail = state ? verifyOAuthState(state) : null;
    if (!userEmail) {
      return NextResponse.redirect(new URL("/settings/integrations/withings?error=no_state", request.url));
    }

    const user = await prisma.user.findUnique({ where: { email: userEmail } });
    if (!user) {
      return NextResponse.redirect(new URL("/settings/integrations/withings?error=user_not_found", request.url));
    }

    // Get client credentials from secrets (decrypted)
    const [clientId, clientSecret] = await Promise.all([
      getSecretValue(user.id, "withings_client_id"),
      getSecretValue(user.id, "withings_client_secret"),
    ]);

    if (!clientId || !clientSecret) {
      return NextResponse.redirect(new URL("/settings/integrations/withings?error=no_credentials", request.url));
    }

    // Exchange code for tokens
    const tokenResponse = await fetch("https://wbsapi.withings.net/v2/oauth2", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        action: "requesttoken",
        grant_type: "authorization_code",
        client_id: clientId,
        client_secret: clientSecret,
        code,
        redirect_uri: `${process.env.NEXTAUTH_URL}/api/sync/withings/callback`,
      }),
    });

    const tokenData = await tokenResponse.json();

    if (tokenData.status !== 0 || !tokenData.body?.access_token) {
      console.error("[Withings] Token exchange failed, status:", tokenData.status);
      return NextResponse.redirect(
        new URL(`/settings/integrations/withings?error=token_exchange_failed`, request.url)
      );
    }

    const tokens = {
      access_token: tokenData.body.access_token,
      refresh_token: tokenData.body.refresh_token,
      expires_in: tokenData.body.expires_in,
      token_type: tokenData.body.token_type,
      userid: tokenData.body.userid,
      client_id: clientId,
      consumer_secret: clientSecret,
      created_at: Date.now(),
    };

    // Save tokens to secrets (encrypted)
    const tokensJson = JSON.stringify(tokens);
    await setSecretValue(user.id, "withings_tokens", tokensJson);

    console.log(`[Withings] OAuth complete for user ${user.id}`);
    return NextResponse.redirect(new URL("/settings/integrations/withings?connected=true", request.url));
  } catch (error) {
    console.error("[Withings] Callback error:", error);
    return NextResponse.redirect(
      new URL("/settings/integrations/withings?error=callback_failed", request.url)
    );
  }
}
