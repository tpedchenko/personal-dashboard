"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { signOut } from "next-auth/react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  exportTransactions,
  exportDailyLogs,
  exportFoodLogs,
  exportWorkouts,
} from "@/actions/export";
import { deleteUserAccount } from "@/actions/settings";

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

export default function PrivacySettingsPage() {
  const t = useTranslations("settings");
  const [exporting, setExporting] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [deleting, setDeleting] = useState(false);

  async function handleExportAll() {
    setExporting(true);
    try {
      const today = new Date().toISOString().slice(0, 10);
      const [txCsv, diaryCsv, foodCsv, workoutCsv] = await Promise.all([
        exportTransactions(),
        exportDailyLogs(),
        exportFoodLogs(),
        exportWorkouts(),
      ]);
      downloadCsv(txCsv, `transactions_${today}.csv`);
      downloadCsv(diaryCsv, `daily_log_${today}.csv`);
      downloadCsv(foodCsv, `food_log_${today}.csv`);
      downloadCsv(workoutCsv, `workouts_${today}.csv`);
      toast.success(t("export_my_data"));
    } catch {
      toast.error("Export failed");
    } finally {
      setExporting(false);
    }
  }

  async function handleDeleteAccount() {
    if (confirmText !== "DELETE") {
      toast.error(t("delete_confirm_error"));
      return;
    }
    setDeleting(true);
    try {
      await deleteUserAccount();
      await signOut({ callbackUrl: "/" });
    } catch {
      toast.error("Failed to delete account");
      setDeleting(false);
    }
  }

  return (
    <div className="space-y-4">
      {/* Export All Data */}
      <Card className="p-4 space-y-3">
        <h2 className="text-lg font-semibold">{t("export_my_data")}</h2>
        <p className="text-sm text-muted-foreground">
          {t("export_csv")}
        </p>
        <Button
          variant="outline"
          onClick={handleExportAll}
          disabled={exporting}
        >
          {exporting ? "..." : t("download_zip")}
        </Button>
      </Card>

      {/* Delete Account */}
      <Card className="p-4 space-y-3 border-destructive/50">
        <h2 className="text-lg font-semibold text-destructive">
          {t("delete_account")}
        </h2>
        <p className="text-sm text-muted-foreground">
          {t("delete_warning")}
        </p>
        <div className="space-y-2">
          <Label>{t("delete_confirm_prompt")}</Label>
          <Input
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            placeholder="DELETE"
            className="max-w-xs"
          />
        </div>
        <Button
          variant="destructive"
          onClick={handleDeleteAccount}
          disabled={deleting || confirmText !== "DELETE"}
        >
          {deleting ? "..." : t("delete_account_btn")}
        </Button>
      </Card>
    </div>
  );
}
