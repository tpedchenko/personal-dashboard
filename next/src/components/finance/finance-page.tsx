"use client";

import { useMemo } from "react";
import { useTranslations } from "next-intl";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { PeriodSelector } from "@/components/ui/period-selector";
import { Fab } from "@/components/ui/fab";
import { usePageShortcuts } from "@/hooks/use-keyboard-shortcuts";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

import {
  type Transaction,
  type SummaryData,
  type AccountData,
  type NbuRateData,
  type AccountBalanceData,
  type WeeklyBudgetData,
  type CategoryWithFav,
} from "./finance-types";

import { ErrorBoundary } from "@/components/shared/error-boundary";
import { FinanceSummaryCards } from "./finance-summary-cards";
import { AccountBalancesCard } from "./account-balances-card";
import { WeeklyBudgetCard } from "./weekly-budget-card";
import { CategoryBreakdownCard } from "./category-breakdown-card";
import { TransactionList } from "./transaction-list";
import { TransactionForm } from "./transaction-form";

import { useFinanceData } from "./use-finance-data";
import { useTransactionForm } from "./use-transaction-form";
import { useTransactionActions } from "./use-transaction-actions";

// ---------- Types (re-export for backwards compat) ----------

interface FinancePageProps {
  initialTransactions: Transaction[];
  initialCount: number;
  initialSummary: SummaryData;
  initialAccounts: AccountData[];
  initialCategories: string[];
  initialCategoriesWithFavs: CategoryWithFav[];
  initialMonth: string;
  initialNbuRates: NbuRateData[];
  initialAccountBalances: AccountBalanceData[];
  initialWeeklyBudget: WeeklyBudgetData;
}

