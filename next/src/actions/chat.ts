"use server";

// ── From chat-context.ts ──

import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/current-user";
import { toDateOnly, dateToString } from "@/lib/date-utils";

const SNAPSHOT_PERIOD_TYPE = "chat-context";
const SNAPSHOT_TTL_MS = 60 * 60 * 1000; // 1 hour

/**
 * Invalidate the cached AI context snapshot for a user.
 * Call this from any server action that modifies user data
 * (transactions, daily logs, food, workouts, budgets, etc.).
 */
export async function invalidateAiContextSnapshot(userId?: number) {
  const uid = userId ?? (await requireUser()).id;
  await prisma.aiContextSnapshot.deleteMany({
    where: {
      userId: uid,
      periodType: SNAPSHOT_PERIOD_TYPE,
    },
  });
}

/**
 * Gather recent user data context for AI chat.
 * Returns a concise text summary the AI can reference.
 * Uses AiContextSnapshot DB table to cache the result for 1 hour.
 */
export async function getUserContext(): Promise<string> {
  const user = await requireUser();

  // Check for a recent DB snapshot
  const cached = await prisma.aiContextSnapshot.findFirst({
    where: {
      userId: user.id,
      periodType: SNAPSHOT_PERIOD_TYPE,
    },
    orderBy: { generatedAt: "desc" },
  });

  if (cached && cached.generatedAt) {
    const age = Date.now() - cached.generatedAt.getTime();
    if (age < SNAPSHOT_TTL_MS) {
      return cached.content;
    }
  }

  const today = new Date();
  const fourteenDaysAgo = new Date(today);
  fourteenDaysAgo.setDate(today.getDate() - 14);
  const thirtyDaysAgo = new Date(today);
  thirtyDaysAgo.setDate(today.getDate() - 30);

  const fmtDate = (d: Date) => d.toISOString().slice(0, 10);

  // Get current month for budget progress
  const currentMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`;

  const [
    dailyLogs,
    transactions,
    accountBalances,
    budgets,
    garminDaily,
    garminSleep,
    latestWeight,
    workouts,
    foodLogs,
  ] = await Promise.all([
    // Last 14 days of daily_log
    prisma.dailyLog.findMany({
      where: { date: { gte: toDateOnly(fmtDate(fourteenDaysAgo)) }, userId: user.id },
      orderBy: { date: "desc" },
      take: 14,
    }),
    // Last 50 transactions
    prisma.transaction.findMany({
      where: { userId: user.id },
      orderBy: { date: "desc" },
      take: 50,
      select: {
        date: true,
        type: true,
        category: true,
        amountOriginal: true,
        currencyOriginal: true,
        amountEur: true,
        description: true,
      },
    }),
    // Account balances: sum by account
    prisma.transaction.groupBy({
      by: ["account"],
      where: { userId: user.id },
      _sum: { amountEur: true },
    }),
    // Budgets for current month
    prisma.budget.findMany({
      where: {
        userId: user.id,
        active: true,
      },
      select: { category: true, amountEur: true, month: true },
    }),
    // Last 14 Garmin daily records
    prisma.garminDaily.findMany({
      where: { userId: user.id, date: { gte: toDateOnly(fmtDate(fourteenDaysAgo)) } },
      orderBy: { date: "desc" },
      take: 14,
    }),
    // Last 14 Garmin sleep records
    prisma.garminSleep.findMany({
      where: { userId: user.id, date: { gte: toDateOnly(fmtDate(fourteenDaysAgo)) } },
      orderBy: { date: "desc" },
      take: 14,
    }),
    // Latest weight
    prisma.garminBodyComposition.findFirst({
      where: { userId: user.id },
      orderBy: { date: "desc" },
      select: { date: true, weight: true, bodyFatPct: true },
    }),
    // Last 5 workouts with exercises
    prisma.gymWorkout.findMany({
      where: { userId: user.id },
      orderBy: { date: "desc" },
      take: 5,
      include: {
        exercises: {
          include: {
            exercise: { select: { name: true } },
            sets: { select: { weightKg: true, reps: true } },
          },
        },
      },
    }),
    // Last 7 food logs (aggregated by date)
    prisma.foodLog.findMany({
      where: { userId: user.id, date: { gte: toDateOnly(fmtDate(fourteenDaysAgo)) } },
      orderBy: { date: "desc" },
      select: { date: true, calories: true, proteinG: true, description: true },
    }),
  ]);

  const parts: string[] = [];

  // Last 50 transactions (detailed)
  if (transactions.length > 0) {
    const txLines = transactions.map((tx) => {
      const items: string[] = [`  ${dateToString(tx.date)}:`];
      if (tx.type) items.push(`type=${tx.type}`);
      if (tx.category) items.push(`cat=${tx.category}`);
      if (tx.amountOriginal != null && tx.currencyOriginal) {
        items.push(`${tx.amountOriginal} ${tx.currencyOriginal}`);
      }
      if (tx.amountEur != null) items.push(`(EUR ${tx.amountEur.toFixed(2)})`);
      if (tx.description) items.push(`"${tx.description}"`);
      return items.join(" ");
    });
    parts.push(`Recent Transactions (last 50):\n${txLines.join("\n")}`);

    // Finance summary
    const last30Tx = transactions.filter((tx) => dateToString(tx.date) >= fmtDate(thirtyDaysAgo));
    let totalIncome = 0;
    let totalExpenses = 0;
    for (const tx of last30Tx) {
      const amt = tx.amountEur ?? 0;
      if (tx.type === "INCOME") totalIncome += amt;
      else if (tx.type === "EXPENSE") totalExpenses += amt;
    }
    parts.push(
      `Finance Summary (30 days): income EUR ${totalIncome.toFixed(0)}, expenses EUR ${Math.abs(totalExpenses).toFixed(0)}, net EUR ${(totalIncome + totalExpenses).toFixed(0)}`
    );
  }

  // Account balances
  if (accountBalances.length > 0) {
    const balLines = accountBalances
      .filter((a) => a.account)
      .map((a) => `  ${a.account}: EUR ${(a._sum.amountEur ?? 0).toFixed(2)}`);
    if (balLines.length > 0) {
      parts.push(`Account Balances:\n${balLines.join("\n")}`);
    }
  }

  // Budget progress
  if (budgets.length > 0) {
    // Get current month spending by category
    const currentMonthStart = `${currentMonth}-01`;
    const nextMonth = new Date(today.getFullYear(), today.getMonth() + 1, 1);
    const currentMonthEnd = fmtDate(nextMonth);

    const monthExpenses = transactions.filter(
      (tx) => tx.type === "EXPENSE" && dateToString(tx.date) >= currentMonthStart && dateToString(tx.date) < currentMonthEnd
    );

    const spentByCategory: Record<string, number> = {};
    for (const tx of monthExpenses) {
      if (tx.category && tx.amountEur != null) {
        spentByCategory[tx.category] = (spentByCategory[tx.category] ?? 0) + Math.abs(tx.amountEur);
      }
    }

    const budgetLines = budgets.map((b) => {
      const spent = spentByCategory[b.category] ?? 0;
      const pct = b.amountEur > 0 ? Math.round((spent / b.amountEur) * 100) : 0;
      return `  ${b.category}: EUR ${spent.toFixed(0)} / EUR ${b.amountEur.toFixed(0)} (${pct}%)`;
    });
    parts.push(`Budget Progress (${currentMonth}):\n${budgetLines.join("\n")}`);
  }

  // Daily log summary (last 14 days)
  if (dailyLogs.length > 0) {
    const logLines = dailyLogs.map((d) => {
      const items: string[] = [`  ${dateToString(d.date)}:`];
      if (d.level != null) items.push(`level=${d.level}`);
      if (d.moodDelta != null) items.push(`mood_delta=${d.moodDelta}`);
      if (d.energyLevel != null) items.push(`energy=${d.energyLevel}`);
      if (d.stressLevel != null) items.push(`stress=${d.stressLevel}`);
      if (d.focusQuality != null) items.push(`focus=${d.focusQuality}`);
      if (d.alcohol != null && d.alcohol > 0) items.push(`alcohol=${d.alcohol}`);
      if (d.kidsHours != null && d.kidsHours > 0) items.push(`kids=${d.kidsHours}h`);
      if (d.generalNote) items.push(`note="${d.generalNote}"`);
      return items.join(" ");
    });
    parts.push(`Daily Log (last 14 days):\n${logLines.join("\n")}`);
  }

  // Garmin daily (last 14 days)
  if (garminDaily.length > 0) {
    const gLines = garminDaily.map((g) => {
      const items: string[] = [`  ${dateToString(g.date)}:`];
      if (g.steps != null) items.push(`steps=${g.steps}`);
      if (g.sleepSeconds != null) items.push(`sleep=${(g.sleepSeconds / 3600).toFixed(1)}h`);
      if (g.restingHr != null) items.push(`restHR=${g.restingHr}`);
      if (g.avgStress != null) items.push(`stress=${g.avgStress}`);
      if (g.bodyBatteryHigh != null) items.push(`bodyBattery=${g.bodyBatteryLow}-${g.bodyBatteryHigh}`);
      if (g.sleepScore != null) items.push(`sleepScore=${g.sleepScore}`);
      if (g.caloriesTotal != null) items.push(`cal=${g.caloriesTotal}`);
      if (g.hrvLastNight != null) items.push(`hrv=${g.hrvLastNight}ms`);
      return items.join(" ");
    });
    parts.push(`Garmin Daily (last 14 days):\n${gLines.join("\n")}`);
  }

  // Garmin sleep (last 14 days)
  if (garminSleep.length > 0) {
    const sLines = garminSleep.map((s) => {
      const hrs = s.durationSeconds ? (s.durationSeconds / 3600).toFixed(1) : "?";
      const items: string[] = [`  ${dateToString(s.date)}: ${hrs}h total`];
      if (s.deepSeconds) items.push(`deep=${(s.deepSeconds / 60).toFixed(0)}m`);
      if (s.remSeconds) items.push(`rem=${(s.remSeconds / 60).toFixed(0)}m`);
      if (s.sleepScore != null) items.push(`score=${s.sleepScore}`);
      return items.join(" ");
    });
    parts.push(`Sleep (last 14 days):\n${sLines.join("\n")}`);
  }

  // Last 5 workouts
  if (workouts.length > 0) {
    const wLines = workouts.map((w) => {
      const exerciseCount = w.exercises.length;
      let totalVolume = 0;
      for (const ex of w.exercises) {
        for (const s of ex.sets) {
          totalVolume += (s.weightKg ?? 0) * (s.reps ?? 0);
        }
      }
      const items: string[] = [`  ${dateToString(w.date)}:`];
      if (w.workoutName) items.push(`"${w.workoutName}"`);
      items.push(`${exerciseCount} exercises`);
      if (totalVolume > 0) items.push(`volume=${totalVolume.toFixed(0)}kg`);
      if (w.durationMinutes) items.push(`${w.durationMinutes}min`);
      // List exercise names
      const exNames = w.exercises.map((e) => e.exercise.name).join(", ");
      if (exNames) items.push(`[${exNames}]`);
      return items.join(" ");
    });
    parts.push(`Last 5 Workouts:\n${wLines.join("\n")}`);
  }

  // Last 7 days food logs (aggregated by date)
  if (foodLogs.length > 0) {
    const byDate: Record<string, { calories: number; protein: number; items: string[] }> = {};
    for (const fl of foodLogs) {
      if (!byDate[dateToString(fl.date)]) byDate[dateToString(fl.date)] = { calories: 0, protein: 0, items: [] };
      byDate[dateToString(fl.date)].calories += fl.calories ?? 0;
      byDate[dateToString(fl.date)].protein += fl.proteinG ?? 0;
      if (fl.description) byDate[dateToString(fl.date)].items.push(fl.description);
    }
    const dates = Object.keys(byDate).sort().reverse().slice(0, 7);
    const fLines = dates.map((d) => {
      const data = byDate[d];
      return `  ${d}: ${data.calories.toFixed(0)} kcal, ${data.protein.toFixed(0)}g protein`;
    });
    parts.push(`Food Log (last 7 days):\n${fLines.join("\n")}`);
  }

  // Weight
  if (latestWeight) {
    const wItems = [`Latest weight (${latestWeight.date}): ${latestWeight.weight}kg`];
    if (latestWeight.bodyFatPct != null) wItems.push(`fat=${latestWeight.bodyFatPct}%`);
    parts.push(wItems.join(" "));
  }

  // Trading context (if Freqtrade connected)
  try {
    const { getTradingOverview } = await import("@/actions/trading");
    const trading = await getTradingOverview();
    if (trading && !trading.error) {
      const tItems = [];
      if (trading.profit?.profit_all_coin != null) tItems.push(`Total P&L: ${trading.profit.profit_all_coin.toFixed(4)}`);
      if (trading.openTrades?.length) tItems.push(`Open trades: ${trading.openTrades.length}`);
      if (trading.profit?.winning_trades != null && trading.profit?.losing_trades != null) {
        const total = trading.profit.winning_trades + trading.profit.losing_trades;
        if (total > 0) tItems.push(`Win rate: ${((trading.profit.winning_trades / total) * 100).toFixed(1)}%`);
      }
      if (tItems.length > 0) parts.push(`Trading: ${tItems.join(", ")}`);
    }
  } catch (e) { console.error("[chat/getUserContext] Freqtrade context error:", e); }

  // Tax deadlines
  try {
    const deadlines = await prisma.taxDeadline.findMany({
      where: { userId: user.id, completedAt: null, dueDate: { gte: new Date() } },
      orderBy: { dueDate: "asc" },
      take: 5,
    });
    if (deadlines.length > 0) {
      const dLines = deadlines.map(d => `  ${d.country} ${d.type} ${d.period}: due ${d.dueDate.toISOString().slice(0, 10)}`);
      parts.push(`Upcoming Tax Deadlines:\n${dLines.join("\n")}`);
    }
  } catch (e) { console.error("[chat/getUserContext] Tax deadlines error:", e); }

  // AI Insights summary (from nightly generation)
  try {
    const insights = await prisma.aiInsight.findMany({
      where: { userId: user.id },
      orderBy: { date: "desc" },
      distinct: ["page"],
    });
    if (insights.length > 0) {
      const insightLines = insights.map((i) => {
        try {
          const items = JSON.parse(i.insightsJson);
          const titles = items.map((item: { title: string; body: string }) => `${item.title}: ${item.body}`).join("; ");
          return `  ${i.page} (${i.date}): ${titles}`;
        } catch {
          return `  ${i.page} (${i.date}): [parse error]`;
        }
      });
      parts.push(`AI Insights Summary:\n${insightLines.join("\n")}`);
    }
  } catch (e) { console.error("[chat/getUserContext] AI insights error:", e); }

  if (parts.length === 0) return "";

  const result = `\n--- User Data Context (${fmtDate(today)}) ---\n${parts.join("\n\n")}\n--- End Context ---\n`;

  // Persist snapshot to DB (upsert by unique constraint)
  const periodKey = fmtDate(today);
  await prisma.aiContextSnapshot.upsert({
    where: {
      userId_periodType_periodKey_domain: {
        userId: user.id,
        periodType: SNAPSHOT_PERIOD_TYPE,
        periodKey,
        domain: "all",
      },
    },
    update: {
      content: result,
      generatedAt: new Date(),
      userId: user.id,
    },
    create: {
      periodType: SNAPSHOT_PERIOD_TYPE,
      periodKey,
      domain: "all",
      content: result,
      userId: user.id,
    },
  });

  return result;
}

/**
 * Page-specific context sections mapping.
 * Each page only gets the data sections relevant to it.
 */
const PAGE_CONTEXT_SECTIONS: Record<string, string[]> = {
  finance: ["transactions", "account_balances", "budget_progress", "finance_summary"],
  investments: ["trading"],
  "my-day": ["daily_log", "garmin_daily", "garmin_sleep", "food_log", "weight"],
  gym: ["workouts", "weight"],
  // exercises uses getExerciseInsightsContext() directly — not this function
  list: ["food_log"],
  dashboard: [], // empty = all sections
};

/**
 * Get page-specific user context for AI insights.
 * Filters data sections based on the page to reduce noise and token usage.
 * For "exercises" page, use getExerciseInsightsContext() directly instead.
 */
export async function getPageContext(page: string): Promise<string> {
  const user = await requireUser();

  const allowedSections = PAGE_CONTEXT_SECTIONS[page];
  // If page not in map or empty array → return full context
  if (!allowedSections || allowedSections.length === 0) {
    return getUserContext();
  }

  const today = new Date();
  const fourteenDaysAgo = new Date(today);
  fourteenDaysAgo.setDate(today.getDate() - 14);
  const thirtyDaysAgo = new Date(today);
  thirtyDaysAgo.setDate(today.getDate() - 30);

  const fmtDate = (d: Date) => d.toISOString().slice(0, 10);
  const currentMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`;

  const parts: string[] = [];

  // Transactions, account balances, budget progress, finance summary
  if (
    allowedSections.includes("transactions") ||
    allowedSections.includes("account_balances") ||
    allowedSections.includes("budget_progress") ||
    allowedSections.includes("finance_summary")
  ) {
    const [transactions, accountBalances, budgets] = await Promise.all([
      allowedSections.includes("transactions") || allowedSections.includes("finance_summary") || allowedSections.includes("budget_progress")
        ? prisma.transaction.findMany({
            where: { userId: user.id },
            orderBy: { date: "desc" },
            take: 50,
            select: {
              date: true, type: true, category: true,
              amountOriginal: true, currencyOriginal: true,
              amountEur: true, description: true, account: true,
            },
          })
        : Promise.resolve([]),
      allowedSections.includes("account_balances")
        ? prisma.transaction.groupBy({
            by: ["account"],
            where: { userId: user.id },
            _sum: { amountEur: true },
          })
        : Promise.resolve([]),
      allowedSections.includes("budget_progress")
        ? prisma.budget.findMany({
            where: { userId: user.id, active: true },
            select: { category: true, amountEur: true, month: true },
          })
        : Promise.resolve([]),
    ]);

    if (allowedSections.includes("transactions") && transactions.length > 0) {
      const txLines = transactions.map((tx) => {
        const items: string[] = [`  ${dateToString(tx.date)}:`];
        if (tx.type) items.push(`type=${tx.type}`);
        if (tx.category) items.push(`cat=${tx.category}`);
        if (tx.amountOriginal != null && tx.currencyOriginal) {
          items.push(`${tx.amountOriginal} ${tx.currencyOriginal}`);
        }
        if (tx.amountEur != null) items.push(`(EUR ${tx.amountEur.toFixed(2)})`);
        if (tx.description) items.push(`"${tx.description}"`);
        return items.join(" ");
      });
      parts.push(`Recent Transactions (last 50):\n${txLines.join("\n")}`);
    }

    if (allowedSections.includes("finance_summary") && transactions.length > 0) {
      const last30Tx = transactions.filter((tx) => dateToString(tx.date) >= fmtDate(thirtyDaysAgo));
      let totalIncome = 0;
      let totalExpenses = 0;
      for (const tx of last30Tx) {
        const amt = tx.amountEur ?? 0;
        if (tx.type === "INCOME") totalIncome += amt;
        else if (tx.type === "EXPENSE") totalExpenses += amt;
      }
      parts.push(
        `Finance Summary (30 days): income EUR ${totalIncome.toFixed(0)}, expenses EUR ${Math.abs(totalExpenses).toFixed(0)}, net EUR ${(totalIncome + totalExpenses).toFixed(0)}`
      );
    }

    if (allowedSections.includes("account_balances") && accountBalances.length > 0) {
      const balLines = accountBalances
        .filter((a) => a.account)
        .map((a) => `  ${a.account}: EUR ${(a._sum.amountEur ?? 0).toFixed(2)}`);
      if (balLines.length > 0) {
        parts.push(`Account Balances:\n${balLines.join("\n")}`);
      }
    }

    if (allowedSections.includes("budget_progress") && budgets.length > 0) {
      const currentMonthStart = `${currentMonth}-01`;
      const nextMonth = new Date(today.getFullYear(), today.getMonth() + 1, 1);
      const currentMonthEnd = fmtDate(nextMonth);

      const monthExpenses = transactions.filter(
        (tx) => tx.type === "EXPENSE" && dateToString(tx.date) >= currentMonthStart && dateToString(tx.date) < currentMonthEnd
      );

      const spentByCategory: Record<string, number> = {};
      for (const tx of monthExpenses) {
        if (tx.category && tx.amountEur != null) {
          spentByCategory[tx.category] = (spentByCategory[tx.category] ?? 0) + Math.abs(tx.amountEur);
        }
      }

      const budgetLines = budgets.map((b) => {
        const spent = spentByCategory[b.category] ?? 0;
        const pct = b.amountEur > 0 ? Math.round((spent / b.amountEur) * 100) : 0;
        return `  ${b.category}: EUR ${spent.toFixed(0)} / EUR ${b.amountEur.toFixed(0)} (${pct}%)`;
      });
      parts.push(`Budget Progress (${currentMonth}):\n${budgetLines.join("\n")}`);
    }
  }

  // Daily log
  if (allowedSections.includes("daily_log")) {
    const dailyLogs = await prisma.dailyLog.findMany({
      where: { date: { gte: toDateOnly(fmtDate(fourteenDaysAgo)) }, userId: user.id },
      orderBy: { date: "desc" },
      take: 14,
    });
    if (dailyLogs.length > 0) {
      const logLines = dailyLogs.map((d) => {
        const items: string[] = [`  ${dateToString(d.date)}:`];
        if (d.level != null) items.push(`level=${d.level}`);
        if (d.moodDelta != null) items.push(`mood_delta=${d.moodDelta}`);
        if (d.energyLevel != null) items.push(`energy=${d.energyLevel}`);
        if (d.stressLevel != null) items.push(`stress=${d.stressLevel}`);
        if (d.focusQuality != null) items.push(`focus=${d.focusQuality}`);
        if (d.alcohol != null && d.alcohol > 0) items.push(`alcohol=${d.alcohol}`);
        if (d.kidsHours != null && d.kidsHours > 0) items.push(`kids=${d.kidsHours}h`);
        if (d.generalNote) items.push(`note="${d.generalNote}"`);
        return items.join(" ");
      });
      parts.push(`Daily Log (last 14 days):\n${logLines.join("\n")}`);
    }
  }

  // Garmin daily
  if (allowedSections.includes("garmin_daily")) {
    const garminDaily = await prisma.garminDaily.findMany({
      where: { userId: user.id, date: { gte: toDateOnly(fmtDate(fourteenDaysAgo)) } },
      orderBy: { date: "desc" },
      take: 14,
    });
    if (garminDaily.length > 0) {
      const gLines = garminDaily.map((g) => {
        const items: string[] = [`  ${dateToString(g.date)}:`];
        if (g.steps != null) items.push(`steps=${g.steps}`);
        if (g.sleepSeconds != null) items.push(`sleep=${(g.sleepSeconds / 3600).toFixed(1)}h`);
        if (g.restingHr != null) items.push(`restHR=${g.restingHr}`);
        if (g.avgStress != null) items.push(`stress=${g.avgStress}`);
        if (g.bodyBatteryHigh != null) items.push(`bodyBattery=${g.bodyBatteryLow}-${g.bodyBatteryHigh}`);
        if (g.sleepScore != null) items.push(`sleepScore=${g.sleepScore}`);
        if (g.caloriesTotal != null) items.push(`cal=${g.caloriesTotal}`);
        if (g.hrvLastNight != null) items.push(`hrv=${g.hrvLastNight}ms`);
        return items.join(" ");
      });
      parts.push(`Garmin Daily (last 14 days):\n${gLines.join("\n")}`);
    }
  }

  // Garmin sleep
  if (allowedSections.includes("garmin_sleep")) {
    const garminSleep = await prisma.garminSleep.findMany({
      where: { userId: user.id, date: { gte: toDateOnly(fmtDate(fourteenDaysAgo)) } },
      orderBy: { date: "desc" },
      take: 14,
    });
    if (garminSleep.length > 0) {
      const sLines = garminSleep.map((s) => {
        const hrs = s.durationSeconds ? (s.durationSeconds / 3600).toFixed(1) : "?";
        const items: string[] = [`  ${dateToString(s.date)}: ${hrs}h total`];
        if (s.deepSeconds) items.push(`deep=${(s.deepSeconds / 60).toFixed(0)}m`);
        if (s.remSeconds) items.push(`rem=${(s.remSeconds / 60).toFixed(0)}m`);
        if (s.sleepScore != null) items.push(`score=${s.sleepScore}`);
        return items.join(" ");
      });
      parts.push(`Sleep (last 14 days):\n${sLines.join("\n")}`);
    }
  }

  // Workouts
  if (allowedSections.includes("workouts")) {
    const workouts = await prisma.gymWorkout.findMany({
      where: { userId: user.id },
      orderBy: { date: "desc" },
      take: 5,
      include: {
        exercises: {
          include: {
            exercise: { select: { name: true } },
            sets: { select: { weightKg: true, reps: true } },
          },
        },
      },
    });
    if (workouts.length > 0) {
      const wLines = workouts.map((w) => {
        const exerciseCount = w.exercises.length;
        let totalVolume = 0;
        for (const ex of w.exercises) {
          for (const s of ex.sets) {
            totalVolume += (s.weightKg ?? 0) * (s.reps ?? 0);
          }
        }
        const items: string[] = [`  ${dateToString(w.date)}:`];
        if (w.workoutName) items.push(`"${w.workoutName}"`);
        items.push(`${exerciseCount} exercises`);
        if (totalVolume > 0) items.push(`volume=${totalVolume.toFixed(0)}kg`);
        if (w.durationMinutes) items.push(`${w.durationMinutes}min`);
        const exNames = w.exercises.map((e) => e.exercise.name).join(", ");
        if (exNames) items.push(`[${exNames}]`);
        return items.join(" ");
      });
      parts.push(`Last 5 Workouts:\n${wLines.join("\n")}`);
    }
  }

  // Food log
  if (allowedSections.includes("food_log")) {
    const foodLogs = await prisma.foodLog.findMany({
      where: { userId: user.id, date: { gte: toDateOnly(fmtDate(fourteenDaysAgo)) } },
      orderBy: { date: "desc" },
      select: { date: true, calories: true, proteinG: true, description: true },
    });
    if (foodLogs.length > 0) {
      const byDate: Record<string, { calories: number; protein: number; items: string[] }> = {};
      for (const fl of foodLogs) {
        if (!byDate[dateToString(fl.date)]) byDate[dateToString(fl.date)] = { calories: 0, protein: 0, items: [] };
        byDate[dateToString(fl.date)].calories += fl.calories ?? 0;
        byDate[dateToString(fl.date)].protein += fl.proteinG ?? 0;
        if (fl.description) byDate[dateToString(fl.date)].items.push(fl.description);
      }
      const dates = Object.keys(byDate).sort().reverse().slice(0, 7);
      const fLines = dates.map((d) => {
        const data = byDate[d];
        return `  ${d}: ${data.calories.toFixed(0)} kcal, ${data.protein.toFixed(0)}g protein`;
      });
      parts.push(`Food Log (last 7 days):\n${fLines.join("\n")}`);
    }
  }

  // Weight
  if (allowedSections.includes("weight")) {
    const latestWeight = await prisma.garminBodyComposition.findFirst({
      where: { userId: user.id },
      orderBy: { date: "desc" },
      select: { date: true, weight: true, bodyFatPct: true },
    });
    if (latestWeight) {
      const wItems = [`Latest weight (${latestWeight.date}): ${latestWeight.weight}kg`];
      if (latestWeight.bodyFatPct != null) wItems.push(`fat=${latestWeight.bodyFatPct}%`);
      parts.push(wItems.join(" "));
    }
  }

  // Trading (for investments page)
  if (allowedSections.includes("trading")) {
    try {
      const { getTradingOverview } = await import("@/actions/trading");
      const trading = await getTradingOverview();
      if (trading && !trading.error) {
        const tItems = [];
        if (trading.profit?.profit_all_coin != null) tItems.push(`Total P&L: ${trading.profit.profit_all_coin.toFixed(4)}`);
        if (trading.openTrades?.length) tItems.push(`Open trades: ${trading.openTrades.length}`);
        if (trading.profit?.winning_trades != null && trading.profit?.losing_trades != null) {
          const total = trading.profit.winning_trades + trading.profit.losing_trades;
          if (total > 0) tItems.push(`Win rate: ${((trading.profit.winning_trades / total) * 100).toFixed(1)}%`);
        }
        if (tItems.length > 0) parts.push(`Trading: ${tItems.join(", ")}`);
      }
    } catch (e) { console.error("[chat/getPageContext] Freqtrade context error:", e); }
  }

  if (parts.length === 0) return "";

  return `\n--- ${page} Context (${fmtDate(today)}) ---\n${parts.join("\n\n")}\n--- End Context ---\n`;
}

// ── From chat-history.ts ──

import type { UIMessage } from "ai";

export async function getChatHistory(limit = 50): Promise<UIMessage[]> {
  const user = await requireUser();

  const rows = await prisma.chatHistory.findMany({
    where: { userEmail: user.email },
    orderBy: { id: "asc" },
    take: limit,
  });

  return rows.map((m) => ({
    id: String(m.id),
    role: m.role as "user" | "assistant",
    content: m.content,
    parts: [{ type: "text" as const, text: m.content }],
  }));
}

export async function clearChatHistory() {
  const user = await requireUser();

  await prisma.chatHistory.deleteMany({
    where: { userEmail: user.email },
  });
}
