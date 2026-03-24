"use server";

import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/current-user";
import { toDateOnly, dateToString } from "@/lib/date-utils";

export interface RecentActivityItem {
  id: string;
  type: "transaction" | "workout" | "daily_log";
  date: string;
  title: string;
  subtitle: string;
}

export interface CategoryBreakdownRow {
  category: string;
  amount: number;
  percentage: number;
}

export interface DailySpending {
  date: string;
  amount: number;
}

export interface MonthlyDeepDive {
  totalExpenses: number;
  avgDailyExpense: number;
  categoryBreakdown: CategoryBreakdownRow[];
  dailySpending: DailySpending[];
}

export async function getRecentActivity(
  limit: number = 10,
): Promise<RecentActivityItem[]> {
  const user = await requireUser();
  const [transactions, workouts, dailyLogs] = await Promise.all([
    prisma.transaction.findMany({
      where: { userId: user.id },
      orderBy: { date: "desc" },
      take: limit,
      select: {
        id: true,
        date: true,
        type: true,
        category: true,
        amountEur: true,
        description: true,
      },
    }),
    prisma.gymWorkout.findMany({
      where: { userId: user.id },
      orderBy: { date: "desc" },
      take: limit,
      select: {
        id: true,
        date: true,
        workoutName: true,
        durationMinutes: true,
      },
    }),
    prisma.dailyLog.findMany({
      where: { userId: user.id },
      orderBy: { date: "desc" },
      take: limit,
      select: {
        id: true,
        date: true,
        level: true,
        energyLevel: true,
      },
    }),
  ]);

  const items: RecentActivityItem[] = [];

  for (const tx of transactions) {
    const sign = tx.type === "INCOME" ? "+" : "-";
    items.push({
      id: `tx-${tx.id}`,
      type: "transaction",
      date: dateToString(tx.date),
      title: `${sign}${Math.abs(tx.amountEur ?? 0).toFixed(0)}`,
      subtitle: tx.category ?? tx.description ?? "",
    });
  }

  for (const w of workouts) {
    items.push({
      id: `gym-${w.id}`,
      type: "workout",
      date: dateToString(w.date),
      title: w.workoutName ?? "Workout",
      subtitle: w.durationMinutes ? `${w.durationMinutes} min` : "",
    });
  }

  for (const dl of dailyLogs) {
    items.push({
      id: `log-${dl.id}`,
      type: "daily_log",
      date: dateToString(dl.date),
      title: `Mood: ${dl.level ?? "\u2014"}`,
      subtitle: dl.energyLevel ? `Energy: ${dl.energyLevel}/5` : "",
    });
  }

  items.sort((a, b) => b.date.localeCompare(a.date));

  return items.slice(0, limit);
}

export async function getMonthlyDeepDive(period: {
  from: string;
  to: string;
}): Promise<MonthlyDeepDive> {
  const user = await requireUser();
  const { from, to } = period;

  const expenses = await prisma.transaction.findMany({
    where: {
      userId: user.id,
      date: { gte: toDateOnly(from), lte: toDateOnly(to) },
      type: "EXPENSE",
      subType: { not: "TRANSFER" },
    },
    select: { date: true, category: true, amountEur: true },
  });

  // Category breakdown
  const catMap = new Map<string, number>();
  let totalExpenses = 0;
  for (const tx of expenses) {
    const amt = Math.abs(tx.amountEur ?? 0);
    totalExpenses += amt;
    const cat = tx.category || "Uncategorized";
    catMap.set(cat, (catMap.get(cat) ?? 0) + amt);
  }

  const categoryBreakdown: CategoryBreakdownRow[] = Array.from(catMap.entries())
    .map(([category, amount]) => ({
      category,
      amount: Math.round(amount * 100) / 100,
      percentage: totalExpenses > 0 ? Math.round((amount / totalExpenses) * 1000) / 10 : 0,
    }))
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 10);

  // Daily spending
  const dayMap = new Map<string, number>();
  for (const tx of expenses) {
    const amt = Math.abs(tx.amountEur ?? 0);
    const txds = dateToString(tx.date);
    dayMap.set(txds, (dayMap.get(txds) ?? 0) + amt);
  }

  // Fill missing days with 0
  const fromDate = new Date(from + "T00:00:00");
  const toDate = new Date(to + "T00:00:00");
  const dailySpending: DailySpending[] = [];
  for (let d = new Date(fromDate); d <= toDate; d.setDate(d.getDate() + 1)) {
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    dailySpending.push({
      date: key,
      amount: Math.round((dayMap.get(key) ?? 0) * 100) / 100,
    });
  }

  const daysCount = dailySpending.length || 1;

  return {
    totalExpenses: Math.round(totalExpenses * 100) / 100,
    avgDailyExpense: Math.round((totalExpenses / daysCount) * 100) / 100,
    categoryBreakdown,
    dailySpending,
  };
}
