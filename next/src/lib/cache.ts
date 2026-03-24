import { redis } from "./redis";

/**
 * Cache the result of an async function in Redis.
 * Graceful fallback: if Redis is unavailable, just executes fn().
 */
export async function cached<T>(
  key: string,
  ttlSeconds: number,
  fn: () => Promise<T>,
): Promise<T> {
  if (!redis) {
    return fn();
  }

  try {
    const hit = await redis.get(key);
    if (hit) {
      return JSON.parse(hit) as T;
    }
  } catch (e) {
    console.error("[cache] Redis read failed for key:", key, e instanceof Error ? e.message : e);
  }

  const result = await fn();

  try {
    await redis.set(key, JSON.stringify(result), "EX", ttlSeconds);
  } catch (e) {
    console.error("[cache] Redis write failed for key:", key, e instanceof Error ? e.message : e);
  }

  return result;
}

/**
 * Invalidate cache keys matching a prefix pattern.
 * Uses SCAN to avoid blocking Redis.
 */
export async function invalidateCache(pattern: string): Promise<number> {
  if (!redis) return 0;

  let deleted = 0;
  try {
    let cursor = "0";
    do {
      const [nextCursor, keys] = await redis.scan(
        cursor,
        "MATCH",
        pattern,
        "COUNT",
        100,
      );
      cursor = nextCursor;
      if (keys.length > 0) {
        await redis.del(...keys);
        deleted += keys.length;
      }
    } while (cursor !== "0");
  } catch (e) {
    console.error("[cache] Redis invalidateCache failed for pattern:", pattern, e instanceof Error ? e.message : e);
  }
  return deleted;
}
