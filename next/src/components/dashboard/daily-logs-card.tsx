"use client";

import { useTranslations } from "next-intl";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatKidsHours } from "@/lib/utils";

export interface DailyLog {
  date: string;
  moodDelta: number | null;
  energyLevel: number | null;
  stressLevel: number | null;
  focusQuality: number | null;
  kidsHours: number | null;
  sexCount: number | null;
  bjCount: number | null;
  alcohol: number | null;
  caffeine: number | null;
  level: number | null;
}

interface DailyLogsCardProps {
  isOpen: boolean;
  onToggle: () => void;
  logs: DailyLog[] | null;
  isPending: boolean;
}

export function DailyLogsCard({ isOpen, onToggle, logs, isPending }: DailyLogsCardProps) {
  const t = useTranslations("dashboard");

  return (
    <Card>
      <CardHeader
        className="cursor-pointer select-none"
        onClick={onToggle}
      >
        <CardTitle className="text-base flex items-center gap-2">
          {isOpen ? "\u25BC" : "\u25B6"} {t("daily_records") || "\u0417\u0430\u043F\u0438\u0441\u0438 \u044F\u043A\u043E\u0441\u0442\u0456 \u0436\u0438\u0442\u0442\u044F"}
        </CardTitle>
      </CardHeader>
      {isOpen && logs && (
        <CardContent>
          <div className="overflow-x-auto max-h-96">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-background">
                <tr className="border-b">
                  <th className="text-left py-1.5 px-1">{t("date_col")}</th>
                  <th className="text-center py-1.5 px-1">{t("mood")}</th>
                  <th className="text-center py-1.5 px-1">{t("energy")}</th>
                  <th className="text-center py-1.5 px-1">{t("stress")}</th>
                  <th className="text-center py-1.5 px-1">{t("focus")}</th>
                  <th className="text-center py-1.5 px-1">{t("kids")}</th>
                  <th className="text-center py-1.5 px-1">{t("sex")}</th>
                  <th className="text-center py-1.5 px-1">{t("bj")}</th>
                  <th className="text-center py-1.5 px-1">{t("alc")}</th>
                  <th className="text-center py-1.5 px-1">{t("caf")}</th>
                  <th className="text-center py-1.5 px-1">{t("level")}</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => (
                  <tr key={log.date} className="border-b last:border-0 hover:bg-muted/50">
                    <td className="py-1.5 px-1 font-mono">{log.date}</td>
                    <td className="text-center py-1.5 px-1">{log.moodDelta ?? "\u2014"}</td>
                    <td className="text-center py-1.5 px-1">{log.energyLevel ?? "\u2014"}</td>
                    <td className="text-center py-1.5 px-1">{log.stressLevel ?? "\u2014"}</td>
                    <td className="text-center py-1.5 px-1">{log.focusQuality ?? "\u2014"}</td>
                    <td className="text-center py-1.5 px-1">{log.kidsHours != null ? formatKidsHours(log.kidsHours) : "\u2014"}</td>
                    <td className="text-center py-1.5 px-1">{log.sexCount ?? "\u2014"}</td>
                    <td className="text-center py-1.5 px-1">{log.bjCount ?? "\u2014"}</td>
                    <td className="text-center py-1.5 px-1">{log.alcohol ?? "\u2014"}</td>
                    <td className="text-center py-1.5 px-1">{log.caffeine ?? "\u2014"}</td>
                    <td className="text-center py-1.5 px-1">
                      <span className={log.level != null ? (log.level >= 2 ? "text-income" : log.level < 0 ? "text-expense" : "") : ""}>
                        {log.level != null ? Number(log.level).toFixed(1) : "\u2014"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      )}
    </Card>
  );
}
