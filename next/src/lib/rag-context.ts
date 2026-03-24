/**
 * RAG context builder — fetches domain-specific data from PostgreSQL
 * based on the parsed intent from the user's question.
 */

import { prisma } from "@/lib/db";
import type { ChatIntent, DataDomain } from "@/lib/chat-intent";
import { searchSimilar } from "@/lib/embeddings";
import { toDateOnly, dateToString } from "@/lib/date-utils";

const DEFAULT_DAYS = 14;
const CORRELATION_DAYS = 7;

function fmtDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function getDateRange(intent: ChatIntent): { start: string; end: string } {
  if (intent.timeRange) return intent.timeRange;
  const days = intent.questionType === "correlation" ? CORRELATION_DAYS : DEFAULT_DAYS;
  const now = new Date();
  const start = new Date(now);
  start.setDate(now.getDate() - days);
  return { start: fmtDate(start), end: fmtDate(now) };
}

type ContextBuilder = (userId: number, range: { start: string; end: string }, intent: ChatIntent) => Promise<string>;

const builders: Record<DataDomain, ContextBuilder> = {
  finance: async (userId, range, intent) => {
    const parts: string[] = [];

    // Fetch transactions — fewer for aggregation, more for specific lookups
    const transactions = await prisma.transaction.findMany({
      where: { userId, date: { gte: toDateOnly(range.start), lte: toDateOnly(range.end) } },
      orderBy: { date: "desc" },
      take: intent.questionType === "specific" ? 100 : 50,
      select: {
        date: true, type: true, category: true, subType: true,
        amountEur: true, description: true, account: true,
      },
    });

    if (transactions.length === 0) return "";

    // Aggregate: totals, by category, by day
    let totalIncome = 0, totalExpenses = 0;
    const byCategory: Record<string, number> = {};
    const dailyExpenses: Record<string, number> = {};
    for (const tx of transactions) {
      const amt = tx.amountEur ?? 0;
      if (tx.type === "INCOME" && tx.subType !== "TRANSFER") {
        totalIncome += amt;
      } else if (tx.type === "EXPENSE" && tx.subType !== "TRANSFER") {
        const absAmt = Math.abs(amt);
        totalExpenses += absAmt;
        const cat = tx.category?.split(" / ")[0] ?? "Other";
        byCategory[cat] = (byCategory[cat] ?? 0) + absAmt;
        const txds = dateToString(tx.date);
        dailyExpenses[txds] = (dailyExpenses[txds] ?? 0) + absAmt;
      }
    }

    // Header + totals
    parts.push(`Finance (${range.start} — ${range.end}): ${transactions.length} tx`);
    parts.push(`Income: ${Math.round(totalIncome)} EUR, Expenses: ${Math.round(totalExpenses)} EUR, Net: ${Math.round(totalIncome - totalExpenses)} EUR`);

    // Top 5 spending categories
    const topCats = Object.entries(byCategory).sort((a, b) => b[1] - a[1]).slice(0, 5);
    if (topCats.length > 0) {
      parts.push(`Top categories: ${topCats.map(([c, a]) => `${c}: ${Math.round(a)} EUR`).join(", ")}`);
    }

    // Weekly spending trend (aggregate daily into weeks)
    const sortedDays = Object.keys(dailyExpenses).sort();
    if (sortedDays.length > 7) {
      // Group into 7-day buckets
      const weeks: { label: string; total: number }[] = [];
      let weekStart = sortedDays[0];
      let weekTotal = 0;
      let dayCount = 0;
      for (const day of sortedDays) {
        weekTotal += dailyExpenses[day];
        dayCount++;
        if (dayCount === 7) {
          weeks.push({ label: `${weekStart}…${day}`, total: weekTotal });
          weekStart = "";
          weekTotal = 0;
          dayCount = 0;
        } else if (weekStart === "") {
          weekStart = day;
        }
      }
      if (dayCount > 0) {
        weeks.push({ label: `${weekStart}…${sortedDays[sortedDays.length - 1]}`, total: weekTotal });
      }
      parts.push(`Weekly spend: ${weeks.map((w) => `${w.label}: ${Math.round(w.total)} EUR`).join(", ")}`);
    } else if (sortedDays.length > 0) {
      // Short period — show daily trend
      const dailyStr = sortedDays.map((d) => `${d}: ${Math.round(dailyExpenses[d])} EUR`).join(", ");
      parts.push(`Daily spend: ${dailyStr}`);
    }

    // Raw transactions — only for "specific" questions (up to 10)
    if (intent.questionType === "specific") {
      const txLines = transactions.slice(0, 10).map((tx) => {
        const items: string[] = [`  ${dateToString(tx.date)}:`];
        if (tx.type) items.push(tx.type);
        if (tx.category) items.push(`cat=${tx.category}`);
        if (tx.amountEur != null) items.push(`EUR ${tx.amountEur.toFixed(2)}`);
        if (tx.description) items.push(`"${tx.description}"`);
        return items.join(" ");
      });
      parts.push(`Transactions:\n${txLines.join("\n")}`);
    }

    // Budget progress (current month)
    const now = new Date();
    const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    const budgets = await prisma.budget.findMany({
      where: { userId, active: true },
      select: { category: true, amountEur: true },
    });
    if (budgets.length > 0) {
      const monthStart = `${currentMonth}-01`;
      const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
      const monthTx = await prisma.transaction.findMany({
        where: { userId, type: "EXPENSE", date: { gte: toDateOnly(monthStart), lt: toDateOnly(fmtDate(nextMonth)) } },
        select: { category: true, amountEur: true },
      });
      const spent: Record<string, number> = {};
      for (const mtx of monthTx) {
        if (mtx.category && mtx.amountEur != null) {
          spent[mtx.category] = (spent[mtx.category] ?? 0) + Math.abs(mtx.amountEur);
        }
      }
      const budgetLines = budgets.map((b) => {
        const s = spent[b.category] ?? 0;
        const pct = b.amountEur > 0 ? Math.round((s / b.amountEur) * 100) : 0;
        return `  ${b.category}: ${Math.round(s)} / ${Math.round(b.amountEur)} EUR (${pct}%)`;
      });
      parts.push(`Budget (${currentMonth}):\n${budgetLines.join("\n")}`);
    }

    return parts.join("\n");
  },

  health: async (userId, range, intent) => {
    const garmin = await prisma.garminDaily.findMany({
      where: { userId, date: { gte: toDateOnly(range.start), lte: toDateOnly(range.end) } },
      orderBy: { date: "desc" },
      take: intent.questionType === "correlation" ? 7 : 14,
    });
    if (garmin.length === 0) return "";

    const lines = garmin.map((g) => {
      const items: string[] = [`  ${dateToString(g.date)}:`];
      if (g.steps != null) items.push(`steps=${g.steps}`);
      if (g.restingHr != null) items.push(`restHR=${g.restingHr}`);
      if (g.avgStress != null) items.push(`stress=${g.avgStress}`);
      if (g.bodyBatteryHigh != null) items.push(`BB=${g.bodyBatteryLow}-${g.bodyBatteryHigh}`);
      if (g.sleepScore != null) items.push(`sleepScore=${g.sleepScore}`);
      if (g.hrvLastNight != null) items.push(`hrv=${g.hrvLastNight}ms`);
      if (g.caloriesTotal != null) items.push(`cal=${g.caloriesTotal}`);
      if (g.fitnessAge != null) items.push(`fitnessAge=${g.fitnessAge}`);
      return items.join(" ");
    });
    return `Garmin Health (${range.start} — ${range.end}):\n${lines.join("\n")}`;
  },

  sleep: async (userId, range, intent) => {
    const sleep = await prisma.garminSleep.findMany({
      where: { userId, date: { gte: toDateOnly(range.start), lte: toDateOnly(range.end) } },
      orderBy: { date: "desc" },
      take: intent.questionType === "correlation" ? 7 : 14,
    });
    if (sleep.length === 0) return "";

    const lines = sleep.map((s) => {
      const hrs = s.durationSeconds ? (s.durationSeconds / 3600).toFixed(1) : "?";
      const items: string[] = [`  ${dateToString(s.date)}: ${hrs}h`];
      if (s.deepSeconds) items.push(`deep=${(s.deepSeconds / 60).toFixed(0)}m`);
      if (s.remSeconds) items.push(`rem=${(s.remSeconds / 60).toFixed(0)}m`);
      if (s.sleepScore != null) items.push(`score=${s.sleepScore}`);
      if (s.awakeSeconds) items.push(`awake=${(s.awakeSeconds / 60).toFixed(0)}m`);
      return items.join(" ");
    });
    return `Sleep (${range.start} — ${range.end}):\n${lines.join("\n")}`;
  },

  gym: async (userId, range, intent) => {
    const workouts = await prisma.gymWorkout.findMany({
      where: { userId, date: { gte: toDateOnly(range.start), lte: toDateOnly(range.end) } },
      orderBy: { date: "desc" },
      take: intent.questionType === "correlation" ? 5 : 10,
      include: {
        exercises: {
          include: {
            exercise: { select: { name: true } },
            sets: { select: { weightKg: true, reps: true } },
          },
        },
      },
    });
    if (workouts.length === 0) return "";

    const lines = workouts.map((w) => {
      let totalVolume = 0;
      for (const ex of w.exercises) {
        for (const s of ex.sets) totalVolume += (s.weightKg ?? 0) * (s.reps ?? 0);
      }
      const exNames = w.exercises.map((e) => e.exercise.name).join(", ");
      const items: string[] = [`  ${dateToString(w.date)}:`];
      if (w.workoutName) items.push(`"${w.workoutName}"`);
      items.push(`${w.exercises.length} exercises`);
      if (totalVolume > 0) items.push(`volume=${Math.round(totalVolume)}kg`);
      if (w.durationMinutes) items.push(`${w.durationMinutes}min`);
      if (exNames) items.push(`[${exNames}]`);
      return items.join(" ");
    });
    return `Workouts (${range.start} — ${range.end}):\n${lines.join("\n")}`;
  },

  mood: async (userId, range, intent) => {
    const logs = await prisma.dailyLog.findMany({
      where: { userId, date: { gte: toDateOnly(range.start), lte: toDateOnly(range.end) } },
      orderBy: { date: "desc" },
      take: intent.questionType === "correlation" ? 7 : 14,
    });
    if (logs.length === 0) return "";

    const lines = logs.map((d) => {
      const items: string[] = [`  ${dateToString(d.date)}:`];
      if (d.level != null) items.push(`mood=${d.level}`);
      if (d.energyLevel != null) items.push(`energy=${d.energyLevel}`);
      if (d.stressLevel != null) items.push(`stress=${d.stressLevel}`);
      if (d.focusQuality != null) items.push(`focus=${d.focusQuality}`);
      if (d.alcohol != null && d.alcohol > 0) items.push(`alcohol=${d.alcohol}`);
      if (d.caffeine != null && d.caffeine > 0) items.push(`caffeine=${d.caffeine}`);
      if (d.generalNote) items.push(`note="${d.generalNote}"`);
      return items.join(" ");
    });
    return `Daily Log (${range.start} — ${range.end}):\n${lines.join("\n")}`;
  },

  investments: async (userId) => {
    const [positions, snapshots] = await Promise.all([
      prisma.brokerPosition.findMany({
        where: { userId },
        orderBy: { marketValue: "desc" },
        select: { symbol: true, name: true, quantity: true, marketValue: true, unrealizedPnl: true, broker: true, assetClass: true },
      }),
      prisma.portfolioSnapshot.findMany({
        where: { userId },
        orderBy: { date: "desc" },
        take: 5,
        select: { date: true, totalNav: true, totalPnl: true, cashEur: true, investedEur: true },
      }),
    ]);

    if (positions.length === 0 && snapshots.length === 0) return "";

    const parts: string[] = [];

    if (positions.length > 0) {
      const totalNav = positions.reduce((sum, p) => sum + Number(p.marketValue ?? 0), 0);
      const totalPnl = positions.reduce((sum, p) => sum + Number(p.unrealizedPnl ?? 0), 0);
      parts.push(`Portfolio: NAV ${Math.round(totalNav)} EUR, PnL ${totalPnl >= 0 ? "+" : ""}${Math.round(totalPnl)} EUR, ${positions.length} positions`);

      const posLines = positions.slice(0, 15).map((p) => {
        const mv = Number(p.marketValue ?? 0);
        const pnl = Number(p.unrealizedPnl ?? 0);
        return `  ${p.symbol} (${p.name}): ${Math.round(mv)} EUR, PnL ${pnl >= 0 ? "+" : ""}${Math.round(pnl)} EUR [${p.broker}]`;
      });
      parts.push(`Positions:\n${posLines.join("\n")}`);
    }

    if (snapshots.length > 0) {
      const snapLines = snapshots.map((s) =>
        `  ${dateToString(s.date)}: NAV=${Math.round(s.totalNav ?? 0)} EUR, PnL=${Math.round(s.totalPnl ?? 0)} EUR, Cash=${Math.round(s.cashEur ?? 0)} EUR`
      );
      parts.push(`NAV History:\n${snapLines.join("\n")}`);
    }

    return parts.join("\n");
  },

  food: async (userId, range) => {
    const foodLogs = await prisma.foodLog.findMany({
      where: { userId, date: { gte: toDateOnly(range.start), lte: toDateOnly(range.end) } },
      orderBy: { date: "desc" },
      select: { date: true, calories: true, proteinG: true, description: true },
    });
    if (foodLogs.length === 0) return "";

    const byDate: Record<string, { calories: number; protein: number; items: string[] }> = {};
    for (const fl of foodLogs) {
      const flds = dateToString(fl.date);
      if (!byDate[flds]) byDate[flds] = { calories: 0, protein: 0, items: [] };
      byDate[flds].calories += fl.calories ?? 0;
      byDate[flds].protein += fl.proteinG ?? 0;
      if (fl.description) byDate[flds].items.push(fl.description);
    }
    const dates = Object.keys(byDate).sort().reverse().slice(0, 7);
    const lines = dates.map((d) => {
      const data = byDate[d];
      return `  ${d}: ${Math.round(data.calories)} kcal, ${Math.round(data.protein)}g protein`;
    });
    return `Food (${range.start} — ${range.end}):\n${lines.join("\n")}`;
  },

  trading: async () => {
    try {
      const { getTradingOverview } = await import("@/actions/trading");
      const trading = await getTradingOverview();
      if (!trading || trading.error) return "";

      const items: string[] = [];
      if (trading.profit?.profit_all_coin != null) items.push(`Total P&L: ${trading.profit.profit_all_coin.toFixed(4)}`);
      if (trading.openTrades?.length) items.push(`Open trades: ${trading.openTrades.length}`);
      if (trading.profit?.winning_trades != null && trading.profit?.losing_trades != null) {
        const total = trading.profit.winning_trades + trading.profit.losing_trades;
        if (total > 0) items.push(`Win rate: ${((trading.profit.winning_trades / total) * 100).toFixed(1)}%`);
      }
      return items.length > 0 ? `Trading: ${items.join(", ")}` : "";
    } catch {
      return "";
    }
  },

  weight: async (userId) => {
    const records = await prisma.garminBodyComposition.findMany({
      where: { userId },
      orderBy: { date: "desc" },
      take: 5,
      select: { date: true, weight: true, bodyFatPct: true, muscleMass: true, bmi: true, metabolicAge: true },
    });
    if (records.length === 0) return "";

    const lines = records.map((r) => {
      const items: string[] = [`  ${dateToString(r.date)}: ${r.weight}kg`];
      if (r.bodyFatPct != null) items.push(`fat=${r.bodyFatPct}%`);
      if (r.muscleMass != null) items.push(`muscle=${r.muscleMass}kg`);
      if (r.bmi != null) items.push(`BMI=${r.bmi}`);
      return items.join(" ");
    });
    return `Body Composition:\n${lines.join("\n")}`;
  },

  tax: async (userId) => {
    const deadlines = await prisma.taxDeadline.findMany({
      where: { userId, completedAt: null, dueDate: { gte: new Date() } },
      orderBy: { dueDate: "asc" },
      take: 5,
    });
    if (deadlines.length === 0) return "";

    const lines = deadlines.map((d) =>
      `  ${d.country} ${d.type} ${d.period}: due ${d.dueDate.toISOString().slice(0, 10)}`
    );
    return `Tax Deadlines:\n${lines.join("\n")}`;
  },
};

