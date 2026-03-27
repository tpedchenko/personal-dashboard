"use server";

import { prisma } from "@/lib/db";
import { toDateOnly, dateToString } from "@/lib/date-utils";

type DateRange = { start: string; end: string };

/**
 * Fetch finance-related insight context for current and comparison periods.
 */
export async function getFinanceInsightContext(
  userId: number,
  current: DateRange,
  comparison: DateRange,
): Promise<string[]> {
  const [currentTx, comparisonTx] = await Promise.all([
    prisma.transaction.findMany({
      where: { userId, date: { gte: toDateOnly(current.start), lte: toDateOnly(current.end) } },
      orderBy: { date: "desc" },
      select: { date: true, type: true, category: true, amountEur: true, description: true },
    }),
    prisma.transaction.findMany({
      where: { userId, date: { gte: toDateOnly(comparison.start), lte: toDateOnly(comparison.end) } },
      orderBy: { date: "desc" },
      select: { date: true, type: true, category: true, amountEur: true, description: true },
    }),
  ]);

  const summarize = (txs: typeof currentTx, label: string) => {
    let income = 0, expenses = 0;
    const byCategory: Record<string, number> = {};
    for (const tx of txs) {
      const amt = tx.amountEur ?? 0;
      if (tx.type === "INCOME") income += amt;
      else if (tx.type === "EXPENSE") {
        expenses += Math.abs(amt);
        if (tx.category) byCategory[tx.category] = (byCategory[tx.category] ?? 0) + Math.abs(amt);
      }
    }
    const topCats = Object.entries(byCategory)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([cat, amt]) => `${cat}: EUR ${amt.toFixed(0)}`)
      .join(", ");
    return `${label} (${txs.length} transactions): income EUR ${income.toFixed(0)}, expenses EUR ${expenses.toFixed(0)}, net EUR ${(income - expenses).toFixed(0)}. Top categories: ${topCats || "none"}`;
  };

  return [
    summarize(currentTx, `CURRENT PERIOD (${current.start} to ${current.end})`),
    summarize(comparisonTx, `COMPARISON PERIOD (${comparison.start} to ${comparison.end})`),
  ];
}

/**
 * Fetch food/list insight context for current and comparison periods.
 */
export async function getListInsightContext(
  userId: number,
  current: DateRange,
  comparison: DateRange,
): Promise<string[]> {
  const [currentFood, comparisonFood] = await Promise.all([
    prisma.foodLog.findMany({
      where: { userId, date: { gte: toDateOnly(current.start), lte: toDateOnly(current.end) } },
      select: { date: true, calories: true, proteinG: true, description: true },
    }),
    prisma.foodLog.findMany({
      where: { userId, date: { gte: toDateOnly(comparison.start), lte: toDateOnly(comparison.end) } },
      select: { date: true, calories: true, proteinG: true, description: true },
    }),
  ]);

  const summarizeFood = (logs: typeof currentFood, label: string) => {
    if (logs.length === 0) return `${label}: no data`;
    const totalCal = logs.reduce((s, l) => s + (l.calories ?? 0), 0);
    const totalProtein = logs.reduce((s, l) => s + (l.proteinG ?? 0), 0);
    const days = new Set(logs.map(l => dateToString(l.date))).size;
    return `${label} (${logs.length} entries, ${days} days): total ${totalCal.toFixed(0)} kcal, ${totalProtein.toFixed(0)}g protein, avg ${days > 0 ? (totalCal / days).toFixed(0) : 0} kcal/day`;
  };

  return [
    summarizeFood(currentFood, `CURRENT PERIOD Food (${current.start} to ${current.end})`),
    summarizeFood(comparisonFood, `COMPARISON PERIOD Food (${comparison.start} to ${comparison.end})`),
  ];
}
