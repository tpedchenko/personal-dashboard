// Pure calculation functions extracted from finance server actions.
// These have no DB or auth dependencies and are fully unit-testable.

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TransactionRow {
  type: string | null;
  subType?: string | null;
  category?: string | null;
  amountEur?: number | null;
}

export interface CategoryBudget {
  category: string;
  amountEur: number;
}

export interface CategoryEntry {
  category: string;
  total: number;
  count: number;
  budget: number | null;
}

export interface FinanceSummaryResult {
  totalIncome: number;
  totalExpenses: number;
  balance: number;
  savingsRate: number;
  byCategory: CategoryEntry[];
}

// ---------------------------------------------------------------------------
// getFinanceSummary – pure calculation
// ---------------------------------------------------------------------------

export function computeFinanceSummary(
  transactions: TransactionRow[],
  budgets: CategoryBudget[],
): FinanceSummaryResult {
  let totalIncome = 0;
  let totalExpenses = 0;
  const categoryMap = new Map<string, { total: number; count: number }>();

  for (const tx of transactions) {
    const amt = tx.amountEur ?? 0;
    if (tx.type === "INCOME" && tx.subType !== "TRANSFER") totalIncome += amt;
    if (tx.type === "EXPENSE" && tx.subType !== "TRANSFER") totalExpenses += Math.abs(amt);
    if (tx.type === "EXPENSE" && tx.subType !== "TRANSFER" && tx.category) {
      const entry = categoryMap.get(tx.category) ?? { total: 0, count: 0 };
      entry.total += Math.abs(amt);
      entry.count += 1;
      categoryMap.set(tx.category, entry);
    }
  }

  const balance = totalIncome - totalExpenses;
  const savingsRate = totalIncome > 0 ? (balance / totalIncome) * 100 : 0;

  // Aggregate subcategories into parent categories
  const parentCategoryMap = new Map<string, { total: number; count: number }>();
  for (const [cat, data] of categoryMap.entries()) {
    const parentCat = cat.includes(" / ") ? cat.split(" / ")[0] : cat;
    const entry = parentCategoryMap.get(parentCat) ?? { total: 0, count: 0 };
    entry.total += data.total;
    entry.count += data.count;
    parentCategoryMap.set(parentCat, entry);
  }

  const budgetMap = new Map<string, number>();
  for (const b of budgets) {
    budgetMap.set(b.category, b.amountEur);
  }

  const byCategory = Array.from(parentCategoryMap.entries())
    .map(([category, { total, count }]) => ({
      category,
      total,
      count,
      budget: budgetMap.get(category) ?? null,
    }))
    .sort((a, b) => b.total - a.total);

  return { totalIncome, totalExpenses, balance, savingsRate, byCategory };
}

// ---------------------------------------------------------------------------
// getAccountBalances – pure calculation
// ---------------------------------------------------------------------------

export interface AccountDef {
  name: string;
  currency: string;
  initialBalance: number;
}

export interface EurRow {
  account: string;
  type: string;
  total: number;
}

export interface UahRow {
  account: string;
  total: number;
}

export interface AccountBalance {
  name: string;
  currency: string;
  balance: number;
}

export function computeAccountBalances(
  accounts: AccountDef[],
  eurRows: EurRow[],
  uahRows: UahRow[],
): AccountBalance[] {
  // Build EUR balances map
  const eurBalances: Record<string, number> = {};
  for (const acc of accounts) {
    if (acc.currency !== "UAH" && acc.initialBalance !== 0) {
      eurBalances[acc.name] = acc.initialBalance;
    }
  }
  for (const row of eurRows) {
    if (!(row.account in eurBalances)) {
      eurBalances[row.account] = 0;
    }
    const total = Number(row.total) || 0;
    if (row.type === "INCOME") eurBalances[row.account] += total;
    else if (row.type === "EXPENSE") eurBalances[row.account] -= total;
  }

  // Build UAH balances map
  const uahBalances: Record<string, number> = {};
  for (const acc of accounts) {
    if (acc.currency === "UAH" && acc.initialBalance !== 0) {
      uahBalances[acc.name] = acc.initialBalance;
    }
  }
  for (const row of uahRows) {
    const total = Number(row.total) || 0;
    if (row.account in uahBalances) {
      uahBalances[row.account] += total;
    } else {
      uahBalances[row.account] = total;
    }
  }

  // Combine into result
  const balances: AccountBalance[] = [];
  for (const acc of accounts) {
    const isUah = acc.currency === "UAH";
    const balance = isUah
      ? (uahBalances[acc.name] ?? 0)
      : (eurBalances[acc.name] ?? 0);
    balances.push({ name: acc.name, currency: acc.currency, balance });
  }

  return balances;
}

// ---------------------------------------------------------------------------
// getWeeklyBudget – pure calculation
// ---------------------------------------------------------------------------

export interface WeeklyBudgetInput {
  monthlyLimit: number;
  mandatoryTotal: number;
  mandatoryCategories: string[];
  transactions: TransactionRow[];
  daysInMonth: number;
  currentDay: number;
}

export interface WeeklyBudgetResult {
  monthlyLimit: number;
  mandatoryTotal: number;
  mandatorySpent: number;
  discretionaryBudget: number;
  discretionarySpent: number;
  discretionaryRemaining: number;
  weeksRemaining: number;
  weeklyAvailable: number;
  dailyAvailable: number;
  daysRemaining: number;
}

export function computeWeeklyBudget(
  input: WeeklyBudgetInput,
): WeeklyBudgetResult | null {
  const {
    monthlyLimit,
    mandatoryTotal,
    mandatoryCategories,
    transactions,
    daysInMonth,
    currentDay,
  } = input;

  if (monthlyLimit === 0) return null;

  let mandatorySpent = 0;
  let discretionarySpent = 0;
  for (const tx of transactions) {
    const amt = Math.abs(tx.amountEur ?? 0);
    if (tx.subType === "TRANSFER") continue;
    if (tx.category && mandatoryCategories.includes(tx.category)) {
      mandatorySpent += amt;
    } else {
      discretionarySpent += amt;
    }
  }

  const daysRemaining = Math.max(daysInMonth - currentDay + 1, 1);
  const weeksRemaining = Math.max(daysRemaining / 7, 0.5);

  const discretionaryBudget = monthlyLimit - mandatoryTotal;
  const discretionaryRemaining = discretionaryBudget - discretionarySpent;
  const weeklyAvailable = discretionaryRemaining / weeksRemaining;
  const dailyAvailable = discretionaryRemaining / daysRemaining;

  return {
    monthlyLimit,
    mandatoryTotal,
    mandatorySpent,
    discretionaryBudget,
    discretionarySpent,
    discretionaryRemaining,
    weeksRemaining: Math.round(weeksRemaining * 10) / 10,
    weeklyAvailable: Math.round(weeklyAvailable * 100) / 100,
    dailyAvailable: Math.round(dailyAvailable * 100) / 100,
    daysRemaining,
  };
}