/**
 * Build a cross-domain correlation summary highlighting recent trends.
 * Kept compact (200-300 tokens) to avoid bloating the context.
 */
async function buildCorrelationSummary(userId: number, range: { start: string; end: string }): Promise<string> {
  const [garmin, sleep, mood, workouts] = await Promise.all([
    prisma.garminDaily.findMany({
      where: { userId, date: { gte: toDateOnly(range.start), lte: toDateOnly(range.end) } },
      orderBy: { date: "desc" },
      take: 7,
      select: { date: true, avgStress: true, bodyBatteryHigh: true, steps: true, restingHr: true, hrvLastNight: true },
    }),
    prisma.garminSleep.findMany({
      where: { userId, date: { gte: toDateOnly(range.start), lte: toDateOnly(range.end) } },
      orderBy: { date: "desc" },
      take: 7,
      select: { date: true, durationSeconds: true, deepSeconds: true, sleepScore: true },
    }),
    prisma.dailyLog.findMany({
      where: { userId, date: { gte: toDateOnly(range.start), lte: toDateOnly(range.end) } },
      orderBy: { date: "desc" },
      take: 7,
      select: { date: true, level: true, energyLevel: true, stressLevel: true, alcohol: true },
    }),
    prisma.gymWorkout.findMany({
      where: { userId, date: { gte: toDateOnly(range.start), lte: toDateOnly(range.end) } },
      orderBy: { date: "desc" },
      select: { date: true },
    }),
  ]);

  const trends: string[] = [];

  // Sleep trend
  if (sleep.length >= 2) {
    const scores = sleep.filter((s) => s.sleepScore != null).map((s) => s.sleepScore!);
    if (scores.length >= 2) {
      const avg = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
      const mid = Math.floor(scores.length / 2);
      const olderAvg = scores.slice(mid).reduce((a, b) => a + b, 0) / scores.slice(mid).length;
      const recentAvg = scores.slice(0, mid).reduce((a, b) => a + b, 0) / scores.slice(0, mid).length;
      const direction = recentAvg > olderAvg + 3 ? "improving" : recentAvg < olderAvg - 3 ? "declining" : "stable";
      trends.push(`Sleep quality: avg score ${avg}, ${direction}`);
    }
    const durations = sleep.filter((s) => s.durationSeconds).map((s) => s.durationSeconds! / 3600);
    if (durations.length > 0) {
      const avgHrs = (durations.reduce((a, b) => a + b, 0) / durations.length).toFixed(1);
      trends.push(`Avg sleep duration: ${avgHrs}h`);
    }
  }

  // Stress trend (Garmin)
  if (garmin.length >= 2) {
    const stressValues = garmin.filter((g) => g.avgStress != null).map((g) => g.avgStress!);
    if (stressValues.length >= 2) {
      const avg = Math.round(stressValues.reduce((a, b) => a + b, 0) / stressValues.length);
      const mid = Math.floor(stressValues.length / 2);
      const olderAvg = stressValues.slice(mid).reduce((a, b) => a + b, 0) / stressValues.slice(mid).length;
      const recentAvg = stressValues.slice(0, mid).reduce((a, b) => a + b, 0) / stressValues.slice(0, mid).length;
      const direction = recentAvg > olderAvg + 2 ? "increasing" : recentAvg < olderAvg - 2 ? "decreasing" : "stable";
      trends.push(`Garmin stress: avg ${avg}, ${direction}`);
    }
    const hrvValues = garmin.filter((g) => g.hrvLastNight != null).map((g) => g.hrvLastNight!);
    if (hrvValues.length >= 2) {
      const avg = Math.round(hrvValues.reduce((a, b) => a + b, 0) / hrvValues.length);
      trends.push(`HRV: avg ${avg}ms`);
    }
  }

  // Mood/energy trend
  if (mood.length >= 2) {
    const energyValues = mood.filter((m) => m.energyLevel != null).map((m) => m.energyLevel!);
    if (energyValues.length >= 2) {
      const avg = (energyValues.reduce((a, b) => a + b, 0) / energyValues.length).toFixed(1);
      trends.push(`Energy level: avg ${avg}/10`);
    }
    const moodValues = mood.filter((m) => m.level != null).map((m) => m.level!);
    if (moodValues.length >= 2) {
      const avg = (moodValues.reduce((a, b) => a + b, 0) / moodValues.length).toFixed(1);
      trends.push(`Mood: avg ${avg}/10`);
    }
    const alcoholDays = mood.filter((m) => m.alcohol != null && m.alcohol > 0).length;
    if (alcoholDays > 0) {
      trends.push(`Alcohol: ${alcoholDays}/${mood.length} days`);
    }
  }

  // Gym frequency
  trends.push(`Gym sessions: ${workouts.length} this period`);

  if (trends.length === 0) return "";

  return `\n--- Cross-Domain Correlation Summary (${range.start} — ${range.end}) ---\n${trends.join("\n")}\n--- End Correlation Summary ---`;
}

