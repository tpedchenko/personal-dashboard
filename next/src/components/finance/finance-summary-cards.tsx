"use client";

import { useTranslations } from "next-intl";
import {
  TrendingUpIcon,
  TrendingDownIcon,
  ScaleIcon,
  PiggyBankIcon,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { formatEur } from "./finance-types";
import type { SummaryData, NbuRateData } from "./finance-types";

export interface FinanceSummaryCardsProps {
  summary: SummaryData;
  nbuRates: NbuRateData[];
}

export function FinanceSummaryCards({ summary, nbuRates }: FinanceSummaryCardsProps) {
  const t = useTranslations("finance");

  const cards = [
    {
      label: t("income"),
      value: formatEur(summary.totalIncome),
      colorClass: "text-income",
      icon: TrendingUpIcon,
      iconBg: "bg-green-500/10 text-green-600 dark:text-green-400",
    },
    {
      label: t("expense"),
      value: formatEur(summary.totalExpenses),
      colorClass: "text-expense",
      icon: TrendingDownIcon,
      iconBg: "bg-red-500/10 text-red-600 dark:text-red-400",
    },
    {
      label: t("balance"),
      value: formatEur(summary.balance),
      colorClass: summary.balance >= 0 ? "text-income" : "text-expense",
      icon: ScaleIcon,
      iconBg: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
    },
    {
      label: t("savings_rate"),
      value: `${summary.savingsRate.toFixed(1)}%`,
      colorClass:
        summary.savingsRate >= 50 ? "text-income" :
        summary.savingsRate >= 30 ? "text-yellow-600 dark:text-yellow-400" :
        summary.savingsRate >= 20 ? "text-orange-600 dark:text-orange-400" :
        "text-expense",
      icon: PiggyBankIcon,
      iconBg:
        summary.savingsRate >= 50 ? "bg-green-500/10 text-green-600 dark:text-green-400" :
        summary.savingsRate >= 30 ? "bg-yellow-500/10 text-yellow-600 dark:text-yellow-400" :
        "bg-red-500/10 text-red-600 dark:text-red-400",
    },
  ];

  return (
    <div className={`grid grid-cols-2 gap-2.5 sm:gap-3 ${nbuRates.length > 0 ? "md:grid-cols-5" : "md:grid-cols-4"}`}>
      {cards.map((card, i) => (
        <Card size="sm" key={i} className={`metric-card stagger-${Math.min(i + 1, 6)}`}>
          <CardContent>
            <div className="flex items-center gap-2 mb-1.5">
              <div className={`rounded-lg p-1.5 ${card.iconBg}`}>
                <card.icon className="size-3.5" />
              </div>
              <span className="text-[11px] sm:text-xs font-medium text-muted-foreground uppercase tracking-wide">
                {card.label}
              </span>
            </div>
            <div className={`text-xl sm:text-2xl font-bold tracking-tight ${card.colorClass}`}>
              {card.value}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
