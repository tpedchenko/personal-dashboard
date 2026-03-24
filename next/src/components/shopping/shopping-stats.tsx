"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from "@/components/ui/accordion";
import { BarChart3 } from "lucide-react";
import { getShoppingStats } from "@/actions/shopping";
import { periodRange, type StatsPeriod, type StatsRow } from "./types";

export function ShoppingStats() {
  const t = useTranslations("list");
  const tCommon = useTranslations("common");
  const tPeriod = useTranslations("period");

  const [statsPeriod, setStatsPeriod] = useState<StatsPeriod>("all");
  const [statsRows, setStatsRows] = useState<StatsRow[] | null>(null);
  const [statsLoading, setStatsLoading] = useState(false);

  async function loadStats(period: StatsPeriod) {
    setStatsLoading(true);
    try {
      const { from, to } = periodRange(period);
      const rows = await getShoppingStats(from, to);
      setStatsRows(rows);
    } finally {
      setStatsLoading(false);
    }
  }

  return (
    <Accordion>
      <AccordionItem value="stats">
        <AccordionTrigger>
          <div className="flex items-center gap-2">
            <BarChart3 className="size-4 text-muted-foreground" />
            <span>{t("stats")}</span>
          </div>
        </AccordionTrigger>
        <AccordionContent>
          <div className="space-y-3">
            {/* Period selector */}
            <div className="flex flex-wrap gap-1">
              {(
                [
                  ["all", tPeriod("all")],
                  ["month", tPeriod("prev_month")],
                  ["3months", "3 " + tCommon("period")],
                  ["year", tPeriod("this_year")],
                ] as [StatsPeriod, string][]
              ).map(([key, label]) => (
                <Button
                  key={key}
                  size="sm"
                  variant={statsPeriod === key ? "default" : "outline"}
                  onClick={() => {
                    setStatsPeriod(key);
                    loadStats(key);
                  }}
                  disabled={statsLoading}
                >
                  {label}
                </Button>
              ))}
            </div>

            {statsRows !== null && (
              <>
                {statsRows.length === 0 ? (
                  <p className="text-muted-foreground text-sm">
                    {t("stats_empty")}
                  </p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-muted-foreground border-b text-xs">
                          <th className="py-1.5 text-left font-medium">
                            {t("stats_item")}
                          </th>
                          <th className="py-1.5 text-center font-medium">
                            {t("stats_count")}
                          </th>
                          <th className="py-1.5 text-right font-medium">
                            {t("stats_last")}
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {statsRows.map((s) => (
                          <tr
                            key={s.itemName}
                            className="border-b last:border-0"
                          >
                            <td className="py-1.5">{s.itemName}</td>
                            <td className="py-1.5 text-center font-semibold">
                              {s.count}
                            </td>
                            <td className="text-muted-foreground py-1.5 text-right text-xs">
                              {s.lastBought.slice(0, 10)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    <p className="text-muted-foreground mt-1 text-xs">
                      {statsRows.length} {t("stats_item").toLowerCase()}
                    </p>
                  </div>
                )}
              </>
            )}
          </div>
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
}
