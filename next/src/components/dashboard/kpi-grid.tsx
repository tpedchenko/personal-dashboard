"use client";

import {
  ArrowUpIcon,
  ArrowDownIcon,
  MinusIcon,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { Card, CardContent } from "@/components/ui/card";

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

export interface ChangeInfo {
  pct: number;
  direction: "up" | "down" | "flat";
}

export interface KpiCardProps {
  title: string;
  value: string;
  subtitle?: string;
  icon: React.ReactNode;
  change?: ChangeInfo | null;
  improvementDirection?: "up" | "down" | "neutral";
}

export interface KpiGridProps {
  cards: KpiCardProps[];
}

/* ------------------------------------------------------------------ */
/* ChangeIndicator                                                     */
/* ------------------------------------------------------------------ */

function ChangeIndicator({
  change,
  improvementDirection,
  suffix = "",
}: {
  change: ChangeInfo | null;
  improvementDirection: "up" | "down" | "neutral";
  suffix?: string;
}) {
  const t = useTranslations("dashboard");
  if (!change) return <p className="text-xs text-muted-foreground">{t("no_previous_data")}</p>;
  if (change.direction === "flat") {
    return (
      <div className="flex items-center gap-1">
        <MinusIcon className="h-3 w-3 text-muted-foreground" />
        <span className="text-xs text-muted-foreground">{t("no_change")} {suffix}</span>
      </div>
    );
  }

  const isImprovement =
    improvementDirection === "neutral"
      ? null
      : improvementDirection === "up"
        ? change.direction === "up"
        : change.direction === "down";

  const colorClass =
    isImprovement === null
      ? "text-muted-foreground"
      : isImprovement
        ? "text-income"
        : "text-expense";

  const Arrow = change.direction === "up" ? ArrowUpIcon : ArrowDownIcon;

  return (
    <div className="flex items-center gap-1">
      <Arrow className={`h-3 w-3 ${colorClass}`} />
      <span className={`text-xs ${colorClass}`}>
        {change.pct}% {suffix}
      </span>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* KpiCard                                                             */
/* ------------------------------------------------------------------ */

function KpiCard({
  title,
  value,
  subtitle,
  icon,
  change,
  improvementDirection = "up",
  index = 0,
}: KpiCardProps & { index?: number }) {
  const t = useTranslations("dashboard");
  return (
    <Card className={`metric-card stagger-${Math.min(index + 1, 6)}`} data-testid={`kpi-${title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "")}`}>
      <CardContent className="pt-3 pb-2.5 px-3 sm:pt-4 sm:pb-3 sm:px-4">
        <div className="flex items-center justify-between mb-1 sm:mb-1.5">
          <span className="text-[11px] sm:text-xs font-medium text-muted-foreground uppercase tracking-wide truncate">
            {title}
          </span>
          <span className="text-muted-foreground/60 hidden sm:inline">{icon}</span>
        </div>
        <p className="text-lg sm:text-2xl font-bold tracking-tight truncate">{value}</p>
        {subtitle && (
          <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>
        )}
        {change !== undefined && (
          <div className="mt-1">
          <ChangeIndicator
            change={change ?? null}
            improvementDirection={improvementDirection}
            suffix={t("vs_previous")}
          />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/* KpiGrid                                                             */
/* ------------------------------------------------------------------ */

export function KpiGrid({ cards }: KpiGridProps) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 xl:grid-cols-8 gap-2.5 sm:gap-3">
      {cards.map((card, i) => (
        <KpiCard key={i} {...card} index={i} />
      ))}
    </div>
  );
}
