"use client";

import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

type MonitoringData = {
  transactions: number;
  dailyLogs: number;
  foodLogs: number;
  workouts: number;
  users: number;
  dataFrom: string | null;
  dataTo: string | null;
};

type ErrorLog = {
  id: number;
  userEmail: string;
  details: string | null;
  createdAt: Date | null;
};

type Props = {
  monitoring: MonitoringData | null;
  errorLogs: ErrorLog[];
  isPending: boolean;
  onClearErrorLogs: () => void;
};

export function AdminMonitoringTab({
  monitoring,
  errorLogs,
  isPending,
  onClearErrorLogs,
}: Props) {
  const t = useTranslations("admin");

  return (
    <div className="space-y-4">
      {/* Database Statistics */}
      {monitoring && (
        <Card className="p-4">
          <h2 className="text-lg font-semibold mb-3">{t("monitoring")}</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
            <div className="text-center">
              <p className="text-2xl font-bold">{monitoring.transactions.toLocaleString("en")}</p>
              <p className="text-xs text-muted-foreground">{t("stat_transactions")}</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold">{monitoring.dailyLogs.toLocaleString("en")}</p>
              <p className="text-xs text-muted-foreground">{t("stat_daily_logs")}</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold">{monitoring.foodLogs.toLocaleString("en")}</p>
              <p className="text-xs text-muted-foreground">{t("stat_food_logs")}</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold">{monitoring.workouts.toLocaleString("en")}</p>
              <p className="text-xs text-muted-foreground">{t("stat_workouts")}</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold">{monitoring.users}</p>
              <p className="text-xs text-muted-foreground">{t("stat_total_users")}</p>
            </div>
          </div>
          {monitoring.dataFrom && monitoring.dataTo && (
            <p className="text-sm text-muted-foreground mt-3">
              {t("data_range")}: {monitoring.dataFrom} — {monitoring.dataTo}
            </p>
          )}
        </Card>
      )}

      {/* Error Logs */}
      <Card className="p-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold">Error Logs ({errorLogs.length})</h2>
          {errorLogs.length > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={onClearErrorLogs}
              disabled={isPending}
            >
              Clear all
            </Button>
          )}
        </div>
        {errorLogs.length === 0 ? (
          <p className="text-sm text-muted-foreground">No errors logged</p>
        ) : (
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {errorLogs.map((err) => (
              <div key={err.id} className="p-2 rounded-md bg-red-500/5 border border-red-500/20 text-sm">
                <div className="flex justify-between text-xs text-muted-foreground mb-1">
                  <span>{err.userEmail}</span>
                  <span>{err.createdAt ? new Date(err.createdAt).toLocaleString("en") : ""}</span>
                </div>
                <pre className="text-xs whitespace-pre-wrap break-all">{err.details}</pre>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
