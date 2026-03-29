"use client";

import { useTranslations } from "next-intl";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatEur } from "./finance-types";
import type { SummaryData } from "./finance-types";
import { EmptyState } from "@/components/shared/empty-state";

export interface CategoryBreakdownCardProps {
  summary: SummaryData;
}

export function CategoryBreakdownCard({ summary }: CategoryBreakdownCardProps) {
  const t = useTranslations("finance");
  const tc = useTranslations("common");

  return (
    <Card size="sm">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">{t("category_breakdown")}</CardTitle>
      </CardHeader>
      <CardContent>
        {summary.byCategory.length === 0 ? (
          <EmptyState title={tc("no_data")} compact />
        ) : (
          <>
            <div className="mb-3 text-xs font-medium text-muted-foreground">
              {t("total_expenses")}: <span className="text-expense font-semibold">{formatEur(summary.totalExpenses)}</span>
            </div>
            <div className="space-y-2.5">
              {summary.byCategory.map((cat) => {
                const pct =
                  summary.totalExpenses > 0
                    ? (cat.total / summary.totalExpenses) * 100
                    : 0;
                const catBudget = (cat as { budget?: number | null }).budget;
                const budgetPct = catBudget && catBudget > 0 ? (cat.total / catBudget) * 100 : null;
                const barColor = budgetPct == null
                  ? "bg-primary/80"
                  : budgetPct > 100
                    ? "bg-red-500"
                    : budgetPct > 75
                      ? "bg-yellow-500"
                      : "bg-green-500";
                return (
                  <div key={cat.category}>
                    <div className="flex items-center justify-between text-xs mb-1">
                      <Link
                        href={`/finance/transactions?category=${encodeURIComponent(cat.category)}`}
                        className="hover:underline text-muted-foreground hover:text-foreground transition-colors font-medium"
                      >
                        {cat.category}
                      </Link>
                      <span className="font-semibold tabular-nums">
                        {formatEur(cat.total)}
                        {catBudget ? <span className="text-muted-foreground font-normal"> / {formatEur(catBudget)}</span> : ""}
                        <span className="text-muted-foreground font-normal ml-1">({pct.toFixed(0)}%)</span>
                      </span>
                    </div>
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted/80 relative">
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${barColor}`}
                        style={{ width: `${budgetPct != null ? Math.min(budgetPct, 100) : Math.min(pct, 100)}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
