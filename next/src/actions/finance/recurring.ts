"use server";

import { prisma } from "@/lib/db";
import { updateTag } from "next/cache";
import { CACHE_TAGS } from "@/lib/cache-tags";
import { requireUser } from "@/lib/current-user";

// ---------- Recurring ----------

export async function getRecurringTransactions() {
  const user = await requireUser();
  return prisma.recurringTransaction.findMany({
    where: { userId: user.id },
    orderBy: { name: "asc" },
  });
}

export async function addRecurringTransaction(data: {
  name: string;
  amountEur: number;
  category: string;
  txType?: string;
  account?: string;
  dayOfMonth?: number;
}) {
  const user = await requireUser();
  await prisma.recurringTransaction.create({
    data: {
      userId: user.id,
      name: data.name,
      amountEur: data.amountEur,
      category: data.category,
      txType: data.txType ?? "EXPENSE",
      account: data.account ?? null,
      dayOfMonth: data.dayOfMonth ?? 1,
      active: true,
    },
  });
  updateTag(CACHE_TAGS.finance);
}

export async function toggleRecurring(id: number) {
  const user = await requireUser();
  const rec = await prisma.recurringTransaction.findUnique({ where: { id } });
  if (!rec || rec.userId !== user.id) return;
  await prisma.recurringTransaction.update({
    where: { id, userId: user.id },
    data: { active: !rec.active },
  });
  updateTag(CACHE_TAGS.finance);
}

export async function deleteRecurring(id: number) {
  const user = await requireUser();
  await prisma.recurringTransaction.delete({ where: { id, userId: user.id } });
  updateTag(CACHE_TAGS.finance);
}

// ---------- Process Recurring Transactions ----------

export async function processRecurringTransactions() {
  const user = await requireUser();
  const today = new Date();
  const currentDay = today.getDate();
  const currentMonth = today.getMonth() + 1;
  const currentYear = today.getFullYear();
  const monthStr = `${currentYear}-${String(currentMonth).padStart(2, "0")}`;

  // Find all active recurring transactions for the current user
  const recurring = await prisma.recurringTransaction.findMany({
    where: { userId: user.id, active: true },
  });

  let created = 0;

  for (const rec of recurring) {
    const dayOfMonth = rec.dayOfMonth ?? 1;

    // Only create if current day >= dayOfMonth
    if (currentDay < dayOfMonth) continue;

    // Check if transaction already exists for this month (avoid duplicates)
    const existing = await prisma.transaction.findFirst({
      where: {
        userId: user.id,
        source: "recurring",
        date: { gte: `${monthStr}-01`, lt: `${monthStr}-32` },
        description: { contains: rec.name },
      },
    });

    if (existing) continue;

    const dateStr = `${monthStr}-${String(dayOfMonth).padStart(2, "0")}`;

    await prisma.transaction.create({
      data: {
        userId: user.id,
        date: dateStr,
        year: currentYear,
        month: currentMonth,
        type: rec.txType ?? "EXPENSE",
        account: rec.account ?? null,
        category: rec.category,
        amountOriginal: rec.amountEur,
        currencyOriginal: "EUR",
        amountEur: rec.amountEur,
        description: `[Recurring] ${rec.name}`,
        source: "recurring",
      },
    });

    created++;
  }

  if (created > 0) {
    updateTag(CACHE_TAGS.finance);
  }

  return { created };
}
