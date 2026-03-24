"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from "@/components/ui/accordion";
import { History } from "lucide-react";
import { getHistoryByDate } from "@/actions/shopping";
import { toDateStr, type HistoryRow } from "./types";

export function ShoppingHistory() {
  const t = useTranslations("list");
  const tCommon = useTranslations("common");

  const [historyDate, setHistoryDate] = useState(toDateStr(new Date()));
  const [historyRows, setHistoryRows] = useState<HistoryRow[] | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);

  async function loadHistory(date: string) {
    setHistoryLoading(true);
    try {
      const rows = await getHistoryByDate(date);
      setHistoryRows(rows);
    } finally {
      setHistoryLoading(false);
    }
  }

  return (
    <Accordion>
      <AccordionItem value="history">
        <AccordionTrigger>
          <div className="flex items-center gap-2">
            <History className="size-4 text-muted-foreground" />
            <span>{t("purchase_history")}</span>
          </div>
        </AccordionTrigger>
        <AccordionContent>
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Input
                type="date"
                value={historyDate}
                onChange={(e) => setHistoryDate(e.target.value)}
                className="w-44"
              />
              <Button
                size="sm"
                variant="outline"
                onClick={() => loadHistory(historyDate)}
                disabled={historyLoading}
              >
                {historyLoading ? tCommon("loading") : tCommon("search")}
              </Button>
            </div>

            {historyRows !== null && (
              <>
                {historyRows.length === 0 ? (
                  <p className="text-muted-foreground text-sm">
                    {t("no_purchases")}
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
                            {t("quantity")}
                          </th>
                          <th className="py-1.5 text-right font-medium">
                            {t("bought_by")}
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {historyRows.map((h) => (
                          <tr key={h.id} className="border-b last:border-0">
                            <td className="py-1.5">{h.itemName}</td>
                            <td className="py-1.5 text-center">
                              {h.quantity && h.quantity !== "1"
                                ? `x${h.quantity}`
                                : ""}
                            </td>
                            <td className="text-muted-foreground py-1.5 text-right text-xs">
                              {h.boughtBy || ""}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
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
