"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { getDataOverview, type DataOverview } from "@/actions/admin-data";

type Props = {
  isPending: boolean;
  onFixCurrencyConversion: () => void;
};

export function AdminDataFixesTab({ isPending, onFixCurrencyConversion }: Props) {
  const t = useTranslations("admin");
  const [data, setData] = useState<DataOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getDataOverview().then((d) => {
      setData(d);
      setLoading(false);
    }).catch((e) => {
      setError(e instanceof Error ? e.message : String(e));
      setLoading(false);
    });
  }, []);

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <h2 className="text-lg font-semibold mb-3">{t("data_fixes")}</h2>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium">Fix UAH/USD → EUR conversion</p>
            <p className="text-xs text-muted-foreground">Recalculates amountEur for non-EUR transactions</p>
          </div>
          <Button variant="outline" size="sm" onClick={onFixCurrencyConversion} disabled={isPending}>Run fix</Button>
        </div>
      </Card>

      <Card className="p-4">
        <h2 className="text-lg font-semibold mb-3">
          Data Overview {data && <span className="text-muted-foreground font-normal text-sm">({data.categories.reduce((sum, cat) => sum + cat.tables.reduce((s, t) => s + t.count, 0), 0).toLocaleString()} records)</span>}
        </h2>
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading...</p>
        ) : data ? (
          <div className="space-y-4">
            {data.categories.map((cat) => {
              const catTotal = cat.tables.reduce((s, t) => s + t.count, 0);
              return (
                <div key={cat.title}>
                  <h3 className="text-sm font-medium mb-2">{cat.icon} {cat.title} <span className="text-muted-foreground font-normal">({catTotal.toLocaleString()})</span></h3>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b"><th className="text-left p-1.5 font-medium">Table</th><th className="text-right p-1.5 font-medium">Records</th></tr>
                      </thead>
                      <tbody>
                        {cat.tables.map((tbl) => (
                          <tr key={tbl.name} className="border-b border-border/30">
                            <td className="p-1.5 font-mono">{tbl.label ?? tbl.name}</td>
                            <td className="text-right p-1.5 tabular-nums">{tbl.count.toLocaleString()}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              );
            })}

            {data.integrations.length > 0 && (
              <div>
                <h3 className="text-sm font-medium mb-2">🔗 Integration Settings</h3>
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b"><th className="text-left p-1.5 font-medium">Integration</th><th className="text-left p-1.5 font-medium">Keys</th><th className="text-right p-1.5 font-medium">Users</th></tr>
                  </thead>
                  <tbody>
                    {data.integrations.map((int) => (
                      <tr key={int.integration} className="border-b border-border/30">
                        <td className="p-1.5 font-medium">{int.integration}</td>
                        <td className="p-1.5 text-muted-foreground">{int.keys.join(", ")}</td>
                        <td className="text-right p-1.5 tabular-nums">{int.users}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {Object.keys(data.perUser).length > 0 && (() => {
              const perUserTableKeys = ["transactions", "daily_log", "garmin_daily", "gym_workouts", "food_log", "broker_positions", "chat_history", "shopping_items"];
              const perUserHeaders = ["Txns", "Daily", "Garmin", "Gym", "Food", "Broker", "Chat", "Shop"];
              const userEntries = Object.entries(data.perUser).sort((a, b) => b[1].total - a[1].total);
              return (
                <div>
                  <h3 className="text-sm font-medium mb-2">👤 Per User</h3>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b">
                          <th className="text-left p-1.5 font-medium">User</th>
                          {perUserHeaders.map((h) => (
                            <th key={h} className="text-right p-1.5 font-medium">{h}</th>
                          ))}
                          <th className="text-right p-1.5 font-medium">Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {userEntries.map(([uid, u]) => (
                          <tr key={uid} className="border-b border-border/30">
                            <td className="p-1.5" title={u.email}>{u.name || u.email}</td>
                            {perUserTableKeys.map((key) => (
                              <td key={key} className="text-right p-1.5 tabular-nums">{(u.tables[key] ?? 0).toLocaleString()}</td>
                            ))}
                            <td className="text-right p-1.5 tabular-nums font-medium">{u.total.toLocaleString()}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              );
            })()}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Failed to load data{error && `: ${error}`}</p>
        )}
      </Card>
    </div>
  );
}
