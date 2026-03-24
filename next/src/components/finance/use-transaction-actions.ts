"use client";

import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { useState } from "react";
import {
  deleteTransaction,
  deleteTransactions,
  exportTransactionsCsv,
} from "@/actions/finance";
import { type Transaction } from "./finance-types";

interface UseTransactionActionsParams {
  transactions: Transaction[];
  totalCount: number;
  selectedIds: Set<number>;
  setTransactions: React.Dispatch<React.SetStateAction<Transaction[]>>;
  setTotalCount: React.Dispatch<React.SetStateAction<number>>;
  setSelectedIds: React.Dispatch<React.SetStateAction<Set<number>>>;
  startTransition: React.TransitionStartFunction;
  fetchData: (newPage?: number) => void;
  dateFrom: string;
  dateTo: string;
  filterType: string;
  filterAccount: string;
  filterCategory: string;
  searchQuery: string;
}

export function useTransactionActions({
  transactions,
  totalCount,
  selectedIds,
  setTransactions,
  setTotalCount,
  setSelectedIds,
  startTransition,
  fetchData,
  dateFrom,
  dateTo,
  filterType,
  filterAccount,
  filterCategory,
  searchQuery,
}: UseTransactionActionsParams) {
  const tc = useTranslations("common");

  const [confirmDialog, setConfirmDialog] = useState<{ title: string; onConfirm: () => void } | null>(null);

  const handleDelete = (id: number) => {
    setConfirmDialog({
      title: tc("delete_confirm"),
      onConfirm: () => {
        const prevTransactions = transactions;
        const prevCount = totalCount;
        setTransactions((prev) => prev.filter((tx) => tx.id !== id));
        setTotalCount((prev) => prev - 1);

        startTransition(async () => {
          try {
            await deleteTransaction(id);
            fetchData();
          } catch {
            setTransactions(prevTransactions);
            setTotalCount(prevCount);
            toast.error(tc("error_delete") ?? "Failed to delete transaction");
          }
        });
      },
    });
  };

  const handleBulkDelete = () => {
    if (selectedIds.size === 0) return;
    const idsToDelete = Array.from(selectedIds);
    setConfirmDialog({
      title: `Видалити ${selectedIds.size} записів?`,
      onConfirm: () => {
        const prevTransactions = transactions;
        const prevCount = totalCount;
        const deleteSet = new Set(idsToDelete);
        setTransactions((prev) => prev.filter((tx) => !deleteSet.has(tx.id)));
        setTotalCount((prev) => prev - idsToDelete.length);
        setSelectedIds(new Set());

        startTransition(async () => {
          try {
            await deleteTransactions(idsToDelete);
            fetchData();
          } catch {
            setTransactions(prevTransactions);
            setTotalCount(prevCount);
            toast.error(tc("error_delete") ?? "Failed to delete transactions");
          }
        });
      },
    });
  };

  const toggleSelect = (id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === transactions.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(transactions.map((tx) => tx.id)));
    }
  };

  const handleExportCsv = () => {
    startTransition(async () => {
      const filters: Record<string, string> = {};
      if (dateFrom) filters.dateFrom = dateFrom;
      if (dateTo) filters.dateTo = dateTo;
      if (filterType) filters.type = filterType;
      if (filterAccount) filters.account = filterAccount;
      if (filterCategory) filters.category = filterCategory;
      if (searchQuery) filters.search = searchQuery;

      const csv = await exportTransactionsCsv(filters);
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `transactions_${dateFrom || "all"}_${dateTo || "now"}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    });
  };

  return {
    confirmDialog,
    setConfirmDialog,
    handleDelete,
    handleBulkDelete,
    toggleSelect,
    toggleSelectAll,
    handleExportCsv,
  };
}
