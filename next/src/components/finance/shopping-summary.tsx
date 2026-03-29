"use client";

import { useMemo } from "react";
import { useTranslations } from "next-intl";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { type BigPurchaseData } from "@/actions/finance/shopping";

interface ShoppingSummaryProps {
  items: BigPurchaseData[];
}

export function ShoppingSummary({ items }: ShoppingSummaryProps) {
  const t = useTranslations("big_purchases");

  const { totalPlanned, investigating, coolingOff, ready } = useMemo(() => {
    let total = 0;
    let inv = 0;
    let cool = 0;
    let rdy = 0;

    for (const item of items) {
      if (item.estimatedPrice) total += item.estimatedPrice;
      if (item.status === "investigating") inv++;
      if (item.status === "cooling_off") cool++;
      if (item.status === "ready") rdy++;
    }

    return { totalPlanned: total, investigating: inv, coolingOff: cool, ready: rdy };
  }, [items]);

  return (
    <div className="grid gap-3 sm:gap-4 sm:grid-cols-4">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            {t("total_planned")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-2xl font-bold tabular-nums">
            {totalPlanned.toFixed(2)} EUR
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            {t("status_investigating")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-2xl font-bold tabular-nums">{investigating}</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            {t("status_cooling_off")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-2xl font-bold tabular-nums">{coolingOff}</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            {t("status_ready")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-2xl font-bold tabular-nums">{ready}</p>
        </CardContent>
      </Card>
    </div>
  );
}
