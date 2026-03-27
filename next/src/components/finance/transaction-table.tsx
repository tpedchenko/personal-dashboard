"use client";

import { useTranslations } from "next-intl";
import Link from "next/link";
import { ArrowUpDownIcon, PencilIcon, TrashIcon, ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import type { Transaction } from "./finance-types";
import { formatEur, formatAmount } from "./finance-types";

type SortField = "date" | "amountEur" | "category";
type SortDir = "asc" | "desc";

function TypeBadge({ type, subType }: { type: string | null; subType: string | null }) {
  if (subType === "TRANSFER") {
    return <Badge variant="outline" className="text-[10px]">Transfer</Badge>;
  }
  if (type === "INCOME") {
    return <Badge className="bg-income/15 text-income border-0 text-[10px]">Income</Badge>;
  }
  return <Badge className="bg-expense/15 text-expense border-0 text-[10px]">Expense</Badge>;
}

interface TransactionTableProps {
  transactions: Transaction[];
  totalCount: number;
  page: number;
  totalPages: number;
  sortField: SortField;
  sortDir: SortDir;
  isPending: boolean;
  onSort: (field: SortField) => void;
  onGoToPage: (p: number) => void;
  onEdit: (tx: Transaction) => void;
  onDelete: (id: number) => void;
}

export type { SortField, SortDir };

export function TransactionTable({
  transactions,
  totalCount,
  page,
  totalPages,
  sortField,
  sortDir,
  isPending,
  onSort,
  onGoToPage,
  onEdit,
  onDelete,
}: TransactionTableProps) {
  const t = useTranslations("finance");
  const tc = useTranslations("common");

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

  return (
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
                        onClick={() => onSort("date")}
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
                        onClick={() => onSort("category")}
                      >
                        {t("category")}
                        {sortField === "category" && <ArrowUpDownIcon className="size-3" />}
                      </button>
                    </TableHead>
                    <TableHead className="text-right">
                      <button
                        className="ml-auto flex items-center gap-1 hover:text-foreground"
                        onClick={() => onSort("amountEur")}
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
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onEdit(tx)}>
                            <PencilIcon className="size-3" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => onDelete(tx.id)}>
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
                      <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => onEdit(tx)}>
                        <PencilIcon className="size-3" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive" onClick={() => onDelete(tx.id)}>
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
              onClick={() => onGoToPage(page - 1)}
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
              onClick={() => onGoToPage(page + 1)}
            >
              <ChevronRightIcon className="size-4" />
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
