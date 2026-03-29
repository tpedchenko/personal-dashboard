"use client";

import { useTranslations } from "next-intl";
import { TargetIcon } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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

  const statusColor = pct > 100 ? "text-red-500" : pct > 75 ? "text-yellow-500" : "text-green-500";
  const barColor = pct > 100 ? "bg-red-500" : pct > 75 ? "bg-yellow-500" : "bg-green-500";

  return (
    <Card size="sm">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm">
          <TargetIcon className="size-4" />
          {t("auto_budget")}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-2.5 text-sm">
          {/* Main remaining amount - prominent display */}
          <div className="flex items-baseline justify-between">
            <span className="text-muted-foreground font-medium">{t("discretionary_remaining")}</span>
            <span className={`text-xl font-bold tabular-nums ${weeklyBudget.remaining >= 0 ? "text-income" : "text-expense"}`}>
              {formatEur(weeklyBudget.remaining)}
            </span>
          </div>

          {/* Progress bar with today marker */}
          <div className="relative h-2.5 w-full overflow-hidden rounded-full bg-muted">
            <div
              className={`h-full rounded-full transition-all duration-500 ${barColor}`}
              style={{ width: `${Math.min(pct, 100)}%` }}
            />
            <div
              className="absolute top-1/2 -translate-y-1/2 w-3.5 h-3.5 rounded-full bg-foreground/80 border-2 border-background shadow-md"
              style={{ left: `${dayPct}%`, marginLeft: "-7px" }}
            />
          </div>
          <div className="flex justify-between text-[11px] text-muted-foreground">
            <span>{t("discretionary_spent")}: {formatEur(weeklyBudget.discretionarySpent)}</span>
            <span className={statusColor}>{pct.toFixed(0)}%</span>
          </div>

          {/* Details in compact rows */}
          <div className="pt-1 border-t border-border/50 space-y-1">
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">{t("monthly_limit")}</span>
              <span className="font-medium tabular-nums">{formatEur(weeklyBudget.monthlyLimit)}</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">{t("mandatory_spent")}</span>
              <span className="font-medium tabular-nums">{formatEur(weeklyBudget.mandatorySpent)}</span>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
