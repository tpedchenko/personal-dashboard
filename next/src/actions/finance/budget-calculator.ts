"use server";

import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/current-user";
import { toDateOnly } from "@/lib/date-utils";

// ---------- Budget Auto-Calculator ----------

export async function getBudgetConfig() {
  const user = await requireUser();
  const config = await prisma.budgetConfig.findFirst({
    where: { userId: user.id },
    select: { id: true, limitType: true, limitValue: true },
  });
  if (!config) return null;
  return {
    id: config.id,
    limitType: config.limitType,
    limitValue: Number(config.limitValue),
  };
}

export async function saveBudgetConfig(limitType: string, limitValue: number) {
  const user = await requireUser();
  const existing = await prisma.budgetConfig.findFirst({ where: { userId: user.id } });
  if (existing) {
    await prisma.budgetConfig.update({
      where: { id: existing.id },
      data: { limitType, limitValue },
    });
  } else {
    await prisma.budgetConfig.create({
      data: { userId: user.id, limitType, limitValue },
    });
  }
}

export async function getMandatoryCategories() {
  const user = await requireUser();
  const cats = await prisma.mandatoryCategory.findMany({
    where: { userId: user.id },
    orderBy: { category: "asc" },
    select: { id: true, category: true },
  });
  return cats;
}

export async function addMandatoryCategory(category: string) {
  const user = await requireUser();
  return prisma.mandatoryCategory.create({
    data: { userId: user.id, category },
  });
}

export async function removeMandatoryCategory(id: number) {
  const user = await requireUser();
  await prisma.mandatoryCategory.delete({ where: { id, userId: user.id } });
}

