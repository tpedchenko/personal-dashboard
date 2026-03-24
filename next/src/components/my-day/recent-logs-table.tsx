"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { ChevronDownIcon, ChevronRightIcon } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ErrorBoundary } from "@/components/shared/error-boundary";
import { EmptyState } from "@/components/shared/empty-state";
import { formatKidsHours } from "@/lib/utils";
import { RecentLogEntry } from "./types";

interface RecentLogsTableProps {
  recentLogs: RecentLogEntry[];
  recentLogsOpen: boolean;
  onToggle: () => void;
  onCellSave: (logDate: string, field: string, value: number | undefined) => void;
}

export function RecentLogsTable({
  recentLogs,
  recentLogsOpen,
  onToggle,
  onCellSave,
}: RecentLogsTableProps) {
  const t = useTranslations("my_day");
  const tc = useTranslations("common");

  const [editingCell, setEditingCell] = useState<{ date: string; field: string } | null>(null);
  const [editValue, setEditValue] = useState("");

  const handleCellEdit = (logDate: string, field: string, currentValue: number | null) => {
    setEditingCell({ date: logDate, field });
    if (field === "kidsHours") {
      setEditValue(String(currentValue != null ? Math.round(currentValue * 60) : ""));
    } else {
      setEditValue(String(currentValue ?? ""));
    }
  };

  const handleCellSaveInternal = (logDate: string, field: string) => {
    const numValue = editValue === "" ? undefined : Number(editValue);
    if (editValue !== "" && isNaN(numValue!)) {
      setEditingCell(null);
      return;
    }
    const saveValue = field === "kidsHours" && numValue != null
      ? Math.round((numValue / 60) * 100) / 100
      : numValue;
    setEditingCell(null);
    onCellSave(logDate, field, saveValue);
  };

  return (
    <ErrorBoundary moduleName="Recent Logs">
      <Card>
        <CardHeader
          className="cursor-pointer select-none"
          onClick={onToggle}
        >
          <CardTitle className="flex items-center gap-2">
            {recentLogsOpen ? (
              <ChevronDownIcon className="size-5" />
            ) : (
              <ChevronRightIcon className="size-5" />
            )}
            {t("recent_records")}
          </CardTitle>
        </CardHeader>
        {recentLogsOpen && (
          <CardContent>
            {recentLogs.length === 0 ? (
              <EmptyState title={tc("no_data")} />
            ) : (
              <div className="overflow-x-auto scroll-fade">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left py-2 px-1 font-medium">{tc("date")}</th>
                      <th className="text-center py-2 px-1 font-medium">{t("mood_change")}</th>
                      <th className="text-center py-2 px-1 font-medium">{t("energy")}</th>
                      <th className="text-center py-2 px-1 font-medium">{t("stress")}</th>
                      <th className="text-center py-2 px-1 font-medium">{t("focus")}</th>
                      <th className="text-center py-2 px-1 font-medium">{t("kids_time")}</th>
                      <th className="text-center py-2 px-1 font-medium">Sex</th>
                      <th className="text-center py-2 px-1 font-medium">BJ</th>
                      <th className="text-center py-2 px-1 font-medium">{t("alcohol")}</th>
                      <th className="text-center py-2 px-1 font-medium">{t("caffeine")}</th>
                      <th className="text-center py-2 px-1 font-medium">{t("mood")} lvl</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recentLogs.map((log) => {
                      const editableFields = [
                        { key: "moodDelta", value: log.moodDelta },
                        { key: "energyLevel", value: log.energyLevel },
                        { key: "stressLevel", value: log.stressLevel },
                        { key: "focusQuality", value: log.focusQuality },
                        { key: "kidsHours", value: log.kidsHours },
                        { key: "sexCount", value: log.sexCount },
                        { key: "bjCount", value: log.bjCount },
                        { key: "alcohol", value: log.alcohol },
                        { key: "caffeine", value: log.caffeine },
                      ];
                      return (
                        <tr key={log.date} className="border-b last:border-0 hover:bg-muted/50">
                          <td className="py-2 px-1 font-mono text-xs">{log.date}</td>
                          {editableFields.map(({ key, value }) => (
                            <td key={key} className="text-center py-2 px-1">
                              {editingCell?.date === log.date && editingCell?.field === key ? (
                                <Input
                                  type="number"
                                  value={editValue}
                                  onChange={(e) => setEditValue(e.target.value)}
                                  onBlur={() => handleCellSaveInternal(log.date, key)}
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter") handleCellSaveInternal(log.date, key);
                                    if (e.key === "Escape") setEditingCell(null);
                                  }}
                                  className="w-16 h-9 text-center text-sm mx-auto focus:ring-2 focus:ring-primary"
                                  autoFocus
                                />
                              ) : (
                                <span
                                  className="cursor-pointer hover:bg-muted px-2 py-2 rounded min-h-[36px] inline-flex items-center"
                                  onClick={() => handleCellEdit(log.date, key, value)}
                                >
                                  {key === "kidsHours" && value != null
                                    ? formatKidsHours(value)
                                    : (value ?? "-")}
                                </span>
                              )}
                            </td>
                          ))}
                          <td className="text-center py-2 px-1">
                            <span className={
                              log.level != null
                                ? log.level >= 2 ? "text-income" : log.level < 0 ? "text-expense" : "text-muted-foreground"
                                : "text-muted-foreground"
                            }>
                              {log.level != null ? log.level.toFixed(1) : "-"}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        )}
      </Card>
    </ErrorBoundary>
  );
}
