"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import {
  addTransaction,
  addTransfer,
  updateTransaction,
} from "@/actions/finance";
import {
  type Transaction,
  type AccountData,
  type NbuRateData,
  normalizeCurrency,
  todayStr,
} from "./finance-types";

interface UseTransactionFormParams {
  accounts: AccountData[];
  nbuRates: NbuRateData[];
  transactions: Transaction[];
  totalCount: number;
  setTransactions: React.Dispatch<React.SetStateAction<Transaction[]>>;
  setTotalCount: React.Dispatch<React.SetStateAction<number>>;
  startTransition: React.TransitionStartFunction;
  fetchData: (newPage?: number) => void;
}

export function useTransactionForm({
  accounts,
  nbuRates,
  transactions,
  totalCount,
  setTransactions,
  setTotalCount,
  startTransition,
  fetchData,
}: UseTransactionFormParams) {
  const tc = useTranslations("common");

  // Form state
  const [formDate, setFormDate] = useState(todayStr());
  const [formType, setFormType] = useState("EXPENSE");
  const [formAccount, setFormAccount] = useState(accounts[0]?.name ?? "");
  const [formCategory, setFormCategory] = useState("");
  const [formAmount, setFormAmount] = useState("");
  const [formCurrency, setFormCurrency] = useState(() => {
    const firstAcc = accounts[0];
    return firstAcc ? normalizeCurrency(firstAcc.currency) : "EUR";
  });
  const [formDescription, setFormDescription] = useState("");

  // Transfer form state
  const [formFromAccount, setFormFromAccount] = useState(accounts[0]?.name ?? "");
  const [formToAccount, setFormToAccount] = useState(accounts[1]?.name ?? accounts[0]?.name ?? "");
  const [formFromAmount, setFormFromAmount] = useState("");
  const [formToAmount, setFormToAmount] = useState("");

  // Calendar popover
  const [calFormOpen, setCalFormOpen] = useState(false);

  // Dialog state
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingTx, setEditingTx] = useState<Transaction | null>(null);

  const resetForm = () => {
    setFormDate(todayStr());
    setFormType("EXPENSE");
    setFormAccount(accounts[0]?.name ?? "");
    setFormCategory("");
    setFormAmount("");
    setFormCurrency(accounts[0] ? normalizeCurrency(accounts[0].currency) : "EUR");
    setFormDescription("");
    setFormFromAccount(accounts[0]?.name ?? "");
    setFormToAccount(accounts[1]?.name ?? accounts[0]?.name ?? "");
    setFormFromAmount("");
    setFormToAmount("");
  };

  const computeEur = (amount: number, currency: string) => {
    if (currency === "EUR") return amount;
    if (currency === "UAH") {
      const eurRate = nbuRates.find((r) => r.currencyCode === "EUR");
      return eurRate && eurRate.rate > 0 ? amount / eurRate.rate : amount;
    }
    if (currency === "USD") {
      const usdRate = nbuRates.find((r) => r.currencyCode === "USD");
      const eurRate = nbuRates.find((r) => r.currencyCode === "EUR");
      if (usdRate && eurRate && eurRate.rate > 0) {
        return (amount * usdRate.rate) / eurRate.rate;
      }
      return amount;
    }
    return amount;
  };

  const handleAdd = () => {
    if (formType === "TRANSFER") {
      const fromAmt = parseFloat(formFromAmount);
      const toAmt = parseFloat(formToAmount || formFromAmount);
      if (!formDate || isNaN(fromAmt) || fromAmt <= 0) return;

      const fromCur = accounts.find((a) => a.name === formFromAccount)?.currency ?? "EUR";
      const toCur = accounts.find((a) => a.name === formToAccount)?.currency ?? "EUR";

      const fromEur = Math.round(computeEur(fromAmt, fromCur) * 100) / 100;
      const toEur = Math.round(computeEur(isNaN(toAmt) ? fromAmt : toAmt, toCur) * 100) / 100;
      const eurNbuRate = nbuRates.find((r) => r.currencyCode === "EUR")?.rate;

      setAddDialogOpen(false);
      resetForm();

      startTransition(async () => {
        try {
          await addTransfer({
            date: formDate,
            fromAccount: formFromAccount,
            toAccount: formToAccount,
            fromAmount: fromAmt,
            toAmount: isNaN(toAmt) ? fromAmt : toAmt,
            fromCurrency: fromCur,
            toCurrency: toCur,
            fromEur,
            toEur,
            nbuRate: eurNbuRate,
            description: formDescription || undefined,
          });
          fetchData(0);
        } catch {
          toast.error(tc("error_save") ?? "Failed to save transfer");
        }
      });
      return;
    }

    const amt = parseFloat(formAmount);
    if (!formDate || !formCategory || isNaN(amt)) return;

    const amtEur = Math.round(computeEur(amt, formCurrency) * 100) / 100;
    const eurNbuRate = nbuRates.find((r) => r.currencyCode === "EUR")?.rate;

    const optimisticTx: Transaction = {
      id: -Date.now(),
      date: formDate,
      year: new Date(formDate).getFullYear(),
      month: new Date(formDate).getMonth() + 1,
      type: formType,
      subType: null,
      account: formAccount,
      category: formCategory,
      amountOriginal: amt,
      currencyOriginal: formCurrency,
      amountEur: amtEur,
      nbuRateEurUsed: eurNbuRate ?? null,
      description: formDescription || null,
      owner: null,
      externalId: null,
      source: "manual",
      createdAt: new Date(),
    };

    const prevTransactions = transactions;
    const prevCount = totalCount;
    setTransactions((prev) => [optimisticTx, ...prev]);
    setTotalCount((prev) => prev + 1);
    setAddDialogOpen(false);
    resetForm();

    startTransition(async () => {
      try {
        await addTransaction({
          date: formDate,
          type: formType,
          account: formAccount,
          category: formCategory,
          amountOriginal: amt,
          currencyOriginal: formCurrency,
          amountEur: amtEur,
          nbuRateEurUsed: eurNbuRate,
          description: formDescription || undefined,
        });
        fetchData(0);
      } catch {
        setTransactions(prevTransactions);
        setTotalCount(prevCount);
        toast.error(tc("error_save") ?? "Failed to save transaction");
      }
    });
  };

  const handleUpdate = () => {
    if (!editingTx) return;
    const amt = parseFloat(formAmount);
    if (!formDate || !formCategory || isNaN(amt)) return;

    const amtEur = Math.round(computeEur(amt, formCurrency) * 100) / 100;
    const txId = editingTx.id;

    const prevTransactions = transactions;
    const updatedTx: Transaction = {
      ...editingTx,
      date: formDate,
      type: formType,
      account: formAccount,
      category: formCategory,
      amountOriginal: amt,
      currencyOriginal: formCurrency,
      amountEur: amtEur,
      description: formDescription || null,
    };
    setTransactions((prev) =>
      prev.map((tx) => (tx.id === txId ? updatedTx : tx))
    );
    setEditDialogOpen(false);
    setEditingTx(null);
    resetForm();

    startTransition(async () => {
      try {
        await updateTransaction(txId, {
          date: formDate,
          type: formType,
          account: formAccount,
          category: formCategory,
          amountOriginal: amt,
          currencyOriginal: formCurrency,
          amountEur: amtEur,
          description: formDescription || undefined,
        });
        fetchData();
      } catch {
        setTransactions(prevTransactions);
        toast.error(tc("error_save") ?? "Failed to update transaction");
      }
    });
  };

  const openEdit = (tx: Transaction) => {
    setEditingTx(tx);
    setFormDate(tx.date);
    setFormType(tx.type ?? "EXPENSE");
    setFormAccount(tx.account ?? accounts[0]?.name ?? "");
    setFormCategory(tx.category ?? "");
    setFormAmount(String(Math.abs(tx.amountOriginal ?? tx.amountEur ?? 0)));
    setFormCurrency(tx.currencyOriginal ?? "EUR");
    setFormDescription(tx.description ?? "");
    setEditDialogOpen(true);
  };

  return {
    // Form state
    formDate,
    formType,
    formAccount,
    formCategory,
    formAmount,
    formCurrency,
    formDescription,
    formFromAccount,
    formToAccount,
    formFromAmount,
    formToAmount,
    calFormOpen,
    setFormDate,
    setFormType,
    setFormAccount,
    setFormCategory,
    setFormAmount,
    setFormCurrency,
    setFormDescription,
    setFormFromAccount,
    setFormToAccount,
    setFormFromAmount,
    setFormToAmount,
    setCalFormOpen,

    // Dialog state
    addDialogOpen,
    setAddDialogOpen,
    editDialogOpen,
    setEditDialogOpen,

    // Actions
    resetForm,
    handleAdd,
    handleUpdate,
    openEdit,
  };
}
