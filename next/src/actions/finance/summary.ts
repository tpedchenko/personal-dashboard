"use server";

import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/current-user";
import type { FinanceSummaryResult, CategoryEntry } from "./finance-utils";
import { z, ZodError } from "zod";
import { dateSchema, periodSchema } from "@/lib/validations";
import { toDateOnly } from "@/lib/date-utils";

// ---------- Summary ----------

export async function getFinanceSummary(monthOrRange?: string | { dateFrom?: string; dateTo?: string }): Promise<FinanceSummaryResult> {
  try {
    if (typeof monthOrRange === "object" && monthOrRange !== null) {
      periodSchema.parse(monthOrRange);
    } else if (typeof monthOrRange === "string") {
      z.string().regex(/^\d{4}-\d{2}$/).parse(monthOrRange);
    }
  } catch (e) {
    if (e instanceof ZodError) return { totalIncome: 0, totalExpenses: 0, balance: 0, savingsRate: 0, byCategory: [], error: "Invalid input" } as FinanceSummaryResult & { error: string };
    throw e;
  }
  const user = await requireUser();

  let dateFrom: string;
  let dateTo: string;

  if (typeof monthOrRange === "object" && monthOrRange !== null) {
    // Date range mode
    dateFrom = monthOrRange.dateFrom ?? "";
    dateTo = monthOrRange.dateTo ?? "";
  } else {
    // Legacy month mode: "YYYY-MM"
    const now = new Date();
    const y = monthOrRange ? parseInt(monthOrRange.split("-")[0]) : now.getFullYear();
    const m = monthOrRange ? parseInt(monthOrRange.split("-")[1]) : now.getMonth() + 1;
    dateFrom = `${y}-${String(m).padStart(2, "0")}-01`;
    const nextM = m === 12 ? 1 : m + 1;
    const nextY = m === 12 ? y + 1 : y;
    dateTo = `${nextY}-${String(nextM).padStart(2, "0")}-01`;
  }

  const dateFilter = {
    ...(dateFrom ? { gte: toDateOnly(dateFrom) } : {}),
    ...(dateTo ? { lte: toDateOnly(dateTo) } : {}),
  };
  const hasDateFilter = dateFrom || dateTo;

  // Aggregate income/expenses at DB level instead of loading all transactions
  const [incomeAgg, expenseAgg, categoryGroups, budgets] = await Promise.all([
    // Total income (excluding transfers)
    prisma.transaction.aggregate({
      where: {
        userId: user.id,
        type: "INCOME",
        subType: { not: "TRANSFER" },
        ...(hasDateFilter ? { date: dateFilter } : {}),
      },
      _sum: { amountEur: true },
    }),
    // Total expenses (excluding transfers)
    prisma.transaction.aggregate({
      where: {
        userId: user.id,
        type: "EXPENSE",
        subType: { not: "TRANSFER" },
        ...(hasDateFilter ? { date: dateFilter } : {}),
      },
      _sum: { amountEur: true },
    }),
    // Expenses grouped by category (excluding transfers)
    prisma.transaction.groupBy({
      by: ["category"],
      where: {
        userId: user.id,
        type: "EXPENSE",
        subType: { not: "TRANSFER" },
        category: { not: null },
        ...(hasDateFilter ? { date: dateFilter } : {}),
      },
      _sum: { amountEur: true },
      _count: { id: true },
    }),
    // Budgets
    prisma.budget.findMany({
      where: { userId: user.id, active: true },
    }),
  ]);

  const totalIncome = incomeAgg._sum.amountEur ?? 0;
  const totalExpenses = Math.abs(expenseAgg._sum.amountEur ?? 0);
  const balance = totalIncome - totalExpenses;
  const savingsRate = totalIncome > 0 ? (balance / totalIncome) * 100 : 0;

  // Aggregate subcategories into parent categories
  const parentCategoryMap = new Map<string, { total: number; count: number }>();
  for (const g of categoryGroups) {
    const cat = g.category!;
    const parentCat = cat.includes(" / ") ? cat.split(" / ")[0] : cat;
    const entry = parentCategoryMap.get(parentCat) ?? { total: 0, count: 0 };
    entry.total += Math.abs(g._sum.amountEur ?? 0);
    entry.count += g._count.id;
    parentCategoryMap.set(parentCat, entry);
  }

  const budgetMap = new Map<string, number>();
  for (const b of budgets) {
    budgetMap.set(b.category, b.amountEur);
  }

  const byCategory: CategoryEntry[] = Array.from(parentCategoryMap.entries())
    .map(([category, { total, count }]) => ({
      category,
      total,
      count,
      budget: budgetMap.get(category) ?? null,
    }))
    .sort((a, b) => b.total - a.total);

  return { totalIncome, totalExpenses, balance, savingsRate, byCategory };
}
