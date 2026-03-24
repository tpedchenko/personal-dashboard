import { describe, it, expect } from "vitest";

import {
  computeFinanceSummary,
  computeAccountBalances,
  computeWeeklyBudget,
  type TransactionRow,
  type CategoryBudget,
  type AccountDef,
  type EurRow,
  type UahRow,
} from "./finance-utils";

// ---------------------------------------------------------------------------
// computeFinanceSummary
// ---------------------------------------------------------------------------

describe("computeFinanceSummary", () => {
  it("computes totalIncome as sum of INCOME amountEur (excluding transfers)", () => {
    const txs: TransactionRow[] = [
      { type: "INCOME", amountEur: 3000 },
      { type: "INCOME", amountEur: 500 },
      { type: "INCOME", subType: "TRANSFER", amountEur: 1000 },
    ];
    const result = computeFinanceSummary(txs, []);
    expect(result.totalIncome).toBe(3500);
  });

  it("computes totalExpenses as sum of abs(amountEur) for EXPENSE (excluding transfers)", () => {
    const txs: TransactionRow[] = [
      { type: "EXPENSE", amountEur: -200, category: "Food" },
      { type: "EXPENSE", amountEur: -100, category: "Transport" },
      { type: "EXPENSE", subType: "TRANSFER", amountEur: -500 },
    ];
    const result = computeFinanceSummary(txs, []);
    expect(result.totalExpenses).toBe(300);
  });

  it("computes balance = totalIncome - totalExpenses", () => {
    const txs: TransactionRow[] = [
      { type: "INCOME", amountEur: 5000 },
      { type: "EXPENSE", amountEur: -1200, category: "Rent" },
    ];
    const result = computeFinanceSummary(txs, []);
    expect(result.balance).toBe(3800);
  });

  it("computes savingsRate = (balance / totalIncome) * 100", () => {
    const txs: TransactionRow[] = [
      { type: "INCOME", amountEur: 4000 },
      { type: "EXPENSE", amountEur: -1000, category: "Food" },
    ];
    const result = computeFinanceSummary(txs, []);
    expect(result.savingsRate).toBe(75);
  });

  it("returns savingsRate 0 when no income", () => {
    const txs: TransactionRow[] = [
      { type: "EXPENSE", amountEur: -500, category: "Food" },
    ];
    const result = computeFinanceSummary(txs, []);
    expect(result.savingsRate).toBe(0);
  });

  it("returns empty byCategory when no expenses", () => {
    const txs: TransactionRow[] = [
      { type: "INCOME", amountEur: 3000 },
    ];
    const result = computeFinanceSummary(txs, []);
    expect(result.byCategory).toEqual([]);
  });

  it("aggregates subcategories into parent categories", () => {
    const txs: TransactionRow[] = [
      { type: "EXPENSE", amountEur: -50, category: "Food / groceries" },
      { type: "EXPENSE", amountEur: -30, category: "Food / restaurants" },
      { type: "EXPENSE", amountEur: -20, category: "Food" },
    ];
    const result = computeFinanceSummary(txs, []);
    expect(result.byCategory).toHaveLength(1);
    expect(result.byCategory[0].category).toBe("Food");
    expect(result.byCategory[0].total).toBe(100);
    expect(result.byCategory[0].count).toBe(3);
  });

  it("attaches budget to matching category", () => {
    const txs: TransactionRow[] = [
      { type: "EXPENSE", amountEur: -200, category: "Food" },
    ];
    const budgets: CategoryBudget[] = [
      { category: "Food", amountEur: 400 },
      { category: "Transport", amountEur: 100 },
    ];
    const result = computeFinanceSummary(txs, budgets);
    const food = result.byCategory.find((c) => c.category === "Food");
    expect(food?.budget).toBe(400);
  });

  it("sets budget to null when no budget configured for category", () => {
    const txs: TransactionRow[] = [
      { type: "EXPENSE", amountEur: -100, category: "Entertainment" },
    ];
    const result = computeFinanceSummary(txs, []);
    expect(result.byCategory[0].budget).toBeNull();
  });

  it("sorts byCategory descending by total", () => {
    const txs: TransactionRow[] = [
      { type: "EXPENSE", amountEur: -50, category: "A" },
      { type: "EXPENSE", amountEur: -200, category: "B" },
      { type: "EXPENSE", amountEur: -100, category: "C" },
    ];
    const result = computeFinanceSummary(txs, []);
    expect(result.byCategory.map((c) => c.category)).toEqual(["B", "C", "A"]);
  });

  it("handles empty transactions list", () => {
    const result = computeFinanceSummary([], []);
    expect(result.totalIncome).toBe(0);
    expect(result.totalExpenses).toBe(0);
    expect(result.balance).toBe(0);
    expect(result.savingsRate).toBe(0);
    expect(result.byCategory).toEqual([]);
  });

  it("treats null amountEur as 0", () => {
    const txs: TransactionRow[] = [
      { type: "INCOME", amountEur: null },
      { type: "EXPENSE", amountEur: null, category: "X" },
    ];
    const result = computeFinanceSummary(txs, []);
    expect(result.totalIncome).toBe(0);
    expect(result.totalExpenses).toBe(0);
  });

  it("ignores expenses without category for byCategory aggregation", () => {
    const txs: TransactionRow[] = [
      { type: "EXPENSE", amountEur: -100 },
      { type: "EXPENSE", amountEur: -50, category: "Food" },
    ];
    const result = computeFinanceSummary(txs, []);
    expect(result.totalExpenses).toBe(150);
    expect(result.byCategory).toHaveLength(1);
    expect(result.byCategory[0].total).toBe(50);
  });
});

