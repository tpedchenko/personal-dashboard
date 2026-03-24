"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  exportTransactions,
  exportDailyLogs,
  exportFoodLogs,
  exportWorkouts,
} from "@/actions/export";

function downloadCsv(csv: string, filename: string) {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

type ExportKey = "transactions" | "diary" | "food" | "workouts";

export default function BackupPage() {
  const t = useTranslations("settings");
  const [loading, setLoading] = useState<Record<ExportKey, boolean>>({
    transactions: false,
    diary: false,
    food: false,
    workouts: false,
  });

  async function handleExport(key: ExportKey) {
    setLoading((prev) => ({ ...prev, [key]: true }));
    try {
      let csv: string;
      const today = new Date().toISOString().slice(0, 10);
      switch (key) {
        case "transactions":
          csv = await exportTransactions();
          downloadCsv(csv, `transactions_${today}.csv`);
          break;
        case "diary":
          csv = await exportDailyLogs();
          downloadCsv(csv, `daily_log_${today}.csv`);
          break;
        case "food":
          csv = await exportFoodLogs();
          downloadCsv(csv, `food_log_${today}.csv`);
          break;
        case "workouts":
          csv = await exportWorkouts();
          downloadCsv(csv, `workouts_${today}.csv`);
          break;
      }
    } catch (err) {
      console.error("Export failed:", err);
    } finally {
      setLoading((prev) => ({ ...prev, [key]: false }));
    }
  }

  return (
    <div className="space-y-4">
      <Card className="p-4 space-y-4">
        <h2 className="text-lg font-semibold">{t("export_all")}</h2>
        <p className="text-sm text-muted-foreground">{t("export_desc")}</p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Button
            variant="outline"
            disabled={loading.transactions}
            onClick={() => handleExport("transactions")}
          >
            {loading.transactions ? t("export_transactions_csv") + "..." : t("export_transactions_csv")}
          </Button>
          <Button
            variant="outline"
            disabled={loading.diary}
            onClick={() => handleExport("diary")}
          >
            {loading.diary ? t("export_diary_csv") + "..." : t("export_diary_csv")}
          </Button>
          <Button
            variant="outline"
            disabled={loading.food}
            onClick={() => handleExport("food")}
          >
            {loading.food ? t("export_food_csv") + "..." : t("export_food_csv")}
          </Button>
          <Button
            variant="outline"
            disabled={loading.workouts}
            onClick={() => handleExport("workouts")}
          >
            {loading.workouts ? t("export_workouts_csv") + "..." : t("export_workouts_csv")}
          </Button>
        </div>
      </Card>
    </div>
  );
}
