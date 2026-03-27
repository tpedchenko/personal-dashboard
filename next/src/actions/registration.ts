"use server";

import { prisma } from "@/lib/db";

const MAX_FREE_USERS = 10;

/**
 * Returns the number of free registration spots remaining.
 * Free tier allows up to MAX_FREE_USERS registered users.
 * Demo user is excluded from the count.
 */
export async function getFreeSpotsRemaining(): Promise<{
  remaining: number;
  total: number;
  max: number;
}> {
  const userCount = await prisma.user.count({
    where: {
      email: { not: "demo@example.com" },
    },
  });

  const remaining = Math.max(0, MAX_FREE_USERS - userCount);

  return {
    remaining,
    total: userCount,
    max: MAX_FREE_USERS,
  };
}
