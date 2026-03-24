// Shared types and utilities for finance components

export type Transaction = {
  id: number;
  date: string;
  year: number | null;
  month: number | null;
  type: string | null;
  subType: string | null;
  account: string | null;
  category: string | null;
  amountOriginal: number | null;
  currencyOriginal: string | null;
  amountEur: number | null;
  nbuRateEurUsed: number | null;
  description: string | null;
  owner: string | null;
  externalId: string | null;
  source: string | null;
  createdAt: Date | null;
};

export type SummaryData = {
  totalIncome: number;
  totalExpenses: number;
  balance: number;
  savingsRate: number;
  byCategory: { category: string; total: number; count: number }[];
};

export type AccountData = {
  id: number;
  name: string;
  currency: string;
  isActive: boolean;
  sortOrder: number;
  initialBalance: number;
};

export type NbuRateData = {
  currencyCode: string;
  rate: number;
  date: string;
};

export type AccountBalanceData = {
  name: string;
  currency: string;
  balance: number;
};

export type WeeklyBudgetData = {
  monthlyLimit: number;
  mandatorySpent: number;
  discretionaryBudget: number;
  weeklyBudget: number;
  weeksRemaining: number;
  totalSpent: number;
  discretionarySpent: number;
  remaining: number;
} | null;

export type CategoryWithFav = { category: string; isFavourite: boolean };

export const CURRENCY_SYMBOL_TO_CODE: Record<string, string> = {
  "₴": "UAH",
  "$": "USD",
  "€": "EUR",
  "£": "GBP",
  "zł": "PLN",
  "Kč": "CZK",
};

export function normalizeCurrency(cur: string): string {
  if (!cur) return "EUR";
  const trimmed = cur.trim();
  if (trimmed.length === 3 && /^[A-Z]{3}$/.test(trimmed)) return trimmed;
  return CURRENCY_SYMBOL_TO_CODE[trimmed] ?? "EUR";
}

export function formatEur(n: number) {
  const formatted = new Intl.NumberFormat("en", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);
  return `EUR ${formatted}`;
}

export function formatAmount(n: number, currency: string = "EUR") {
  const code = normalizeCurrency(currency);
  const formatted = new Intl.NumberFormat("en", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);
  return `${code} ${formatted}`;
}

export function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
