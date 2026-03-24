"use client";

import { useState, useTransition, useCallback } from "react";
import {
  getTransactions,
  getFinanceSummary,
  getNbuRates,
  getAccountBalances,
  getCategoriesForPeriod,
} from "@/actions/finance";
import { type PeriodPreset } from "@/components/ui/period-selector";
import {
  type Transaction,
  type SummaryData,
  type NbuRateData,
  type AccountBalanceData,
} from "./finance-types";

const PAGE_SIZE = 50;

interface UseFinanceDataParams {
  initialTransactions: Transaction[];
  initialCount: number;
  initialSummary: SummaryData;
  initialMonth: string;
  initialNbuRates: NbuRateData[];
  initialAccountBalances: AccountBalanceData[];
}

export function useFinanceData({
  initialTransactions,
  initialCount,
  initialSummary,
  initialMonth,
  initialNbuRates,
  initialAccountBalances,
}: UseFinanceDataParams) {
  const [isPending, startTransition] = useTransition();

  // Data state
  const [transactions, setTransactions] = useState(initialTransactions);
  const [totalCount, setTotalCount] = useState(initialCount);
  const [summary, setSummary] = useState(initialSummary);
  const [nbuRates, setNbuRates] = useState(initialNbuRates);
  const [accountBalances, setAccountBalances] = useState(initialAccountBalances);
  const [periodCategories, setPeriodCategories] = useState<string[]>(
    initialSummary.byCategory.map((c) => c.category).sort()
  );

  // Filter state
  const [dateFrom, setDateFrom] = useState(initialMonth + "-01");
  const [dateTo, setDateTo] = useState("");
  const [filterType, setFilterType] = useState("EXPENSE");
  const [filterAccount, setFilterAccount] = useState("");
  const [filterCategory, setFilterCategory] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [page, setPage] = useState(0);

  // Selection state
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());

  // Period selector
  const [periodPreset, setPeriodPreset] = useState<PeriodPreset>("this_month");
  const [periodCustomFrom, setPeriodCustomFrom] = useState("");
  const [periodCustomTo, setPeriodCustomTo] = useState("");

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
        setSelectedIds(new Set());

        const monthKey = dateFrom ? dateFrom.slice(0, 7) : initialMonth;
        const s = await getFinanceSummary(monthKey);
        setSummary(s);

        const rateDate = dateTo || dateFrom || new Date().toISOString().slice(0, 10);
        const rates = await getNbuRates(rateDate);
        setNbuRates(rates);
      });
    },
    [
      page,
      dateFrom,
      dateTo,
      filterType,
      filterAccount,
      filterCategory,
      searchQuery,
      initialMonth,
    ],
  );

  const handlePeriodChange = (preset: PeriodPreset, range: { dateFrom: string; dateTo: string }) => {
    setPeriodPreset(preset);
    setDateFrom(range.dateFrom);
    setDateTo(range.dateTo);
    setPage(0);
    startTransition(async () => {
      const filters: Record<string, unknown> = {
        limit: PAGE_SIZE,
        offset: 0,
      };
      if (range.dateFrom) filters.dateFrom = range.dateFrom;
      if (range.dateTo) filters.dateTo = range.dateTo;
      if (filterType) filters.type = filterType;
      if (filterAccount) filters.account = filterAccount;
      if (filterCategory) filters.category = filterCategory;
      if (searchQuery) filters.search = searchQuery;

      const [result, s, rates, balances, periodCats] = await Promise.all([
        getTransactions(filters as Parameters<typeof getTransactions>[0]),
        getFinanceSummary(range),
        getNbuRates(range.dateTo || range.dateFrom || new Date().toISOString().slice(0, 10)),
        getAccountBalances(),
        getCategoriesForPeriod(range.dateFrom, range.dateTo),
      ]);
      setTransactions(result.transactions);
      setTotalCount(result.count);
      setSelectedIds(new Set());
      setSummary(s);
      setNbuRates(rates);
      setAccountBalances(balances);
      setPeriodCategories(periodCats);
    });
  };

  const applyFilters = () => {
    setPage(0);
    fetchData(0);
  };

  const goToPage = (p: number) => {
    setPage(p);
    fetchData(p);
  };

  return {
    // Data
    transactions,
    setTransactions,
    totalCount,
    setTotalCount,
    summary,
    nbuRates,
    accountBalances,
    periodCategories,
    selectedIds,
    setSelectedIds,

    // Date range
    dateFrom,
    dateTo,

    // Pagination
    page,
    totalPages,

    // Filters
    filterType,
    filterAccount,
    filterCategory,
    searchQuery,
    setFilterType,
    setFilterAccount,
    setFilterCategory,
    setSearchQuery,

    // Period
    periodPreset,
    periodCustomFrom,
    periodCustomTo,
    setPeriodCustomFrom,
    setPeriodCustomTo,

    // Loading
    isPending,
    startTransition,

    // Actions
    fetchData,
    handlePeriodChange,
    applyFilters,
    goToPage,

    // Constants
    PAGE_SIZE,
  };
}
