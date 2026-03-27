"use client";

import { useState, useTransition, useCallback, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import {
  getTransactions,
  getCategoriesForPeriod,
  deleteTransaction,
} from "@/actions/finance";
import type { Transaction, AccountData } from "./finance-types";
import { TransactionFilters } from "./transaction-filters";
import { TransactionTable, type SortField, type SortDir } from "./transaction-table";
import { TransactionEditDialog, TransactionDeleteDialog } from "./transaction-edit-dialog";

const PAGE_SIZE = 50;

interface TransactionsPageProps {
  initialTransactions: Transaction[];
  initialCount: number;
  initialAccounts: AccountData[];
  initialCategories: string[];
  initialDateFrom: string;
}

export function TransactionsPage({
  initialTransactions,
  initialCount,
  initialAccounts,
  initialCategories,
  initialDateFrom,
}: TransactionsPageProps) {
  const tc = useTranslations("common");
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  // Pre-fill from URL params
  const paramAccount = searchParams.get("account") ?? "";
  const paramCategory = searchParams.get("category") ?? "";

  // Data
  const [transactions, setTransactions] = useState(initialTransactions);
  const [totalCount, setTotalCount] = useState(initialCount);
  const [accounts] = useState(initialAccounts);
  const [categories, setCategories] = useState(initialCategories);

  // Filters
  const [dateFrom, setDateFrom] = useState(initialDateFrom);
  const [dateTo, setDateTo] = useState("");
  const [filterAccount, setFilterAccount] = useState(paramAccount);
  const [filterCategory, setFilterCategory] = useState(paramCategory);
  const [filterType, setFilterType] = useState("");
  const [searchQuery, setSearchQuery] = useState("");

  // Edit/delete
  const [editTx, setEditTx] = useState<Transaction | null>(null);
  const [deleteId, setDeleteId] = useState<number | null>(null);

  // Pagination
  const [page, setPage] = useState(0);

  // Sort
  const [sortField, setSortField] = useState<SortField>("date");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  const fetchData = useCallback(
    (newPage?: number) => {
      const p = newPage ?? page;
      startTransition(async () => {
        const filters: Record<string, unknown> = {
          limit: PAGE_SIZE,
          offset: p * PAGE_SIZE,
        };
        if (dateFrom) filters.dateFrom = dateFrom;
        if (dateTo) filters.dateTo = dateTo;
        if (filterType) filters.type = filterType;
        if (filterAccount) filters.account = filterAccount;
        if (filterCategory) filters.category = filterCategory;
        if (searchQuery) filters.search = searchQuery;

        const result = await getTransactions(
          filters as Parameters<typeof getTransactions>[0],
        );
        setTransactions(result.transactions);
        setTotalCount(result.count);

        // Refresh categories for the date range
        const cats = await getCategoriesForPeriod(dateFrom, dateTo || undefined);
        setCategories(cats);
      });
    },
    [page, dateFrom, dateTo, filterType, filterAccount, filterCategory, searchQuery],
  );

  // Load with URL params on mount
  useEffect(() => {
    if (paramAccount || paramCategory) {
      fetchData(0);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const applyFilters = () => {
    setPage(0);
    fetchData(0);
  };

  const goToPage = (p: number) => {
    setPage(p);
    fetchData(p);
  };

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDir(field === "date" ? "desc" : "asc");
    }
  };

  function confirmDeleteTx() {
    if (deleteId === null) return;
    startTransition(async () => {
      try {
        await deleteTransaction(deleteId);
        toast.success(tc("deleted"));
        applyFilters();
      } catch {
        toast.error(tc("error"));
      }
    });
  }

  return (
    <div className="space-y-4">
      <TransactionFilters
        dateFrom={dateFrom}
        dateTo={dateTo}
        filterAccount={filterAccount}
        filterCategory={filterCategory}
        filterType={filterType}
        searchQuery={searchQuery}
        accounts={accounts}
        categories={categories}
        isPending={isPending}
        onDateFromChange={setDateFrom}
        onDateToChange={setDateTo}
        onFilterAccountChange={setFilterAccount}
        onFilterCategoryChange={setFilterCategory}
        onFilterTypeChange={setFilterType}
        onSearchQueryChange={setSearchQuery}
        onApply={applyFilters}
      />

      <TransactionTable
        transactions={transactions}
        totalCount={totalCount}
        page={page}
        totalPages={totalPages}
        sortField={sortField}
        sortDir={sortDir}
        isPending={isPending}
        onSort={handleSort}
        onGoToPage={goToPage}
        onEdit={setEditTx}
        onDelete={(id) => setDeleteId(id)}
      />

      <TransactionEditDialog
        editTx={editTx}
        onClose={() => setEditTx(null)}
        accounts={accounts}
        categories={categories}
        onSaved={applyFilters}
      />

      <TransactionDeleteDialog
        deleteId={deleteId}
        onClose={() => setDeleteId(null)}
        onConfirm={confirmDeleteTx}
      />
    </div>
  );
}