/**
 * Build a stable cache key for RAG context based on intent + user.
 * Same domains, date range, and question type → same key → cache hit.
 */
export function getRagCacheKey(intent: ChatIntent, userId: number): string {
  const range = getDateRange(intent);
  const domains = [...intent.domains].sort().join(",");
  return `rag:${userId}:${domains}:${intent.questionType}:${range.start}:${range.end}`;
}

/**
 * Determine if a date range maps to a standard period (month, week, year).
 * Returns null if the range doesn't align with a known period.
 */
function detectPeriod(range: { start: string; end: string }): { periodType: string; periodKey: string } | null {
  const start = new Date(range.start);
  const end = new Date(range.end);

  // Check for full month: start is 1st, end is last day of same month
  if (start.getUTCDate() === 1) {
    const lastDay = new Date(start.getUTCFullYear(), start.getUTCMonth() + 1, 0);
    if (fmtDate(end) === fmtDate(lastDay)) {
      const key = `${start.getUTCFullYear()}-${String(start.getUTCMonth() + 1).padStart(2, "0")}`;
      return { periodType: "month", periodKey: key };
    }
  }

  // Check for full year: Jan 1 to Dec 31
  if (start.getUTCMonth() === 0 && start.getUTCDate() === 1 &&
      end.getUTCMonth() === 11 && end.getUTCDate() === 31 &&
      start.getUTCFullYear() === end.getUTCFullYear()) {
    return { periodType: "year", periodKey: String(start.getUTCFullYear()) };
  }

  // Check for ISO week (~7 days, Monday to Sunday)
  const diffDays = Math.round((end.getTime() - start.getTime()) / 86400000);
  if (diffDays >= 6 && diffDays <= 7 && start.getUTCDay() === 1) {
    const jan4 = new Date(start.getUTCFullYear(), 0, 4);
    const weekNum = Math.ceil(((start.getTime() - jan4.getTime()) / 86400000 + jan4.getUTCDay() + 1) / 7);
    const key = `${start.getUTCFullYear()}-W${String(weekNum).padStart(2, "0")}`;
    return { periodType: "week", periodKey: key };
  }

  return null;
}