export function FinancePage({
  initialTransactions,
  initialCount,
  initialSummary,
  initialAccounts,
  initialCategories,
  initialCategoriesWithFavs,
  initialMonth,
  initialNbuRates,
  initialAccountBalances,
  initialWeeklyBudget,
}: FinancePageProps) {
  const tc = useTranslations("common");
  const accounts = initialAccounts;
  const categories = initialCategories;
  const categoriesWithFavs = initialCategoriesWithFavs;

  // --- Data & filters hook ---
  const data = useFinanceData({
    initialTransactions,
    initialCount,
    initialSummary,
    initialMonth,
    initialNbuRates,
    initialAccountBalances,
  });

  // --- Transaction form hook ---
  const form = useTransactionForm({
    accounts,
    nbuRates: data.nbuRates,
    transactions: data.transactions,
    totalCount: data.totalCount,
    setTransactions: data.setTransactions,
    setTotalCount: data.setTotalCount,
    startTransition: data.startTransition,
    fetchData: data.fetchData,
  });

  // --- Transaction actions hook ---
  const actions = useTransactionActions({
    transactions: data.transactions,
    totalCount: data.totalCount,
    selectedIds: data.selectedIds,
    setTransactions: data.setTransactions,
    setTotalCount: data.setTotalCount,
    setSelectedIds: data.setSelectedIds,
    startTransition: data.startTransition,
    fetchData: data.fetchData,
    dateFrom: data.dateFrom,
    dateTo: data.dateTo,
    filterType: data.filterType,
    filterAccount: data.filterAccount,
    filterCategory: data.filterCategory,
    searchQuery: data.searchQuery,
  });

  // Keyboard shortcuts: n → open add dialog, Escape → close any dialog
  usePageShortcuts(
    useMemo(
      () => ({
        n: () => {
          form.resetForm();
          form.setAddDialogOpen(true);
        },
        Escape: () => {
          if (form.editDialogOpen) form.setEditDialogOpen(false);
          else if (form.addDialogOpen) form.setAddDialogOpen(false);
        },
      }),
      // eslint-disable-next-line react-hooks/exhaustive-deps
      [form.addDialogOpen, form.editDialogOpen],
    ),
  );

  // --- Shared transaction form props ---
  const transactionFormProps = {
    formDate: form.formDate,
    formType: form.formType,
    formAccount: form.formAccount,
    formCategory: form.formCategory,
    formAmount: form.formAmount,
    formCurrency: form.formCurrency,
    formDescription: form.formDescription,
    formFromAccount: form.formFromAccount,
    formToAccount: form.formToAccount,
    formFromAmount: form.formFromAmount,
    formToAmount: form.formToAmount,
    calFormOpen: form.calFormOpen,
    isPending: data.isPending,
    accounts,
    categoriesWithFavs,
    nbuRates: data.nbuRates,
    onFormDateChange: form.setFormDate,
    onFormTypeChange: form.setFormType,
    onFormAccountChange: form.setFormAccount,
    onFormCategoryChange: form.setFormCategory,
    onFormAmountChange: form.setFormAmount,
    onFormCurrencyChange: form.setFormCurrency,
    onFormDescriptionChange: form.setFormDescription,
    onFormFromAccountChange: form.setFormFromAccount,
    onFormToAccountChange: form.setFormToAccount,
    onFormFromAmountChange: form.setFormFromAmount,
    onFormToAmountChange: form.setFormToAmount,
    onCalFormOpenChange: form.setCalFormOpen,
  };

  const renderTransactionForm = (onSubmit: () => void, submitLabel: string) => (
    <TransactionForm
      {...transactionFormProps}
      onSubmit={onSubmit}
      submitLabel={submitLabel}
    />
  );

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex flex-col gap-3">
        <h1 className="sr-only">Finance</h1>
        <PeriodSelector
          value={data.periodPreset}
          onChange={data.handlePeriodChange}
          customFrom={data.periodCustomFrom}
          customTo={data.periodCustomTo}
          onCustomChange={(f, t) => { data.setPeriodCustomFrom(f); data.setPeriodCustomTo(t); }}
        />
      </div>

      {/* ===== Summary Cards ===== */}
      <ErrorBoundary moduleName="Finance Summary">
        <FinanceSummaryCards summary={data.summary} nbuRates={data.nbuRates} />
      </ErrorBoundary>

      {/* ===== Account Balances + Weekly Budget (left) & Category Breakdown (right) ===== */}
      <ErrorBoundary moduleName="Account Balances & Budget">
      <div className="grid gap-3 md:grid-cols-2">
        {/* Left column: Account Balances + Weekly Budget */}
        <div className="space-y-3">
          <AccountBalancesCard accountBalances={data.accountBalances} />
          {initialWeeklyBudget && (
            <WeeklyBudgetCard weeklyBudget={initialWeeklyBudget} />
          )}
        </div>

        {/* Right column: Category Breakdown */}
        <CategoryBreakdownCard summary={data.summary} />
      </div>
      </ErrorBoundary>

      {/* ===== Filters + Transactions ===== */}
      <ErrorBoundary moduleName="Transactions">
      <TransactionList
        transactions={data.transactions}
        totalCount={data.totalCount}
        page={data.page}
        totalPages={data.totalPages}
        selectedIds={data.selectedIds}
        isPending={data.isPending}
        filterType={data.filterType}
        filterAccount={data.filterAccount}
        filterCategory={data.filterCategory}
        searchQuery={data.searchQuery}
        periodCategories={data.periodCategories}
        accounts={accounts}
        onFilterTypeChange={data.setFilterType}
        onFilterAccountChange={data.setFilterAccount}
        onFilterCategoryChange={data.setFilterCategory}
        onSearchQueryChange={data.setSearchQuery}
        onApplyFilters={data.applyFilters}
        onToggleSelect={actions.toggleSelect}
        onToggleSelectAll={actions.toggleSelectAll}
        onDelete={actions.handleDelete}
        onBulkDelete={actions.handleBulkDelete}
        onEdit={form.openEdit}
        onExportCsv={actions.handleExportCsv}
        onGoToPage={data.goToPage}
        addDialogOpen={form.addDialogOpen}
        onAddDialogOpenChange={form.setAddDialogOpen}
        onResetForm={form.resetForm}
        renderTransactionForm={renderTransactionForm}
        onAdd={form.handleAdd}
      />
      </ErrorBoundary>

      {/* Edit dialog (bottom sheet) */}
      <Sheet open={form.editDialogOpen} onOpenChange={form.setEditDialogOpen}>
        <SheetContent side="bottom" className="max-h-[85dvh] overflow-y-auto">
          <SheetHeader>
            <SheetTitle>{tc("edit")}</SheetTitle>
          </SheetHeader>
          <TransactionForm
            {...transactionFormProps}
            onSubmit={form.handleUpdate}
            submitLabel={tc("save")}
          />
        </SheetContent>
      </Sheet>

      <Fab aria-label="Add transaction" onClick={() => { form.resetForm(); form.setAddDialogOpen(true); }} />
      <ConfirmDialog
        open={actions.confirmDialog !== null}
        onOpenChange={(open) => { if (!open) actions.setConfirmDialog(null); }}
        title={actions.confirmDialog?.title ?? ""}
        confirmLabel={tc("delete")}
        cancelLabel={tc("cancel")}
        onConfirm={() => actions.confirmDialog?.onConfirm()}
        destructive
      />
    </div>
  );
}
