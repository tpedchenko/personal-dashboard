import {
  getTransactions,
  getFinanceSummary,
  getAccounts,
  getCategories,
  getCategoriesWithFavourites,
  getNbuRates,
  getAccountBalances,
  calculateWeeklyBudget,
  saveFinanceContext,
  processRecurringTransactions,
} from "@/actions/finance";
import { FinancePage } from "@/components/finance/finance-page";
import { FirstVisitBanner } from "@/components/shared/first-visit-banner";
import { InsightsPanel } from "@/components/insights/insights-panel";
import { ModuleGate } from "@/components/shared/module-gate";

function currentMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export default async function FinancePageRoute() {
  await processRecurringTransactions().catch(() => {});

  const month = currentMonth();
  const dateFrom = month + "-01";
  const today = new Date().toISOString().slice(0, 10);

  const [txResult, summary, accounts, categories, categoriesWithFavs, nbuRates, accountBalances, weeklyBudget] =
    await Promise.all([
      getTransactions({ dateFrom, limit: 20, offset: 0, type: "EXPENSE" }),
      getFinanceSummary(month),
      getAccounts(),
      getCategories(),
      getCategoriesWithFavourites(),
      getNbuRates(today),
      getAccountBalances(),
      calculateWeeklyBudget(),
    ]);

  saveFinanceContext(month).catch(() => {});

  return (
    <ModuleGate moduleKey="finance">
    <FirstVisitBanner moduleKey="Finance" />
    <FinancePage
      initialTransactions={txResult.transactions}
      initialCount={txResult.count}
      initialSummary={summary}
      initialAccounts={accounts}
      initialCategories={categories}
      initialCategoriesWithFavs={categoriesWithFavs}
      initialMonth={month}
      initialNbuRates={nbuRates}
      initialAccountBalances={accountBalances}
      initialWeeklyBudget={weeklyBudget}
    />
    <InsightsPanel page="finance" />
    </ModuleGate>
  );
}
