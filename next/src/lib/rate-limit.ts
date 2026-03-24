import { redis } from "./redis";

export class RateLimitError extends Error {
  retryAfter: number;

  constructor(retryAfter: number) {
    super("Too many requests");
    this.name = "RateLimitError";
    this.retryAfter = retryAfter;
  }
}

interface RateLimitConfig {
  maxRequests: number;
  windowSeconds: number;
}

const ROUTE_LIMITS: { pattern: string; config: RateLimitConfig }[] = [
  { pattern: "/api/chat", config: { maxRequests: 20, windowSeconds: 60 } },
  { pattern: "/api/insights", config: { maxRequests: 20, windowSeconds: 60 } },
  { pattern: "/api/sync/", config: { maxRequests: 10, windowSeconds: 60 } },
  { pattern: "/api/garmin-mfa", config: { maxRequests: 5, windowSeconds: 60 } },
  { pattern: "/api/portfolio-snapshot", config: { maxRequests: 10, windowSeconds: 60 } },
];

const DEFAULT_LIMIT: RateLimitConfig = { maxRequests: 60, windowSeconds: 60 };

function getLimitConfig(endpoint: string): RateLimitConfig {
  for (const route of ROUTE_LIMITS) {
    if (endpoint.startsWith(route.pattern)) {
      return route.config;
    }
  }
  return DEFAULT_LIMIT;
}

/**
 * Sliding-window rate limiter backed by Redis.
 *
 * Call at the top of API route handlers. Throws RateLimitError (429) when
 * the user exceeds the allowed number of requests for the given endpoint.
 *
 * If Redis is unavailable, the request is allowed through (fail-open).
 *
 * @param userId  - authenticated user ID or email
 * @param endpoint - the API path, e.g. "/api/chat"
 */
export async function checkRateLimit(
  userId: string,
  endpoint: string,
): Promise<void> {
  if (!redis) return; // fail-open when Redis is not configured

  const { maxRequests, windowSeconds } = getLimitConfig(endpoint);

  // Build a key scoped to the current time window
  const windowKey = Math.floor(Date.now() / (windowSeconds * 1000));
  const key = `rl:${userId}:${endpoint}:${windowKey}`;

  try {
    const current = await redis.incr(key);

    // Set expiry only on first increment so the key auto-cleans
    if (current === 1) {
      await redis.expire(key, windowSeconds);
    }

    if (current > maxRequests) {
      // Estimate seconds remaining in this window
      const ttl = await redis.ttl(key);
      const retryAfter = ttl > 0 ? ttl : windowSeconds;
      throw new RateLimitError(retryAfter);
    }
  } catch (e) {
    if (e instanceof RateLimitError) throw e;
    // Redis error — fail-open
    console.warn("[rate-limit] Redis error, allowing request:", (e as Error).message);
  }
}

/**
 * Helper to create a 429 Response from a RateLimitError.
 */
export function rateLimitResponse(err: RateLimitError): Response {
  return new Response(
    JSON.stringify({ error: "Too many requests. Please try again later." }),
    {
      status: 429,
      headers: {
        "Content-Type": "application/json",
        "Retry-After": String(err.retryAfter),
      },
    },
  );
}
