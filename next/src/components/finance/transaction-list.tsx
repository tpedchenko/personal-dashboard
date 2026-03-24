"use client";

import { useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useTranslations } from "next-intl";
import {
  PlusIcon,
  Trash2Icon,
  PencilIcon,
  SearchIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ChevronDownIcon,
  DownloadIcon,
  WalletIcon,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { formatAmount } from "./finance-types";
import type { Transaction, AccountData } from "./finance-types";

export interface TransactionListProps {
  transactions: Transaction[];
  totalCount: number;
  page: number;
  totalPages: number;
  selectedIds: Set<number>;
  isPending: boolean;
  // Filter state
  filterType: string;
  filterAccount: string;
  filterCategory: string;
  searchQuery: string;
  periodCategories: string[];
  accounts: AccountData[];
  // Filter handlers
  onFilterTypeChange: (v: string) => void;
  onFilterAccountChange: (v: string) => void;
  onFilterCategoryChange: (v: string) => void;
  onSearchQueryChange: (v: string) => void;
  onApplyFilters: () => void;
  // Selection handlers
  onToggleSelect: (id: number) => void;
  onToggleSelectAll: () => void;
  // Action handlers
  onDelete: (id: number) => void;
  onBulkDelete: () => void;
  onEdit: (tx: Transaction) => void;
  onExportCsv: () => void;
  onGoToPage: (p: number) => void;
  // Add dialog
  addDialogOpen: boolean;
  onAddDialogOpenChange: (open: boolean) => void;
  onResetForm: () => void;
  renderTransactionForm: (onSubmit: () => void, submitLabel: string) => React.ReactNode;
  onAdd: () => void;
}

export function TransactionList({
  transactions,
  totalCount,
  page,
  totalPages,
  selectedIds,
  isPending,
  filterType,
  filterAccount,
  filterCategory,
  searchQuery,
  periodCategories,
  accounts,
  onFilterTypeChange,
  onFilterAccountChange,
  onFilterCategoryChange,
  onSearchQueryChange,
  onApplyFilters,
  onToggleSelect,
  onToggleSelectAll,
  onDelete,
  onBulkDelete,
  onEdit,
  onExportCsv,
  onGoToPage,
  addDialogOpen,
  onAddDialogOpenChange,
  onResetForm,
  renderTransactionForm,
  onAdd,
}: TransactionListProps) {
  const t = useTranslations("finance");
  const tc = useTranslations("common");

  const [isOpen, setIsOpen] = useState(false);

  const ROW_HEIGHT = 40;
  const TABLE_MAX_HEIGHT = 600;

  const tableParentRef = useRef<HTMLDivElement>(null);
  const mobileParentRef = useRef<HTMLDivElement>(null);

  const tableVirtualizer = useVirtualizer({
    count: transactions.length,
    getScrollElement: () => tableParentRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 5,
  });

  const mobileVirtualizer = useVirtualizer({
    count: transactions.length,
    getScrollElement: () => mobileParentRef.current,
    estimateSize: () => 80,
    overscan: 5,
  });

  const typeBadgeVariant = (type: string | null) => {
    switch (type) {
      case "INCOME":
        return "default" as const;
      case "EXPENSE":
        return "destructive" as const;
      case "TRANSFER":
        return "secondary" as const;
      default:
        return "outline" as const;
    }
  };

  const typeLabel = (type: string | null) => {
    switch (type) {
      case "INCOME":
        return t("income");
      case "EXPENSE":
        return t("expense");
      case "TRANSFER":
        return t("transfer");
      default:
        return type ?? "";
    }
  };

  return (
    <Card>
      <CardHeader
        className="cursor-pointer select-none"
        onClick={() => setIsOpen((v) => !v)}
      >
        <CardTitle className="flex items-center gap-2">
          <ChevronDownIcon
            className={`size-5 transition-transform ${isOpen ? "" : "-rotate-90"}`}
          />
          {t("recent_entries")}
          <Badge variant="secondary" className="ml-1 text-xs">
            {totalCount}
          </Badge>
        </CardTitle>
      </CardHeader>
      {isOpen && (<>
      {/* ===== Filters ===== */}
      <Card size="sm" className="mx-4 mb-3 border shadow-none">
        <CardContent>
          <div className="flex flex-wrap items-end gap-2">
            {/* Type */}
            <div className="grid gap-1">
              <Label className="text-xs">{tc("type")}</Label>
              <Select
                value={filterType}
                onValueChange={(v) => onFilterTypeChange(v as string)}
              >
                <SelectTrigger size="sm" className="w-[110px]">
                  <SelectValue placeholder={tc("all")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">{tc("all")}</SelectItem>
                  <SelectItem value="INCOME">{t("income")}</SelectItem>
                  <SelectItem value="EXPENSE">{t("expense")}</SelectItem>
                  <SelectItem value="TRANSFER">{t("transfer")}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Account */}
            <div className="grid gap-1">
              <Label className="text-xs">{tc("account")}</Label>
              <Select
                value={filterAccount}
                onValueChange={(v) => onFilterAccountChange(v as string)}
              >
                <SelectTrigger size="sm" className="w-[130px]">
                  <SelectValue placeholder={t("all_accounts")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">{t("all_accounts")}</SelectItem>
                  {accounts.map((a) => (
                    <SelectItem key={a.id} value={a.name}>
                      {a.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Category */}
            <div className="grid gap-1">
              <Label className="text-xs">{t("category")}</Label>
              <Select
                value={filterCategory}
                onValueChange={(v) => onFilterCategoryChange(v as string)}
              >
                <SelectTrigger size="sm" className="w-[130px]">
                  <SelectValue placeholder={tc("all")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">{tc("all")}</SelectItem>
                  {periodCategories.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Search */}
            <div className="grid gap-1">
              <Label className="text-xs">{tc("search")}</Label>
              <div className="relative">
                <SearchIcon className="absolute left-2 top-1/2 size-3 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={searchQuery}
                  onChange={(e) => onSearchQueryChange(e.target.value)}
                  placeholder={tc("search")}
                  className="h-7 w-[140px] pl-7 text-xs"
                  onKeyDown={(e) => e.key === "Enter" && onApplyFilters()}
                />
              </div>
            </div>

            <Button size="sm" onClick={onApplyFilters} disabled={isPending}>
              {tc("filter")}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* ===== Transactions Table ===== */}
      <div data-testid="transaction-list" className="px-4">
        <div className="flex items-center justify-between mb-3">
          <div />
          <div className="flex gap-2">
            {selectedIds.size > 0 && (
              <Button
                variant="destructive"
                size="sm"
                onClick={onBulkDelete}
                disabled={isPending}
              >
                <Trash2Icon className="mr-1 size-3" />
                {tc("delete")} ({selectedIds.size})
              </Button>
            )}

            {/* CSV Export */}
            <Button
              variant="outline"
              size="sm"
              onClick={onExportCsv}
              disabled={isPending}
            >
              <DownloadIcon className="mr-1 size-3" />
              CSV
            </Button>

            {/* Add dialog (bottom sheet) */}
            <Sheet open={addDialogOpen} onOpenChange={onAddDialogOpenChange}>
              <SheetTrigger
                render={<Button size="sm" onClick={onResetForm} />}
              >
                <PlusIcon className="mr-1 size-3" />
                {tc("add")}
              </SheetTrigger>
              <SheetContent side="bottom" className="max-h-[85dvh] overflow-y-auto">
                <SheetHeader>
                  <SheetTitle>{t("add_expense")}</SheetTitle>
                </SheetHeader>
                {renderTransactionForm(onAdd, tc("save"))}
              </SheetContent>
            </Sheet>
          </div>
        </div>
        <CardContent>
          {transactions.length === 0 ? (
            <div className="py-12 text-center">
              <WalletIcon className="mx-auto size-10 text-muted-foreground/40 mb-3" />
              <p className="text-muted-foreground">{t("no_transactions")}</p>
              <Button
                variant="outline"
                size="sm"
                className="mt-3"
                onClick={() => { onResetForm(); onAddDialogOpenChange(true); }}
              >
                <PlusIcon className="mr-1 size-3" />
                {tc("add")}
              </Button>
            </div>
          ) : (
            <>
              {/* Mobile card view — virtualized */}
              <div
                ref={mobileParentRef}
                className="sm:hidden overflow-auto"
                style={{ maxHeight: TABLE_MAX_HEIGHT }}
              >
                <div
                  style={{
                    height: `${mobileVirtualizer.getTotalSize()}px`,
                    width: "100%",
                    position: "relative",
                  }}
                >
                  {mobileVirtualizer.getVirtualItems().map((virtualRow) => {
                    const tx = transactions[virtualRow.index];
                    return (
                      <div
                        key={tx.id}
                        className="flex items-center gap-3 rounded-lg border p-3 absolute left-0 w-full"
                        data-state={selectedIds.has(tx.id) ? "selected" : undefined}
                        style={{
                          top: 0,
                          height: `${virtualRow.size}px`,
                          transform: `translateY(${virtualRow.start}px)`,
                        }}
                      >
                        <Checkbox
                          checked={selectedIds.has(tx.id)}
                          onCheckedChange={() => onToggleSelect(tx.id)}
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between">
                            <span className="text-xs text-muted-foreground">{tx.date}</span>
                            <span
                              className={`text-sm font-medium tabular-nums ${
                                tx.subType === "TRANSFER"
                                  ? "text-blue-600 dark:text-blue-400"
                                  : tx.type === "INCOME"
                                    ? "text-income"
                                    : tx.type === "EXPENSE"
                                      ? "text-expense"
                                      : ""
                              }`}
                            >
                              {tx.subType === "TRANSFER" ? "\u21C4 " : tx.type === "INCOME" ? "+" : tx.type === "EXPENSE" ? "-" : ""}
                              {formatAmount(Math.abs(tx.amountOriginal ?? tx.amountEur ?? 0), tx.currencyOriginal ?? "EUR")}
                            </span>
                          </div>
                          <div className="flex items-center justify-between mt-1">
                            <span className="text-sm font-medium truncate">{tx.category ?? "\u2014"}</span>
                            <Badge
                              variant={typeBadgeVariant(tx.subType === "TRANSFER" ? "TRANSFER" : tx.type)}
                              className="text-[10px] ml-2"
                            >
                              {typeLabel(tx.subType === "TRANSFER" ? "TRANSFER" : tx.type)}
                            </Badge>
                          </div>
                          {tx.description && (
                            <p className="text-xs text-muted-foreground mt-0.5 truncate">{tx.description}</p>
                          )}
                        </div>
                        <div className="flex flex-col gap-1">
                          <Button variant="ghost" size="icon-xs" onClick={() => onEdit(tx)}>
                            <PencilIcon className="size-3" />
                            <span className="sr-only">{tc("edit")}</span>
                          </Button>
                          <Button variant="ghost" size="icon-xs" onClick={() => onDelete(tx.id)}>
                            <Trash2Icon className="size-3" />
                            <span className="sr-only">{tc("delete")}</span>
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Desktop table view — virtualized */}
              <div className="hidden sm:block">
                <div
                  ref={tableParentRef}
                  className="relative w-full overflow-auto"
                  style={{ maxHeight: TABLE_MAX_HEIGHT }}
                >
                  <table className="w-full caption-bottom text-sm">
                    <thead className="[&_tr]:border-b sticky top-0 bg-background z-10">
                      <tr className="border-b transition-colors">
                        <th className="h-10 px-2 text-left align-middle font-medium whitespace-nowrap text-foreground w-8 [&:has([role=checkbox])]:pr-0">
                          <Checkbox
                            checked={
                              transactions.length > 0 &&
                              selectedIds.size === transactions.length
                            }
                            onCheckedChange={onToggleSelectAll}
                          />
                        </th>
                        <th className="h-10 px-2 text-left align-middle font-medium whitespace-nowrap text-foreground text-xs">{t("date")}</th>
                        <th className="h-10 px-2 text-left align-middle font-medium whitespace-nowrap text-foreground hidden sm:table-cell text-xs">{tc("type")}</th>
                        <th className="h-10 px-2 text-left align-middle font-medium whitespace-nowrap text-foreground hidden lg:table-cell text-xs">{t("account")}</th>
                        <th className="h-10 px-2 text-left align-middle font-medium whitespace-nowrap text-foreground text-xs">{t("category")}</th>
                        <th className="h-10 px-2 text-left align-middle font-medium whitespace-nowrap text-foreground text-right text-xs">{t("amount")}</th>
                        <th className="h-10 px-2 text-left align-middle font-medium whitespace-nowrap text-foreground hidden md:table-cell text-xs">
                          {tc("description")}
                        </th>
                        <th className="h-10 px-2 text-left align-middle font-medium whitespace-nowrap text-foreground w-16 sm:w-20" />
                      </tr>
                    </thead>
                    <tbody
                      className="[&_tr:last-child]:border-0"
                      style={{
                        height: `${tableVirtualizer.getTotalSize()}px`,
                        position: "relative",
                      }}
                    >
                      {tableVirtualizer.getVirtualItems().map((virtualRow) => {
                        const tx = transactions[virtualRow.index];
                        return (
                          <tr
                            key={tx.id}
                            data-state={selectedIds.has(tx.id) ? "selected" : undefined}
                            className="border-b transition-colors hover:bg-muted/50 data-[state=selected]:bg-muted"
                            style={{
                              position: "absolute",
                              top: 0,
                              left: 0,
                              width: "100%",
                              height: `${virtualRow.size}px`,
                              transform: `translateY(${virtualRow.start}px)`,
                            }}
                          >
                            <td className="p-2 align-middle whitespace-nowrap [&:has([role=checkbox])]:pr-0">
                              <Checkbox
                                checked={selectedIds.has(tx.id)}
                                onCheckedChange={() => onToggleSelect(tx.id)}
                              />
                            </td>
                            <td className="p-2 align-middle whitespace-nowrap text-xs">{tx.date}</td>
                            <td className="p-2 align-middle whitespace-nowrap hidden sm:table-cell">
                              <Badge
                                variant={typeBadgeVariant(tx.subType === "TRANSFER" ? "TRANSFER" : tx.type)}
                                className="text-[10px]"
                              >
                                {typeLabel(tx.subType === "TRANSFER" ? "TRANSFER" : tx.type)}
                              </Badge>
                            </td>
                            <td className="p-2 align-middle whitespace-nowrap hidden lg:table-cell text-xs">
                              {tx.account ?? "\u2014"}
                            </td>
                            <td className="p-2 align-middle whitespace-nowrap text-xs max-w-[100px] sm:max-w-none truncate">
                              {tx.category ?? "\u2014"}
                            </td>
                            <td
                              className={`p-2 align-middle whitespace-nowrap text-right text-xs font-medium ${
                                tx.subType === "TRANSFER"
                                  ? "text-blue-600 dark:text-blue-400"
                                  : tx.type === "INCOME"
                                    ? "text-income"
                                    : tx.type === "EXPENSE"
                                      ? "text-expense"
                                      : ""
                              }`}
                            >
                              {tx.subType === "TRANSFER"
                                ? "\u21C4 "
                                : tx.type === "INCOME"
                                  ? "+"
                                  : tx.type === "EXPENSE"
                                    ? "-"
                                    : ""}
                              {formatAmount(Math.abs(tx.amountOriginal ?? tx.amountEur ?? 0), tx.currencyOriginal ?? "EUR")}
                            </td>
                            <td className="p-2 align-middle whitespace-nowrap hidden max-w-[200px] truncate text-xs text-muted-foreground md:table-cell">
                              {tx.description ?? ""}
                            </td>
                            <td className="p-2 align-middle whitespace-nowrap">
                              <div className="flex gap-1">
                                <Button
                                  variant="ghost"
                                  size="icon-xs"
                                  onClick={() => onEdit(tx)}
                                >
                                  <PencilIcon className="size-3" />
                                  <span className="sr-only">{tc("edit")}</span>
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon-xs"
                                  onClick={() => onDelete(tx.id)}
                                >
                                  <Trash2Icon className="size-3" />
                                  <span className="sr-only">{tc("delete")}</span>
                                </Button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="mt-3 flex items-center justify-center gap-2">
                  <Button
                    variant="outline"
                    size="icon-sm"
                    disabled={page === 0}
                    onClick={() => onGoToPage(page - 1)}
                  >
                    <ChevronLeftIcon className="size-4" />
                    <span className="sr-only">{tc("previous")}</span>
                  </Button>
                  <span className="text-xs text-muted-foreground">
                    {tc("page_of", { page: page + 1, total: totalPages })}
                  </span>
                  <Button
                    variant="outline"
                    size="icon-sm"
                    disabled={page >= totalPages - 1}
                    onClick={() => onGoToPage(page + 1)}
                  >
                    <ChevronRightIcon className="size-4" />
                    <span className="sr-only">{tc("next")}</span>
                  </Button>
                </div>
              )}
            </>
          )}
        </CardContent>
      </div>
      </>)}
    </Card>
  );
}
