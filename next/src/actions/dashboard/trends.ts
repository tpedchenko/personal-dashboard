"use server";

import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/current-user";
import { cached } from "@/lib/cache";
import { toDateOnly, dateToString } from "@/lib/date-utils";

export interface MonthlyTrend {
  month: number;
  income: number;
  expenses: number;
  gymSessions: number;
  avgMood: number | null;
  expensesByCategory?: Record<string, number>;
}

export interface YearComparisonMonth {
  month: number;
  income: number;
  expenses: number;
}

export interface YearComparisonData {
  [year: number]: YearComparisonMonth[];
}

export async function getMonthlyTrends(year: number): Promise<MonthlyTrend[]> {
  const user = await requireUser();

  return cached<MonthlyTrend[]>(
    `monthly-trends:${user.id}:${year}`,
    300, // 5 minutes
    async () => {
  const from = `${year}-01-01`;
  const to = `${year}-12-31`;
  const baseWhere = { userId: user.id, date: { gte: toDateOnly(from), lte: toDateOnly(to) } };

  const [incomeTx, expenseTx, expenseByCat, workoutCounts, dailyLogs] = await Promise.all([
    // Income grouped by month
    prisma.transaction.groupBy({
      by: ["date"],
      where: { ...baseWhere, type: "INCOME", subType: { not: "TRANSFER" } },
      _sum: { amountEur: true },
    }),
    // Expenses grouped by month
    prisma.transaction.groupBy({
      by: ["date"],
      where: { ...baseWhere, type: "EXPENSE", subType: { not: "TRANSFER" } },
      _sum: { amountEur: true },
    }),
    // Expenses grouped by category + month
    prisma.transaction.findMany({
      where: { ...baseWhere, type: "EXPENSE", subType: { not: "TRANSFER" } },
      select: { date: true, category: true, amountEur: true },
    }),
    // Workouts — just need count per month
    prisma.gymWorkout.findMany({
      where: baseWhere,
      select: { date: true },
    }),
    // Daily logs — need level for avg
    prisma.dailyLog.findMany({
      where: baseWhere,
      select: { date: true, level: true },
    }),
  ]);

  // Aggregate by month using Maps
  const incomeByMonth = new Map<number, number>();
  const expenseByMonth = new Map<number, number>();
  const gymByMonth = new Map<number, number>();
  const moodByMonth = new Map<number, { sum: number; count: number }>();

  for (const tx of incomeTx) {
    const m = parseInt(dateToString(tx.date).slice(5, 7), 10);
    incomeByMonth.set(m, (incomeByMonth.get(m) ?? 0) + Math.abs(tx._sum.amountEur ?? 0));
  }
  for (const tx of expenseTx) {
    const m = parseInt(dateToString(tx.date).slice(5, 7), 10);
    expenseByMonth.set(m, (expenseByMonth.get(m) ?? 0) + Math.abs(tx._sum.amountEur ?? 0));
  }
  // Category breakdown per month
  const catByMonth = new Map<number, Map<string, number>>();
  for (const tx of expenseByCat) {
    const m = parseInt(dateToString(tx.date).slice(5, 7), 10);
    const parentCat = tx.category?.includes(" / ") ? tx.category.split(" / ")[0] : (tx.category || "Other");
    const map = catByMonth.get(m) ?? new Map<string, number>();
    map.set(parentCat, (map.get(parentCat) ?? 0) + Math.abs(tx.amountEur ?? 0));
    catByMonth.set(m, map);
  }
  for (const w of workoutCounts) {
    const m = parseInt(dateToString(w.date).slice(5, 7), 10);
    gymByMonth.set(m, (gymByMonth.get(m) ?? 0) + 1);
  }
  for (const l of dailyLogs) {
    if (l.level == null) continue;
    const m = parseInt(dateToString(l.date).slice(5, 7), 10);
    const entry = moodByMonth.get(m) ?? { sum: 0, count: 0 };
    entry.sum += l.level;
    entry.count += 1;
    moodByMonth.set(m, entry);
  }

  return Array.from({ length: 12 }, (_, i) => {
    const m = i + 1;
    const mood = moodByMonth.get(m);
    return {
      month: m,
      income: Math.round(incomeByMonth.get(m) ?? 0),
      expenses: Math.round(expenseByMonth.get(m) ?? 0),
      gymSessions: gymByMonth.get(m) ?? 0,
      avgMood: mood ? Math.round((mood.sum / mood.count) * 10) / 10 : null,
      expensesByCategory: catByMonth.has(m)
        ? Object.fromEntries(
            Array.from(catByMonth.get(m)!.entries())
              .sort((a, b) => b[1] - a[1])
              .slice(0, 8)
              .map(([k, v]) => [k, Math.round(v)])
          )
        : undefined,
    };
  });
    }, // end of cached fn
  ); // end of cached()
}

export async function getMultiYearTrends(years: number[]): Promise<Record<number, MonthlyTrend[]>> {
  const entries = await Promise.all(
    years.map(async (year) => [year, await getMonthlyTrends(year)] as const)
  );
  return Object.fromEntries(entries);
}

export async function getYearComparison(years: number[]): Promise<YearComparisonData> {
  const entries = await Promise.all(
    years.map(async (year) => {
      const trends = await getMonthlyTrends(year);
      return [year, trends.map((t) => ({ month: t.month, income: t.income, expenses: t.expenses }))] as const;
    })
  );
  return Object.fromEntries(entries);
}
