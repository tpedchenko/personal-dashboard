import {
  getAccounts,
  getCategoriesForPeriod,
  getTransactions,
} from "@/actions/finance";
import { TransactionsPage } from "@/components/finance/transactions-page";
import { ModuleGate } from "@/components/shared/module-gate";

function currentMonthStart(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

export default async function TransactionsPageRoute() {
  const dateFrom = currentMonthStart();

  const [txResult, accounts, categories] = await Promise.all([
    getTransactions({ dateFrom, limit: 50, offset: 0 }),
    getAccounts(),
    getCategoriesForPeriod(dateFrom),
  ]);

  return (
    <ModuleGate moduleKey="finance">
      <TransactionsPage
        initialTransactions={txResult.transactions}
        initialCount={txResult.count}
        initialAccounts={accounts}
        initialCategories={categories}
        initialDateFrom={dateFrom}
      />
    </ModuleGate>
  );
}
