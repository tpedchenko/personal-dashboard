"use server";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/current-user";
import { getAccountBalances } from "./account-balances";
import { getInvestmentsSummary } from "@/actions/brokers-common";
import { toDateOnly, dateToString } from "@/lib/date-utils";

export async function savePortfolioSnapshot() {
  const user = await requireUser();
  const today = new Date().toISOString().slice(0, 10);

  const [balances, portfolio] = await Promise.all([
    getAccountBalances(),
    getInvestmentsSummary().catch(() => null),
  ]);

  const cashEur = balances.filter(b => b.currency === "EUR").reduce((s, b) => s + b.balance, 0);
  const investedEur = portfolio?.totalPortfolio ?? 0;
  const totalNav = Math.round((cashEur + investedEur) * 100) / 100;
  const totalPnl = Math.round((portfolio?.totalPnl ?? 0) * 100) / 100;

  await prisma.portfolioSnapshot.upsert({
    where: { userId_date: { userId: user.id, date: toDateOnly(today) } },
    create: { userId: user.id, date: toDateOnly(today), totalNav, totalPnl, cashEur: Math.round(cashEur * 100) / 100, investedEur: Math.round(investedEur * 100) / 100 },
    update: { totalNav, totalPnl, cashEur: Math.round(cashEur * 100) / 100, investedEur: Math.round(investedEur * 100) / 100 },
  });

  return { date: today, totalNav, totalPnl };
}

export async function getPortfolioHistory(days: number = 90) {
  const user = await requireUser();
  const from = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);

  const rows = await prisma.portfolioSnapshot.findMany({
    where: { userId: user.id, date: { gte: toDateOnly(from) } },
    orderBy: { date: "asc" },
    select: { date: true, totalNav: true, totalPnl: true, cashEur: true, investedEur: true },
  });
  return rows.map(r => ({ ...r, date: dateToString(r.date) }));
}