// ---------------------------------------------------------------------------
// computeAccountBalances
// ---------------------------------------------------------------------------

describe("computeAccountBalances", () => {
  it("computes EUR balance = initialBalance + income - expenses", () => {
    const accounts: AccountDef[] = [
      { name: "Main", currency: "EUR", initialBalance: 1000 },
    ];
    const eurRows: EurRow[] = [
      { account: "Main", type: "INCOME", total: 500 },
      { account: "Main", type: "EXPENSE", total: 200 },
    ];
    const result = computeAccountBalances(accounts, eurRows, []);
    expect(result).toEqual([{ name: "Main", currency: "EUR", balance: 1300 }]);
  });

  it("computes UAH balance = initialBalance + net from uahRows", () => {
    const accounts: AccountDef[] = [
      { name: "Mono", currency: "UAH", initialBalance: 5000 },
    ];
    const uahRows: UahRow[] = [
      { account: "Mono", total: 1200 },
    ];
    const result = computeAccountBalances(accounts, [], uahRows);
    expect(result).toEqual([{ name: "Mono", currency: "UAH", balance: 6200 }]);
  });

  it("uses UAH balance (not EUR) for UAH-currency account", () => {
    const accounts: AccountDef[] = [
      { name: "Mono", currency: "UAH", initialBalance: 5000 },
    ];
    const eurRows: EurRow[] = [
      { account: "Mono", type: "INCOME", total: 100 },
    ];
    // Even though eurRows mention "Mono", for a UAH account the balance comes from uahBalances
    const result = computeAccountBalances(accounts, eurRows, []);
    expect(result[0].balance).toBe(5000); // initialBalance from UAH map, eurRows ignored
  });

  it("handles accounts with zero initialBalance (EUR)", () => {
    const accounts: AccountDef[] = [
      { name: "Card", currency: "EUR", initialBalance: 0 },
    ];
    const eurRows: EurRow[] = [
      { account: "Card", type: "INCOME", total: 300 },
    ];
    const result = computeAccountBalances(accounts, eurRows, []);
    expect(result[0].balance).toBe(300);
  });

  it("handles accounts with zero initialBalance (UAH)", () => {
    const accounts: AccountDef[] = [
      { name: "Cash", currency: "UAH", initialBalance: 0 },
    ];
    const uahRows: UahRow[] = [
      { account: "Cash", total: 800 },
    ];
    const result = computeAccountBalances(accounts, [], uahRows);
    expect(result[0].balance).toBe(800);
  });

  it("returns balances in account order", () => {
    const accounts: AccountDef[] = [
      { name: "A", currency: "EUR", initialBalance: 100 },
      { name: "B", currency: "UAH", initialBalance: 200 },
      { name: "C", currency: "EUR", initialBalance: 300 },
    ];
    const result = computeAccountBalances(accounts, [], []);
    expect(result.map((b) => b.name)).toEqual(["A", "B", "C"]);
  });

  it("handles multiple EUR accounts with mixed transactions", () => {
    const accounts: AccountDef[] = [
      { name: "Savings", currency: "EUR", initialBalance: 5000 },
      { name: "Current", currency: "EUR", initialBalance: 1000 },
    ];
    const eurRows: EurRow[] = [
      { account: "Savings", type: "INCOME", total: 1000 },
      { account: "Current", type: "EXPENSE", total: 400 },
      { account: "Current", type: "INCOME", total: 200 },
    ];
    const result = computeAccountBalances(accounts, eurRows, []);
    expect(result[0].balance).toBe(6000); // 5000 + 1000
    expect(result[1].balance).toBe(800); // 1000 + 200 - 400
  });

  it("returns 0 for accounts with no transactions and zero initial balance", () => {
    const accounts: AccountDef[] = [
      { name: "Empty", currency: "EUR", initialBalance: 0 },
    ];
    const result = computeAccountBalances(accounts, [], []);
    expect(result[0].balance).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// computeWeeklyBudget
// ---------------------------------------------------------------------------

describe("computeWeeklyBudget", () => {
  it("returns null when monthlyLimit is 0", () => {
    const result = computeWeeklyBudget({
      monthlyLimit: 0,
      mandatoryTotal: 0,
      mandatoryCategories: [],
      transactions: [],
      daysInMonth: 31,
      currentDay: 15,
    });
    expect(result).toBeNull();
  });

  it("computes discretionaryBudget = monthlyLimit - mandatoryTotal", () => {
    const result = computeWeeklyBudget({
      monthlyLimit: 3000,
      mandatoryTotal: 1200,
      mandatoryCategories: [],
      transactions: [],
      daysInMonth: 30,
      currentDay: 1,
    });
    expect(result!.discretionaryBudget).toBe(1800);
  });

  it("classifies mandatory vs discretionary spending", () => {
    const txs: TransactionRow[] = [
      { type: "EXPENSE", amountEur: -500, category: "Rent" },
      { type: "EXPENSE", amountEur: -100, category: "Fun" },
      { type: "EXPENSE", amountEur: -200, category: "Insurance" },
    ];
    const result = computeWeeklyBudget({
      monthlyLimit: 3000,
      mandatoryTotal: 1000,
      mandatoryCategories: ["Rent", "Insurance"],
      transactions: txs,
      daysInMonth: 30,
      currentDay: 15,
    });
    expect(result!.mandatorySpent).toBe(700);
    expect(result!.discretionarySpent).toBe(100);
  });

  it("skips TRANSFER transactions", () => {
    const txs: TransactionRow[] = [
      { type: "EXPENSE", amountEur: -100, category: "Food", subType: "TRANSFER" },
      { type: "EXPENSE", amountEur: -50, category: "Food" },
    ];
    const result = computeWeeklyBudget({
      monthlyLimit: 1000,
      mandatoryTotal: 0,
      mandatoryCategories: [],
      transactions: txs,
      daysInMonth: 30,
      currentDay: 1,
    });
    expect(result!.discretionarySpent).toBe(50);
  });

  it("computes discretionaryRemaining correctly", () => {
    const txs: TransactionRow[] = [
      { type: "EXPENSE", amountEur: -300, category: "Fun" },
    ];
    const result = computeWeeklyBudget({
      monthlyLimit: 2000,
      mandatoryTotal: 800,
      mandatoryCategories: ["Rent"],
      transactions: txs,
      daysInMonth: 30,
      currentDay: 1,
    });
    // discretionaryBudget = 2000 - 800 = 1200
    // discretionaryRemaining = 1200 - 300 = 900
    expect(result!.discretionaryRemaining).toBe(900);
  });

  it("computes weeklyAvailable = discretionaryRemaining / weeksRemaining", () => {
    const result = computeWeeklyBudget({
      monthlyLimit: 2000,
      mandatoryTotal: 600,
      mandatoryCategories: [],
      transactions: [],
      daysInMonth: 28,
      currentDay: 1,
    });
    // discretionaryBudget = 1400, discretionaryRemaining = 1400
    // daysRemaining = 28, weeksRemaining = 4
    // weeklyAvailable = 1400 / 4 = 350
    expect(result!.weeklyAvailable).toBe(350);
    expect(result!.weeksRemaining).toBe(4);
  });

  it("computes dailyAvailable = discretionaryRemaining / daysRemaining", () => {
    const result = computeWeeklyBudget({
      monthlyLimit: 3000,
      mandatoryTotal: 1000,
      mandatoryCategories: [],
      transactions: [],
      daysInMonth: 30,
      currentDay: 21,
    });
    // discretionaryRemaining = 2000, daysRemaining = 10
    // dailyAvailable = 200
    expect(result!.dailyAvailable).toBe(200);
    expect(result!.daysRemaining).toBe(10);
  });

  it("enforces minimum 1 day remaining", () => {
    const result = computeWeeklyBudget({
      monthlyLimit: 1000,
      mandatoryTotal: 0,
      mandatoryCategories: [],
      transactions: [],
      daysInMonth: 30,
      currentDay: 31, // past end of month
    });
    expect(result!.daysRemaining).toBe(1);
  });

  it("enforces minimum 0.5 weeks remaining", () => {
    const result = computeWeeklyBudget({
      monthlyLimit: 1000,
      mandatoryTotal: 0,
      mandatoryCategories: [],
      transactions: [],
      daysInMonth: 30,
      currentDay: 30, // last day, daysRemaining=1, weeksRemaining=max(1/7, 0.5)=0.5
    });
    expect(result!.weeksRemaining).toBe(0.5);
  });

  it("rounds weeklyAvailable and dailyAvailable to 2 decimal places", () => {
    const result = computeWeeklyBudget({
      monthlyLimit: 1000,
      mandatoryTotal: 333,
      mandatoryCategories: [],
      transactions: [],
      daysInMonth: 31,
      currentDay: 1,
    });
    // discretionaryRemaining = 667, daysRemaining = 31
    const dailyStr = result!.dailyAvailable.toString();
    const decimalPlaces = dailyStr.split(".")[1]?.length ?? 0;
    expect(decimalPlaces).toBeLessThanOrEqual(2);
  });

  it("can produce negative discretionaryRemaining when overspent", () => {
    const txs: TransactionRow[] = [
      { type: "EXPENSE", amountEur: -2000, category: "Shopping" },
    ];
    const result = computeWeeklyBudget({
      monthlyLimit: 1500,
      mandatoryTotal: 500,
      mandatoryCategories: [],
      transactions: txs,
      daysInMonth: 30,
      currentDay: 20,
    });
    // discretionaryBudget = 1000, discretionaryRemaining = 1000 - 2000 = -1000
    expect(result!.discretionaryRemaining).toBe(-1000);
    expect(result!.weeklyAvailable).toBeLessThan(0);
    expect(result!.dailyAvailable).toBeLessThan(0);
  });
});
