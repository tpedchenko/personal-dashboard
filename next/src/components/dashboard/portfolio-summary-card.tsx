"use client";

import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import { TrendingUpIcon } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/shared/empty-state";
import type { PortfolioHistoryPoint } from "./portfolio-history-chart";

export function PortfolioSummaryCard({ onHistoryLoaded }: { onHistoryLoaded?: (data: PortfolioHistoryPoint[]) => void }) {
  const tDash = useTranslations("dashboard");
  const [data, setData] = useState<{ totalPortfolio: number; totalPnl: number; positionsCount: number } | null>(null);

  useEffect(() => {
    fetch("/api/capital").then(r => r.ok ? r.json() : null).then(d => {
      if (d) {
        setData({ totalPortfolio: d.totalPortfolio ?? 0, totalPnl: d.totalPnl ?? 0, positionsCount: d.positionsCount ?? 0 });
        // Save today's snapshot
        fetch("/api/portfolio-snapshot", { method: "POST" }).catch(() => {});
      }
    }).catch(() => {});
    // Load portfolio history
    import("@/actions/finance/portfolio-snapshots").then(({ getPortfolioHistory }) => {
      getPortfolioHistory(90).then(history => {
        if (onHistoryLoaded && history.length > 0) onHistoryLoaded(history);
      });
    }).catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!data || (data.totalPortfolio === 0 && data.positionsCount === 0)) {
    return (
      <Card>
        <CardContent>
          <EmptyState
            icon={TrendingUpIcon}
            title={tDash("connect_broker_hint")}
          />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="pt-4">
        <div className="grid grid-cols-3 gap-4 text-center">
          <div>
            <p className="text-xs text-muted-foreground">{tDash("portfolio")}</p>
            <p className="text-lg font-bold">EUR {data.totalPortfolio.toLocaleString("en", { minimumFractionDigits: 2 })}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">{tDash("pnl")}</p>
            <p className={`text-lg font-bold ${data.totalPnl >= 0 ? "text-income" : "text-expense"}`}>
              {data.totalPnl >= 0 ? "+" : ""}EUR {data.totalPnl.toLocaleString("en", { minimumFractionDigits: 2 })}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">{tDash("positions")}</p>
            <p className="text-lg font-bold">{data.positionsCount}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