export async function getMandatoryCategorySpending(period: string) {
  const user = await requireUser();
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth(); // 0-based

  let dateFrom = "";
  let dateTo = "";
  let divideBy = 1;

  if (period === "this_month") {
    dateFrom = `${year}-${String(month + 1).padStart(2, "0")}-01`;
    const lastDay = new Date(year, month + 1, 0).getDate();
    dateTo = `${year}-${String(month + 1).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
    divideBy = 1;
  } else if (period === "last_month") {
    const lm = month === 0 ? 12 : month;
    const ly = month === 0 ? year - 1 : year;
    dateFrom = `${ly}-${String(lm).padStart(2, "0")}-01`;
    const lastDay = new Date(ly, lm, 0).getDate();
    dateTo = `${ly}-${String(lm).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
    divideBy = 1;
  } else if (period === "this_year") {
    dateFrom = `${year}-01-01`;
    dateTo = `${year}-12-31`;
    divideBy = month + 1; // months elapsed so far
  } else if (period === "last_year") {
    dateFrom = `${year - 1}-01-01`;
    dateTo = `${year - 1}-12-31`;
    divideBy = 12;
  }

  // Get mandatory categories
  const mandatoryCats = await prisma.mandatoryCategory.findMany({ where: { userId: user.id } });
  const catNames = mandatoryCats.map((mc) => mc.category);

  if (catNames.length === 0) return [];

  // Get spending per category (including subcategories with " / " separator)
  const categoryFilter = catNames.flatMap((cat) => [
    { category: cat },
    { category: { startsWith: `${cat} / ` } },
  ]);

  const result = await prisma.transaction.groupBy({
    by: ["category"],
    where: {
      userId: user.id,
      type: "EXPENSE",
      NOT: { subType: "TRANSFER" },
      OR: categoryFilter,
      date: { gte: toDateOnly(dateFrom), lte: toDateOnly(dateTo) },
    },
    _sum: { amountEur: true },
  });

  // Aggregate subcategories into parent categories
  return catNames.map((cat) => {
    const matching = result.filter(
      (r) => r.category === cat || (r.category?.startsWith(`${cat} / `) ?? false)
    );
    const totalSpent = matching.reduce(
      (sum, r) => sum + Math.abs(Number(r._sum?.amountEur ?? 0)),
      0
    );
    return {
      category: cat,
      totalSpent,
      monthlyAvg: divideBy > 0 ? Math.round((totalSpent / divideBy) * 100) / 100 : totalSpent,
      period,
    };
  });
}

export async function calculateWeeklyBudget(mandatoryPeriod: string = "last_month") {
  const user = await requireUser();
  const config = await prisma.budgetConfig.findFirst({ where: { userId: user.id } });
  if (!config) return null;

  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth(); // 0-based
  const firstOfMonth = `${year}-${String(month + 1).padStart(2, "0")}-01`;
  const lastOfMonth = new Date(year, month + 1, 0);
  const today = `${year}-${String(month + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

  // Run independent queries in parallel
  const incomeAggPromise = config.limitType !== "fixed"
    ? prisma.transaction.aggregate({
        where: {
          userId: user.id,
          type: "INCOME",
          NOT: { subType: "TRANSFER" },
          ...(config.limitType === "pct_current_income"
            ? { date: { gte: toDateOnly(firstOfMonth), lte: toDateOnly(today) } }
            : {}),
        },
        _sum: { amountEur: true },
      })
    : null;

  const [incomeAgg, catSpending, mandatoryCats, totalAgg] = await Promise.all([
    incomeAggPromise,
    getMandatoryCategorySpending(mandatoryPeriod),
    prisma.mandatoryCategory.findMany({ where: { userId: user.id } }),
    prisma.transaction.aggregate({
      where: {
        userId: user.id,
        type: "EXPENSE",
        NOT: { subType: "TRANSFER" },
        date: { gte: toDateOnly(firstOfMonth), lte: toDateOnly(today) },
      },
      _sum: { amountEur: true },
    }),
  ]);

  // Calculate monthly limit
  let monthlyLimit = 0;
  if (config.limitType === "fixed") {
    monthlyLimit = config.limitValue;
  } else {
    const totalIncome = Number(incomeAgg!._sum.amountEur ?? 0);
    if (config.limitType === "pct_avg_income") {
      monthlyLimit = (totalIncome / 12) * (config.limitValue / 100);
    } else {
      monthlyLimit = totalIncome * (config.limitValue / 100);
    }
  }

  const mandatoryAvg = catSpending.reduce((sum, cs) => sum + cs.monthlyAvg, 0);
  const mandatoryCatNames = mandatoryCats.map((mc) => mc.category);

  // Mandatory spending this month (depends on mandatoryCatNames)
  let mandatorySpentThisMonth = 0;
  if (mandatoryCatNames.length > 0) {
    const mandCatFilter = mandatoryCatNames.flatMap((cat) => [
      { category: cat },
      { category: { startsWith: `${cat} / ` } },
    ]);
    const mandAgg = await prisma.transaction.aggregate({
      where: {
        userId: user.id,
        type: "EXPENSE",
        NOT: { subType: "TRANSFER" },
        OR: mandCatFilter,
        date: { gte: toDateOnly(firstOfMonth), lte: toDateOnly(today) },
      },
      _sum: { amountEur: true },
    });
    mandatorySpentThisMonth = Math.abs(Number(mandAgg._sum.amountEur ?? 0));
  }

  const totalSpent = Math.abs(Number(totalAgg._sum.amountEur ?? 0));
  const discretionarySpent = totalSpent - mandatorySpentThisMonth;

  // Weeks remaining
  const daysInMonth = lastOfMonth.getDate();
  const daysRemaining = daysInMonth - now.getDate() + 1;
  const weeksRemaining = Math.max(1, daysRemaining / 7);

  // Use mandatory average (from selected period) for budget planning
  const discretionaryBudget = Math.max(0, monthlyLimit - mandatoryAvg);
  const weeklyBudget = discretionaryBudget / weeksRemaining;
  const remaining = discretionaryBudget - discretionarySpent;

  return {
    monthlyLimit,
    mandatorySpent: mandatoryAvg,
    discretionaryBudget,
    weeklyBudget,
    weeksRemaining: Math.round(weeksRemaining * 10) / 10,
    totalSpent,
    discretionarySpent,
    remaining,
  };
}
