"use client";

import { useTranslations } from "next-intl";
import { Card, CardContent } from "@/components/ui/card";
import { formatEur } from "./finance-types";
import type { SummaryData, NbuRateData } from "./finance-types";

export interface FinanceSummaryCardsProps {
  summary: SummaryData;
  nbuRates: NbuRateData[];
}

export function FinanceSummaryCards({ summary, nbuRates }: FinanceSummaryCardsProps) {
  const t = useTranslations("finance");

  return (
    <div className={`grid grid-cols-2 gap-3 ${nbuRates.length > 0 ? "md:grid-cols-5" : "md:grid-cols-4"}`}>
      <Card size="sm">
        <CardContent>
          <div className="text-xs text-muted-foreground">{t("income")}</div>
          <div className="text-lg font-semibold text-income">
            {formatEur(summary.totalIncome)}
          </div>
        </CardContent>
      </Card>
      <Card size="sm">
        <CardContent>
          <div className="text-xs text-muted-foreground">{t("expense")}</div>
          <div className="text-lg font-semibold text-expense">
            {formatEur(summary.totalExpenses)}
          </div>
        </CardContent>
      </Card>
      <Card size="sm">
        <CardContent>
          <div className="text-xs text-muted-foreground">{t("balance")}</div>
          <div className="text-lg font-semibold">{formatEur(summary.balance)}</div>
        </CardContent>
      </Card>
      <Card size="sm">
        <CardContent>
          <div className="text-xs text-muted-foreground">
            {t("savings_rate")}
          </div>
          <div className={`text-lg font-semibold ${
            summary.savingsRate >= 50 ? "text-income" :
            summary.savingsRate >= 30 ? "text-yellow-600 dark:text-yellow-400" :
            summary.savingsRate >= 20 ? "text-orange-600 dark:text-orange-400" :
            summary.savingsRate >= 10 ? "text-expense" :
            "text-expense"
          }`}>
            {summary.savingsRate.toFixed(1)}%
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
