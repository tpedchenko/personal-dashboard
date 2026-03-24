import { PrismaClient } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

/**
 * Creates a Prisma client connected via PgBouncer (transaction pool mode).
 *
 * In production, DATABASE_URL points to PgBouncer (port 6432), which pools
 * connections to PostgreSQL. The adapter's internal pool (max: 3) creates
 * connections to PgBouncer, which multiplexes them to the actual database.
 *
 * For migrations, Prisma uses DIRECT_DATABASE_URL (direct to PostgreSQL,
 * port 5432) — configured in prisma/schema.prisma via `directUrl`.
 */
function createPrismaClient() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL environment variable is not set");
  }

  const adapter = new PrismaPg({
    connectionString,
    max: 3,
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 5_000,
  });
  return new PrismaClient({ adapter });
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

globalForPrisma.prisma = prisma;