const SNAPSHOT_MAX_AGE_MS = 60 * 60 * 1000; // 1 hour

/**
 * Try to load cached snapshots for the given domains and period.
 * Returns context strings or null if no valid snapshots found.
 */
async function tryLoadSnapshots(
  userId: number,
  domains: DataDomain[],
  period: { periodType: string; periodKey: string },
): Promise<string[] | null> {
  const cutoff = new Date(Date.now() - SNAPSHOT_MAX_AGE_MS);

  const snapshots = await prisma.aiContextSnapshot.findMany({
    where: {
      userId,
      periodType: period.periodType,
      periodKey: period.periodKey,
      domain: { in: ["all", ...domains] },
      generatedAt: { gte: cutoff },
    },
  });

  if (snapshots.length === 0) return null;

  // An "all" snapshot covers every domain
  const allSnapshot = snapshots.find((s) => s.domain === "all");
  if (allSnapshot) return [allSnapshot.content];

  // Return individual domain snapshots
  const parts = snapshots.map((s) => s.content).filter(Boolean);
  return parts.length > 0 ? parts : null;
}

/**
 * Build RAG context based on parsed intent.
 * Only fetches data for relevant domains, reducing noise and token usage.
 * Uses cached ai_context_snapshots when available for standard periods.
 */
