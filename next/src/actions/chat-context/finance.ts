"use server";

import { prisma } from "@/lib/db";
import { toDateOnly, dateToString } from "@/lib/date-utils";

/**
 * Build finance context sections: transactions, account balances, budget progress, finance summary.
 */
export async function buildFinanceContext(
  userId: number,
  allowedSections: string[],
  today: Date,
  fourteenDaysAgo: Date,
  thirtyDaysAgo: Date,
): Promise<string[]> {
  const fmtDate = (d: Date) => d.toISOString().slice(0, 10);
  const currentMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`;
  const parts: string[] = [];

  const needsTransactions =
    allowedSections.includes("transactions") ||
    allowedSections.includes("finance_summary") ||
    allowedSections.includes("budget_progress");

  const [transactions, accountBalances, budgets] = await Promise.all([
    needsTransactions
      ? prisma.transaction.findMany({
          where: { userId },
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
          where: { userId },
          _sum: { amountEur: true },
        })
      : Promise.resolve([]),
    allowedSections.includes("budget_progress")
      ? prisma.budget.findMany({
          where: { userId, active: true },
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

  // Budget progress — query ALL current month expenses (not just the 50 recent ones)
  if (allowedSections.includes("budget_progress") && budgets.length > 0) {
    const firstDayOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);

    const currentMonthExpenses = await prisma.transaction.findMany({
      where: {
        userId,
        type: "EXPENSE",
        date: { gte: toDateOnly(fmtDate(firstDayOfMonth)) },
      },
      select: { category: true, amountEur: true },
    });

    const spentByCategory: Record<string, number> = {};
    for (const tx of currentMonthExpenses) {
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

  // Trading context
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
    } catch (e) { console.error("[chat/context] Freqtrade context error:", e); }
  }

  return parts;
}
