export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { promises as dns } from "dns";
import { requireUser } from "@/lib/current-user";
import { getSecretValue } from "@/actions/settings";

/**
 * Proxy requests to Freqtrade REST API.
 * GET/POST /api/trading/status → Freqtrade /api/v1/status
 * GET /api/trading/profit → Freqtrade /api/v1/profit
 * GET /api/trading/trades → Freqtrade /api/v1/trades
 * GET /api/trading/balance → Freqtrade /api/v1/balance
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  return proxyToFreqtrade(request, await params);
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  return proxyToFreqtrade(request, await params, await request.json().catch(() => null));
}


// Allowlist of permitted Freqtrade endpoints (security: prevent access to dangerous endpoints)
const ALLOWED_PATHS = new Set([
  "status", "profit", "trades", "balance", "count", "locks",
  "performance", "stats", "daily", "edge", "show_config",
  "strategies", "strategy", "available_pairs", "pair_candles",
  "whitelist", "blacklist", "logs", "version", "ping",
  "forcebuy", "forceentry", "forcesell", "forceexit",
  "start", "stop", "reload_config", "pair_history",
]);

function isAllowedPath(pathParts: string[]): boolean {
  if (pathParts.length === 0) return false;
  return ALLOWED_PATHS.has(pathParts[0]);
}

/**
 * Validate that the URL does not point to private/internal networks (SSRF protection).
 */
function isPrivateUrl(urlString: string): boolean {
  try {
    const url = new URL(urlString);
    const hostname = url.hostname;
    // Block private IP ranges, localhost, link-local, and metadata endpoints
    const privatePatterns = [
      /^localhost$/i,
      /^127\./,
      /^10\./,
      /^172\.(1[6-9]|2\d|3[01])\./,
      /^192\.168\./,
      /^169\.254\./, // link-local / cloud metadata
      /^0\./,
      /^\[::1\]$/,
      /^\[fc/i, // IPv6 unique local
      /^\[fd/i,
      /^\[fe80/i, // IPv6 link-local
    ];
    return privatePatterns.some((p) => p.test(hostname));
  } catch {
    return true; // Invalid URL = block
  }
}

/**
 * Check resolved IP against private ranges to prevent DNS rebinding attacks.
 * A domain could resolve to a private IP even if the hostname looks public.
 */
function isPrivateIp(ip: string): boolean {
  const privatePatterns = [
    /^127\./,
    /^10\./,
    /^172\.(1[6-9]|2\d|3[01])\./,
    /^192\.168\./,
    /^169\.254\./,
    /^0\./,
    /^::1$/,
    /^fc/i,
    /^fd/i,
    /^fe80/i,
  ];
  return privatePatterns.some((p) => p.test(ip));
}

async function proxyToFreqtrade(
  request: NextRequest,
  { path }: { path: string[] },
  body?: unknown,
) {
  try {
    const user = await requireUser();

    const [apiUrl, username, password] = await Promise.all([
      getSecretValue(user.id, "freqtrade_api_url"),
      getSecretValue(user.id, "freqtrade_username"),
      getSecretValue(user.id, "freqtrade_password"),
    ]);

    if (!apiUrl) {
      return NextResponse.json(
        { error: "Freqtrade not configured. Go to Settings → Integrations → Freqtrade." },
        { status: 400 },
      );
    }

    if (isPrivateUrl(apiUrl)) {
      return NextResponse.json(
        { error: "Freqtrade URL must not point to private/internal networks" },
        { status: 400 },
      );
    }

    // DNS rebinding protection: resolve hostname and verify the resolved IP is not private
    try {
      const parsedUrl = new URL(apiUrl);
      const { address } = await dns.lookup(parsedUrl.hostname);
      if (isPrivateIp(address)) {
        return NextResponse.json(
          { error: "Freqtrade URL resolves to a private/internal IP address" },
          { status: 400 },
        );
      }
    } catch {
      return NextResponse.json(
        { error: "Failed to resolve Freqtrade URL hostname" },
        { status: 400 },
      );
    }

    if (!isAllowedPath(path)) {
      return NextResponse.json({ error: "Endpoint not allowed" }, { status: 403 });
    }
    const freqtradePath = "/api/v1/" + path.join("/");
    const url = new URL(freqtradePath, apiUrl);

    // Forward query params
    request.nextUrl.searchParams.forEach((value, key) => {
      url.searchParams.set(key, value);
    });

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };

    // Basic auth
    if (username && password) {
      headers["Authorization"] = "Basic " + Buffer.from(`${username}:${password}`).toString("base64");
    }

    const res = await fetch(url.toString(), {
      method: body ? "POST" : "GET",
      headers,
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(10000),
    });

    const data = await res.json().catch(() => null);

    return NextResponse.json(data ?? { error: "Invalid response" }, {
      status: res.status,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Proxy failed" },
      { status: 502 },
    );
  }
}
