"use client";

import { useTranslations } from "next-intl";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { MonthlyDeepDive } from "@/actions/dashboard";

interface ExpenseBreakdownCardProps {
  deepDive: MonthlyDeepDive;
}

export function ExpenseBreakdownCard({ deepDive }: ExpenseBreakdownCardProps) {
  const t = useTranslations("dashboard");

  if (deepDive.categoryBreakdown.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Expense Breakdown</CardTitle>
        <p className="text-sm text-muted-foreground">
          {t("total_expenses_label")}: <span className="font-semibold text-red-400">EUR {deepDive.totalExpenses.toLocaleString("en")}</span>
          {" "} | {t("avg_per_day")}: <span className="font-semibold text-red-400">EUR {deepDive.avgDailyExpense.toLocaleString("en")}</span>
        </p>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {deepDive.categoryBreakdown.map((row) => {
            const barWidth = deepDive.categoryBreakdown[0]
              ? Math.round((row.amount / deepDive.categoryBreakdown[0].amount) * 100)
              : 0;
            return (
              <div key={row.category}>
                <div className="flex justify-between text-sm mb-1">
                  <span>{row.category}</span>
                  <span className="text-muted-foreground">
                    EUR {row.amount.toLocaleString("en")}
                    <span className="text-xs ml-1 opacity-60">{row.percentage}%</span>
                  </span>
                </div>
                <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                  <div
                    className="h-full rounded-full bg-red-400/70"
                    style={{ width: `${barWidth}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
