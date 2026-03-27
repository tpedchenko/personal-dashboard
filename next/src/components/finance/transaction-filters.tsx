"use client";

import { useTranslations } from "next-intl";
import { SearchIcon, FilterIcon } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import type { AccountData } from "./finance-types";

interface TransactionFiltersProps {
  dateFrom: string;
  dateTo: string;
  filterAccount: string;
  filterCategory: string;
  filterType: string;
  searchQuery: string;
  accounts: AccountData[];
  categories: string[];
  isPending: boolean;
  onDateFromChange: (v: string) => void;
  onDateToChange: (v: string) => void;
  onFilterAccountChange: (v: string) => void;
  onFilterCategoryChange: (v: string) => void;
  onFilterTypeChange: (v: string) => void;
  onSearchQueryChange: (v: string) => void;
  onApply: () => void;
}

export function TransactionFilters({
  dateFrom,
  dateTo,
  filterAccount,
  filterCategory,
  filterType,
  searchQuery,
  accounts,
  categories,
  isPending,
  onDateFromChange,
  onDateToChange,
  onFilterAccountChange,
  onFilterCategoryChange,
  onFilterTypeChange,
  onSearchQueryChange,
  onApply,
}: TransactionFiltersProps) {
  const t = useTranslations("finance");
  const tc = useTranslations("common");

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") onApply();
  };

  return (
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
              onChange={(e) => onDateFromChange(e.target.value)}
              onKeyDown={handleKeyDown}
            />
          </div>

          {/* Date To */}
          <div>
            <label className="mb-1 block text-xs text-muted-foreground">{t("date")} ({tc("to")})</label>
            <Input
              type="date"
              value={dateTo}
              onChange={(e) => onDateToChange(e.target.value)}
              onKeyDown={handleKeyDown}
            />
          </div>

          {/* Account */}
          <div>
            <label className="mb-1 block text-xs text-muted-foreground">{t("account")}</label>
            <select
              className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
              value={filterAccount}
              onChange={(e) => onFilterAccountChange(e.target.value)}
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
              onChange={(e) => onFilterCategoryChange(e.target.value)}
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
              onChange={(e) => onFilterTypeChange(e.target.value)}
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
                onChange={(e) => onSearchQueryChange(e.target.value)}
                onKeyDown={handleKeyDown}
                className="pl-8"
              />
            </div>
          </div>

          {/* Apply button */}
          <div className="flex items-end">
            <Button onClick={onApply} disabled={isPending} className="w-full">
              {isPending ? tc("loading") : tc("apply")}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
