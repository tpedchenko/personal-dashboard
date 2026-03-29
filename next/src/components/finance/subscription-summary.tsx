"use client";

import { useMemo } from "react";
import { useTranslations } from "next-intl";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { type SubscriptionData } from "@/actions/finance/subscriptions";

function toMonthly(amount: number, cycle: string): number {
  if (cycle === "yearly") return amount / 12;
  if (cycle === "weekly") return amount * (52 / 12);
  return amount;
}

interface SubscriptionSummaryProps {
  subscriptions: SubscriptionData[];
}

export function SubscriptionSummary({ subscriptions }: SubscriptionSummaryProps) {
  const t = useTranslations("subscriptions");

  const { monthlyCost, yearlyCost, byCategory } = useMemo(() => {
    let monthly = 0;
    const catMap: Record<string, number> = {};

    for (const sub of subscriptions) {
      const m = toMonthly(sub.amount, sub.billingCycle);
      monthly += m;
      const cat = sub.category || "other";
      catMap[cat] = (catMap[cat] || 0) + m;
    }

    return {
      monthlyCost: monthly,
      yearlyCost: monthly * 12,
      byCategory: Object.entries(catMap)
        .sort((a, b) => b[1] - a[1])
        .map(([category, amount]) => ({ category, amount })),
    };
  }, [subscriptions]);

  return (
    <div className="grid gap-3 sm:gap-4 sm:grid-cols-3">
      {/* Monthly Cost */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            {t("monthly_cost")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-2xl font-bold tabular-nums">
            {monthlyCost.toFixed(2)} EUR
          </p>
        </CardContent>
      </Card>

      {/* Yearly Cost */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            {t("yearly_cost")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-2xl font-bold tabular-nums">
            {yearlyCost.toFixed(2)} EUR
          </p>
        </CardContent>
      </Card>

      {/* Active count */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            {t("active_subscriptions")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-2xl font-bold tabular-nums">{subscriptions.length}</p>
        </CardContent>
      </Card>

      {/* Category breakdown */}
      {byCategory.length > 0 && (
        <Card className="sm:col-span-3">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {t("by_category")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-2 sm:grid-cols-2 md:grid-cols-3">
              {byCategory.map(({ category, amount }) => (
                <div
                  key={category}
                  className="flex items-center justify-between rounded-md border px-3 py-2"
                >
                  <span className="text-sm capitalize">
                    {t.has(category) ? t(category as Parameters<typeof t>[0]) : category}
                  </span>
                  <span className="text-sm font-medium tabular-nums">
                    {amount.toFixed(2)} EUR/mo
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