export async function buildRagContext(intent: ChatIntent, userId: number, query?: string): Promise<string> {
  const range = getDateRange(intent);
  const today = fmtDate(new Date());

  // Optimization: check for cached snapshots for standard periods (month/week/year)
  const period = detectPeriod(range);
  if (period) {
    const cached = await tryLoadSnapshots(userId, intent.domains, period);
    if (cached) {
      const parts = cached.filter(Boolean);
      if (parts.length > 0) {
        return `\n--- User Data Context (${today}, domains: ${intent.domains.join(", ")}, snapshot: ${period.periodType}/${period.periodKey}) ---\n${parts.join("\n\n")}\n--- End Context ---\n`;
      }
    }
  }

  // Fallback: query individual tables
  const contextParts = await Promise.all(
    intent.domains.map((domain) => builders[domain](userId, range, intent))
  );

  const parts = contextParts.filter(Boolean);
  if (parts.length === 0) return "";

  let context = `\n--- User Data Context (${today}, domains: ${intent.domains.join(", ")}) ---\n${parts.join("\n\n")}\n--- End Context ---\n`;

  // Append cross-domain correlation summary for causal/correlation questions
  if (intent.questionType === "correlation") {
    const correlationSummary = await buildCorrelationSummary(userId, range);
    if (correlationSummary) {
      context += correlationSummary;
    }
  }

  // Semantic search: find relevant notes/descriptions via pgvector embeddings
  if (query && (intent.questionType === "specific" || intent.questionType === "correlation")) {
    try {
      const similar = await searchSimilar(userId, query, 5);
      if (similar.length > 0) {
        const MIN_SIMILARITY = 0.3;
        const relevant = similar.filter((s) => s.similarity >= MIN_SIMILARITY);
        if (relevant.length > 0) {
          const lines = relevant.map(
            (s) => `  [${s.sourceTable}#${s.sourceId}] (${(s.similarity * 100).toFixed(0)}%) ${s.text.slice(0, 200)}`
          );
          context += `\n--- Relevant Notes (semantic search) ---\n${lines.join("\n")}\n--- End Notes ---\n`;
        }
      }
    } catch (err) {
      console.error("[RAG] Semantic search failed (non-fatal):", err);
    }
  }

  return context;
}
