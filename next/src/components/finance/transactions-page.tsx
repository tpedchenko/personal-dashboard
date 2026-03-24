"use client";

import { useState, useTransition, useCallback, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { SearchIcon, FilterIcon, ChevronLeftIcon, ChevronRightIcon, ArrowUpDownIcon, PencilIcon, TrashIcon, Loader2Icon } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { toast } from "sonner";
import {
  getTransactions,
  getAccounts,
  getCategoriesForPeriod,
  updateTransaction,
  deleteTransaction,
} from "@/actions/finance";
import type { Transaction, AccountData } from "./finance-types";
import { formatEur, formatAmount } from "./finance-types";

const PAGE_SIZE = 50;

type SortField = "date" | "amountEur" | "category";
type SortDir = "asc" | "desc";

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
  const t = useTranslations("finance");
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

  // Edit dialog
  const [editTx, setEditTx] = useState<Transaction | null>(null);
  const [editDate, setEditDate] = useState("");
  const [editType, setEditType] = useState("");
  const [editAccount, setEditAccount] = useState("");
  const [editCategory, setEditCategory] = useState("");
  const [editAmount, setEditAmount] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editSaving, setEditSaving] = useState(false);
  const [deleteId, setDeleteId] = useState<number | null>(null);

  function openEdit(tx: Transaction) {
    setEditTx(tx);
    setEditDate(tx.date);
    setEditType(tx.type ?? "EXPENSE");
    setEditAccount(tx.account ?? "");
    setEditCategory(tx.category ?? "");
    setEditAmount(String(Math.abs(tx.amountEur ?? 0)));
    setEditDescription(tx.description ?? "");
  }

  async function handleSaveEdit() {
    if (!editTx) return;
    setEditSaving(true);
    try {
      await updateTransaction(editTx.id, {
        date: editDate,
        type: editType,
        account: editAccount,
        category: editCategory,
        amountOriginal: parseFloat(editAmount) || 0,
        amountEur: parseFloat(editAmount) || 0,
        description: editDescription,
      });
      toast.success(tc("saved"));
      setEditTx(null);
      applyFilters();
    } catch {
      toast.error(tc("error"));
    } finally {
      setEditSaving(false);
    }
  }

  async function handleDelete(id: number) {
    setDeleteId(id);
  }

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

  // Client-side sort (within current page)
  const sortedTransactions = [...transactions].sort((a, b) => {
    const dir = sortDir === "asc" ? 1 : -1;
    switch (sortField) {
      case "date":
        return dir * a.date.localeCompare(b.date);
      case "amountEur":
        return dir * ((a.amountEur ?? 0) - (b.amountEur ?? 0));
      case "category":
        return dir * (a.category ?? "").localeCompare(b.category ?? "");
      default:
        return 0;
    }
  });

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") applyFilters();
  };

  return (
    <div className="space-y-4">
      {/* Filters */}
      <Card size="sm">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-sm">
            <FilterIcon className="size-4" />
            {tc("filters")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {/* Date From */}
            <div>
              <label className="mb-1 block text-xs text-muted-foreground">{t("date")} ({tc("from")})</label>
              <Input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                onKeyDown={handleKeyDown}
              />
            </div>

            {/* Date To */}
            <div>
              <label className="mb-1 block text-xs text-muted-foreground">{t("date")} ({tc("to")})</label>
              <Input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                onKeyDown={handleKeyDown}
              />
            </div>

            {/* Account */}
            <div>
              <label className="mb-1 block text-xs text-muted-foreground">{t("account")}</label>
              <select
                className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
                value={filterAccount}
                onChange={(e) => setFilterAccount(e.target.value)}
              >
                <option value="">{t("all_accounts")}</option>
                {accounts.map((a) => (
                  <option key={a.name} value={a.name}>
                    {a.name} ({a.currency})
                  </option>
                ))}
              </select>
            </div>

            {/* Category */}
            <div>
              <label className="mb-1 block text-xs text-muted-foreground">{t("category")}</label>
              <select
                className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
                value={filterCategory}
                onChange={(e) => setFilterCategory(e.target.value)}
              >
                <option value="">{tc("all")}</option>
                {categories.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>

            {/* Type */}
            <div>
              <label className="mb-1 block text-xs text-muted-foreground">{tc("type")}</label>
              <select
                className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
                value={filterType}
                onChange={(e) => setFilterType(e.target.value)}
              >
                <option value="">{tc("all")}</option>
                <option value="INCOME">{t("income")}</option>
                <option value="EXPENSE">{t("expense")}</option>
                <option value="TRANSFER">{t("transfer")}</option>
              </select>
            </div>

            {/* Search */}
            <div className="sm:col-span-2 lg:col-span-2">
              <label className="mb-1 block text-xs text-muted-foreground">{tc("search")}</label>
              <div className="relative">
                <SearchIcon className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder={tc("search") + "..."}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={handleKeyDown}
                  className="pl-8"
                />
              </div>
            </div>

            {/* Apply button */}
            <div className="flex items-end">
              <Button onClick={applyFilters} disabled={isPending} className="w-full">
                {isPending ? tc("loading") : tc("apply")}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Results */}
      <Card size="sm">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center justify-between text-sm">
            <span>{t("recent_transactions")}</span>
            <span className="text-xs font-normal text-muted-foreground">
              {totalCount} {tc("transactions")}
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {sortedTransactions.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">
              {t("no_transactions")}
            </div>
          ) : (
            <>
              {/* Desktop table */}
              <div className="hidden md:block">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>
                        <button
                          className="flex items-center gap-1 hover:text-foreground"
                          onClick={() => handleSort("date")}
                        >
                          {t("date")}
                          {sortField === "date" && <ArrowUpDownIcon className="size-3" />}
                        </button>
                      </TableHead>
                      <TableHead>{tc("type")}</TableHead>
                      <TableHead>{t("account")}</TableHead>
                      <TableHead>
                        <button
                          className="flex items-center gap-1 hover:text-foreground"
                          onClick={() => handleSort("category")}
                        >
                          {t("category")}
                          {sortField === "category" && <ArrowUpDownIcon className="size-3" />}
                        </button>
                      </TableHead>
                      <TableHead className="text-right">
                        <button
                          className="ml-auto flex items-center gap-1 hover:text-foreground"
                          onClick={() => handleSort("amountEur")}
                        >
                          {t("amount")} (EUR)
                          {sortField === "amountEur" && <ArrowUpDownIcon className="size-3" />}
                        </button>
                      </TableHead>
                      <TableHead className="text-right">{t("amount")}</TableHead>
                      <TableHead>{t("note")}</TableHead>
                      <TableHead className="w-16"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sortedTransactions.map((tx) => (
                      <TableRow key={tx.id}>
                        <TableCell className="text-xs tabular-nums">
                          {tx.date}
                        </TableCell>
                        <TableCell>
                          <TypeBadge type={tx.type} subType={tx.subType} />
                        </TableCell>
                        <TableCell>
                          {tx.account ? (
                            <Link
                              href={`/finance/transactions?account=${encodeURIComponent(tx.account)}`}
                              className="text-xs hover:underline"
                            >
                              {tx.account}
                            </Link>
                          ) : (
                            <span className="text-xs text-muted-foreground">-</span>
                          )}
                        </TableCell>
                        <TableCell>
                          {tx.category ? (
                            <Link
                              href={`/finance/transactions?category=${encodeURIComponent(tx.category)}`}
                              className="text-xs hover:underline"
                            >
                              {tx.category}
                            </Link>
                          ) : (
                            <span className="text-xs text-muted-foreground">-</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          <span className={tx.type === "INCOME" ? "text-income" : "text-expense"}>
                            {tx.amountEur != null ? formatEur(Math.abs(tx.amountEur)) : "-"}
                          </span>
                        </TableCell>
                        <TableCell className="text-right text-xs tabular-nums text-muted-foreground">
                          {tx.amountOriginal != null && tx.currencyOriginal && tx.currencyOriginal !== "EUR"
                            ? formatAmount(Math.abs(tx.amountOriginal), tx.currencyOriginal)
                            : ""}
                        </TableCell>
                        <TableCell className="max-w-[200px] truncate text-xs text-muted-foreground">
                          {tx.description ?? ""}
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(tx)}>
                              <PencilIcon className="size-3" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => handleDelete(tx.id)}>
                              <TrashIcon className="size-3" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {/* Mobile card layout */}
              <div className="space-y-1 px-3 pb-3 md:hidden">
                {sortedTransactions.map((tx) => (
                  <div
                    key={tx.id}
                    className="flex items-center justify-between gap-2 rounded-lg border p-2.5"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <TypeBadge type={tx.type} subType={tx.subType} />
                        <span className="truncate text-xs font-medium">
                          {tx.category ?? "-"}
                        </span>
                      </div>
                      <div className="mt-0.5 flex items-center gap-2 text-[11px] text-muted-foreground">
                        <span className="tabular-nums">{tx.date}</span>
                        {tx.account && <span>{tx.account}</span>}
                      </div>
                      {tx.description && (
                        <div className="mt-0.5 truncate text-[11px] text-muted-foreground">
                          {tx.description}
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="text-right">
                        <div className={`text-sm font-semibold tabular-nums ${tx.type === "INCOME" ? "text-income" : "text-expense"}`}>
                          {tx.amountEur != null ? formatEur(Math.abs(tx.amountEur)) : "-"}
                        </div>
                      {tx.amountOriginal != null && tx.currencyOriginal && tx.currencyOriginal !== "EUR" && (
                        <div className="text-[11px] tabular-nums text-muted-foreground">
                          {formatAmount(Math.abs(tx.amountOriginal), tx.currencyOriginal)}
                        </div>
                      )}
                      </div>
                      <div className="flex flex-col gap-1">
                        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => openEdit(tx)}>
                          <PencilIcon className="size-3" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive" onClick={() => handleDelete(tx.id)}>
                          <TrashIcon className="size-3" />
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between border-t px-3 py-2">
              <Button
                variant="ghost"
                size="sm"
                disabled={page === 0 || isPending}
                onClick={() => goToPage(page - 1)}
              >
                <ChevronLeftIcon className="size-4" />
              </Button>
              <span className="text-xs text-muted-foreground">
                {page + 1} / {totalPages}
              </span>
              <Button
                variant="ghost"
                size="sm"
                disabled={page >= totalPages - 1 || isPending}
                onClick={() => goToPage(page + 1)}
              >
                <ChevronRightIcon className="size-4" />
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Edit Dialog */}
      <Dialog open={editTx !== null} onOpenChange={(open) => !open && setEditTx(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{tc("edit")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs">{t("date")}</Label>
              <Input type="date" value={editDate} onChange={(e) => setEditDate(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">{tc("type")}</Label>
              <select
                className="h-9 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm dark:bg-input/30"
                value={editType}
                onChange={(e) => setEditType(e.target.value)}
              >
                <option value="INCOME">{t("income")}</option>
                <option value="EXPENSE">{t("expense")}</option>
              </select>
            </div>
            <div>
              <Label className="text-xs">{t("account")}</Label>
              <select
                className="h-9 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm dark:bg-input/30"
                value={editAccount}
                onChange={(e) => setEditAccount(e.target.value)}
              >
                <option value="">—</option>
                {accounts.map((a) => (
                  <option key={a.name} value={a.name}>{a.name}</option>
                ))}
              </select>
            </div>
            <div>
              <Label className="text-xs">{t("category")}</Label>
              <select
                className="h-9 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm dark:bg-input/30"
                value={editCategory}
                onChange={(e) => setEditCategory(e.target.value)}
              >
                <option value="">—</option>
                {categories.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
            <div>
              <Label className="text-xs">{t("amount")} (EUR)</Label>
              <Input type="number" step="0.01" value={editAmount} onChange={(e) => setEditAmount(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">{t("note")}</Label>
              <Input value={editDescription} onChange={(e) => setEditDescription(e.target.value)} />
            </div>
            <div className="flex gap-2 pt-2">
              <Button onClick={handleSaveEdit} disabled={editSaving} className="flex-1">
                {editSaving ? <Loader2Icon className="size-4 animate-spin" /> : tc("save")}
              </Button>
              <Button variant="outline" onClick={() => setEditTx(null)}>{tc("cancel")}</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
      <ConfirmDialog
        open={deleteId !== null}
        onOpenChange={(open) => { if (!open) setDeleteId(null); }}
        title={tc("delete_confirm")}
        confirmLabel={tc("delete")}
        cancelLabel={tc("cancel")}
        onConfirm={confirmDeleteTx}
        destructive
      />
    </div>
  );
}

function TypeBadge({ type, subType }: { type: string | null; subType: string | null }) {
  if (subType === "TRANSFER") {
    return <Badge variant="outline" className="text-[10px]">Transfer</Badge>;
  }
  if (type === "INCOME") {
    return <Badge className="bg-income/15 text-income border-0 text-[10px]">Income</Badge>;
  }
  return <Badge className="bg-expense/15 text-expense border-0 text-[10px]">Expense</Badge>;
}
