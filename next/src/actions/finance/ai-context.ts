"use server";

import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/current-user";
import { toDateOnly, dateToString } from "@/lib/date-utils";

// ---------- AI Context Snapshot ----------

export async function saveFinanceContext(month?: string) {
  const user = await requireUser();
  const now = new Date();
  const y = month ? parseInt(month.split("-")[0]) : now.getFullYear();
  const m = month ? parseInt(month.split("-")[1]) : now.getMonth() + 1;
  const periodKey = `${y}-${String(m).padStart(2, "0")}`;

  const dateFrom = `${y}-${String(m).padStart(2, "0")}-01`;
  const nextM = m === 12 ? 1 : m + 1;
  const nextY = m === 12 ? y + 1 : y;
  const dateTo = `${nextY}-${String(nextM).padStart(2, "0")}-01`;

  const transactions = await prisma.transaction.findMany({
    where: { userId: user.id, date: { gte: toDateOnly(dateFrom), lt: toDateOnly(dateTo) } },
    orderBy: { date: "desc" },
  });

  let totalIncome = 0;
  let totalExpenses = 0;
  const categoryMap = new Map<string, number>();

  for (const tx of transactions) {
    const amt = tx.amountEur ?? 0;
    if (tx.type === "INCOME") totalIncome += amt;
    if (tx.type === "EXPENSE") {
      totalExpenses += Math.abs(amt);
      if (tx.category) {
        categoryMap.set(tx.category, (categoryMap.get(tx.category) ?? 0) + Math.abs(amt));
      }
    }
  }

  const topCategories = Array.from(categoryMap.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([cat, total]) => `  - ${cat}: ${total.toFixed(2)} EUR`)
    .join("\n");

  const recentTx = transactions
    .slice(0, 10)
    .map(
      (tx) =>
        `  - ${dateToString(tx.date)} | ${tx.type} | ${tx.category ?? "—"} | ${(tx.amountEur ?? 0).toFixed(2)} EUR | ${tx.description ?? ""}`,
    )
    .join("\n");

  const balance = totalIncome - totalExpenses;
  const savingsRate = totalIncome > 0 ? ((balance / totalIncome) * 100).toFixed(1) : "0";

  const content = [
    `Finance Context for ${periodKey}`,
    `Total Income: ${totalIncome.toFixed(2)} EUR`,
    `Total Expenses: ${totalExpenses.toFixed(2)} EUR`,
    `Balance: ${balance.toFixed(2)} EUR`,
    `Savings Rate: ${savingsRate}%`,
    `Transactions count: ${transactions.length}`,
    ``,
    `Top expense categories:`,
    topCategories || "  (none)",
    ``,
    `Recent transactions:`,
    recentTx || "  (none)",
  ].join("\n");

  await prisma.aiContextSnapshot.upsert({
    where: {
      userId_periodType_periodKey_domain: {
        userId: user.id,
        periodType: "month",
        periodKey,
        domain: "finance",
      },
    },
    update: {
      content,
      generatedAt: new Date(),
      userId: user.id,
    },
    create: {
      periodType: "month",
      periodKey,
      domain: "finance",
      content,
      userId: user.id,
    },
  });
}

