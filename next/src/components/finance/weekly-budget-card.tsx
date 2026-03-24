"use client";

import { useTranslations } from "next-intl";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { formatEur } from "./finance-types";
import type { WeeklyBudgetData } from "./finance-types";

export interface WeeklyBudgetCardProps {
  weeklyBudget: NonNullable<WeeklyBudgetData>;
}

export function WeeklyBudgetCard({ weeklyBudget }: WeeklyBudgetCardProps) {
  const t = useTranslations("finance");

  const pct =
    weeklyBudget.discretionaryBudget > 0
      ? (weeklyBudget.discretionarySpent / weeklyBudget.discretionaryBudget) * 100
      : 0;
  const now = new Date();
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const todayDay = now.getDate();
  const dayPct = (todayDay / daysInMonth) * 100;

  return (
    <Card size="sm">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">{t("auto_budget")}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">{t("monthly_limit")}</span>
            <span className="font-medium">{formatEur(weeklyBudget.monthlyLimit)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">{t("mandatory_spent")}</span>
            <span className="font-medium">{formatEur(weeklyBudget.mandatorySpent)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">{t("discretionary_spent")}</span>
            <span className="font-medium">{formatEur(weeklyBudget.discretionarySpent)}</span>
          </div>
          <Separator />
          <div className="flex justify-between">
            <span className="text-muted-foreground">{t("discretionary_remaining")}</span>
            <span
              className={`font-semibold ${
                weeklyBudget.remaining >= 0
                  ? "text-income"
                  : "text-expense"
              }`}
            >
              {formatEur(weeklyBudget.remaining)}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">
              {t("weekly_available")}
            </span>
            <span
              className={`font-bold ${
                weeklyBudget.weeklyBudget >= 0
                  ? "text-income"
                  : "text-expense"
              }`}
            >
              {formatEur(weeklyBudget.weeklyBudget)}
            </span>
          </div>
          {/* Pace indicator with day markers */}
          <div className="mt-1">
            <div className="relative h-2 w-full overflow-hidden rounded-full bg-muted">
              <div
                className={`h-full rounded-full transition-all ${
                  pct > 100 ? "bg-red-500" : pct > 75 ? "bg-yellow-500" : "bg-green-500"
                }`}
                style={{ width: `${Math.min(pct, 100)}%` }}
              />
              {/* Today marker */}
              <div
                className="absolute top-0 h-full w-0.5 bg-red-500"
                style={{ left: `${dayPct}%` }}
              />
            </div>
            <div className="mt-0.5 text-xs text-muted-foreground text-right">
              {pct > 100
                ? t("pace_over")
                : pct > 75
                  ? t("pace_caution")
                  : t("pace_good")}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
