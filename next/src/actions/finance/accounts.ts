"use server";

import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/current-user";

// ---------- Accounts ----------

export async function getAccounts() {
  const user = await requireUser();
  return prisma.customAccount.findMany({
    where: { userId: user.id, isActive: true },
    orderBy: { sortOrder: "asc" },
  });
}

// ---------- Savings Goals ----------

export async function getSavingsGoals() {
  const user = await requireUser();
  return prisma.savingsGoal.findMany({
    where: { userId: user.id, active: true },
    orderBy: { name: "asc" },
  });
}
