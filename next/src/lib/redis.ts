import Redis from "ioredis";

const globalForRedis = globalThis as unknown as {
  redis: Redis | undefined;
};

function createRedisClient(): Redis | null {
  const host = process.env.REDIS_HOST || "pd-redis-prod";
  const port = parseInt(process.env.REDIS_PORT || "6379", 10);
  const password = process.env.REDIS_PASSWORD;

  if (!password && !process.env.REDIS_URL) {
    console.warn("[redis] REDIS_PASSWORD/REDIS_URL not set — caching disabled");
    return null;
  }

  try {
    const client = password
      ? new Redis({ host, port, password, maxRetriesPerRequest: 1, connectTimeout: 3000, lazyConnect: true, enableOfflineQueue: false })
      : new Redis(process.env.REDIS_URL!, { maxRetriesPerRequest: 1, connectTimeout: 3000, lazyConnect: true, enableOfflineQueue: false });

    client.on("error", (err) => {
      console.error("[redis] connection error:", err.message);
    });

    client.connect().catch(() => {
      // silently handled by error listener
    });

    return client;
  } catch {
    console.warn("[redis] failed to create client");
    return null;
  }
}

export const redis: Redis | null =
  globalForRedis.redis ?? createRedisClient();

if (redis) {
  globalForRedis.redis = redis;
}
