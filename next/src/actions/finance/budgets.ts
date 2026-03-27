"use server";

import { prisma } from "@/lib/db";
import { updateTag } from "next/cache";
import { CACHE_TAGS } from "@/lib/cache-tags";
import { requireUser } from "@/lib/current-user";
import { invalidateAiContextSnapshot } from "@/actions/chat-context/index";
import { computeWeeklyBudget } from "./finance-utils";

// ---------- Budgets ----------

export async function getBudgets() {
  const user = await requireUser();
  return prisma.budget.findMany({
    where: { userId: user.id, active: true },
    orderBy: { category: "asc" },
  });
}

export async function addBudget(data: {
  category: string;
  amountEur: number;
  month?: string;
}) {
  const user = await requireUser();
  // Find existing budget for this category+month
  const existing = await prisma.budget.findFirst({
    where: {
      userId: user.id,
      category: data.category,
      month: data.month ?? null,
    },
  });

  if (existing) {
    await prisma.budget.update({
      where: { id: existing.id, userId: user.id },
      data: { amountEur: data.amountEur, active: true },
    });
  } else {
    await prisma.budget.create({
      data: {
        userId: user.id,
        category: data.category,
        amountEur: data.amountEur,
        month: data.month ?? null,
        active: true,
      },
    });
  }
  updateTag(CACHE_TAGS.finance);
  await invalidateAiContextSnapshot(user.id);
}

export async function deleteBudget(id: number) {
  const user = await requireUser();
  await prisma.budget.delete({ where: { id, userId: user.id } });
  updateTag(CACHE_TAGS.finance);
  await invalidateAiContextSnapshot(user.id);
}

export async function updateBudget(id: number, data: { category?: string; amountEur?: number; month?: string | null }) {
  const user = await requireUser();
  await prisma.budget.update({
    where: { id, userId: user.id },
    data,
  });
  updateTag(CACHE_TAGS.finance);
  await invalidateAiContextSnapshot(user.id);
}

// ---------- Weekly Budget ----------

export async function getWeeklyBudget(month?: string) {
  const user = await requireUser();
  const now = new Date();
  const y = month ? parseInt(month.split("-")[0]) : now.getFullYear();
  const m = month ? parseInt(month.split("-")[1]) : now.getMonth() + 1;

  const dateFrom = `${y}-${String(m).padStart(2, "0")}-01`;
  const nextM = m === 12 ? 1 : m + 1;
  const nextY = m === 12 ? y + 1 : y;
  const dateTo = `${nextY}-${String(nextM).padStart(2, "0")}-01`;

  // Get total budget limit (sum of all active budgets)
  const budgets = await prisma.budget.findMany({
    where: { userId: user.id, active: true },
  });
  const monthlyLimit = budgets.reduce((sum, b) => sum + b.amountEur, 0);

  // Get recurring (mandatory) expenses total
  const recurring = await prisma.recurringTransaction.findMany({
    where: { userId: user.id, active: true, txType: "EXPENSE" },
  });
  const mandatoryTotal = recurring.reduce((sum, r) => sum + r.amountEur, 0);

  // Get actual mandatory spending this month (transactions matching recurring categories)
  const mandatoryCategories = recurring.map((r) => r.category);
  const transactions = await prisma.transaction.findMany({
    where: {
      userId: user.id,
      date: { gte: dateFrom, lt: dateTo },
      type: "EXPENSE",
    },
  });

  // Calculate weeks remaining in month
  const daysInMonth = new Date(y, m, 0).getDate();
  const currentDay = now.getFullYear() === y && now.getMonth() + 1 === m
    ? now.getDate()
    : 1;

  return computeWeeklyBudget({
    monthlyLimit,
    mandatoryTotal,
    mandatoryCategories,
    transactions,
    daysInMonth,
    currentDay,
  });
}
