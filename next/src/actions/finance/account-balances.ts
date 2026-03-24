"use server";

import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/current-user";
import { computeAccountBalances } from "./finance-utils";

// ---------- Account Balances ----------

export async function getAccountBalances() {
  const user = await requireUser();
  const accounts = await prisma.customAccount.findMany({
    where: { userId: user.id, isActive: true },
    orderBy: { sortOrder: "asc" },
  });

  // EUR balances: use amount_eur, grouped by account+type (matches Streamlit get_account_balances)
  const eurRows = await prisma.$queryRaw<
    { account: string; type: string; total: number }[]
  >`
    SELECT account, type, SUM(amount_eur) as total
    FROM transactions
    WHERE user_id = ${user.id}
      AND account IS NOT NULL AND account != ''
    GROUP BY account, type
  `;

  // UAH balances: use amount_original WHERE currency_original='UAH'
  const uahRows = await prisma.$queryRaw<
    { account: string; total: number }[]
  >`
    SELECT account,
      SUM(CASE WHEN type='INCOME' THEN amount_original ELSE -amount_original END) as total
    FROM transactions
    WHERE user_id = ${user.id}
      AND currency_original = 'UAH'
      AND type IN ('INCOME', 'EXPENSE')
    GROUP BY account
  `;

  return computeAccountBalances(accounts, eurRows, uahRows);
}
