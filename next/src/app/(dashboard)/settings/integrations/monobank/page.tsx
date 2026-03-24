"use client";

import { useEffect, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import {
  getSecret,
  setSecret,
  getUserPreference,
  setUserPreference,
} from "@/actions/settings";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { ChevronDown, ChevronUp } from "lucide-react";
import { useDemoMode } from "@/hooks/use-demo-mode";

export default function MonobankIntegrationPage() {
  const isDemo = useDemoMode();
  const t = useTranslations("settings");
  const [isPending, startTransition] = useTransition();
  const [token, setToken] = useState("");
  const [saved, setSaved] = useState(false);
  const [hasExisting, setHasExisting] = useState(false);
  const [syncAuto, setSyncAuto] = useState(true);
  const [lastSync, setLastSync] = useState<string | null>(null);
  const [instructionsOpen, setInstructionsOpen] = useState(false);

  useEffect(() => {
    startTransition(async () => {
      const [val, syncMode, lastSyncVal] = await Promise.all([
        getSecret("monobank_token"),
        getUserPreference("monobank_sync_mode"),
        getUserPreference("monobank_last_sync"),
      ]);
      if (val) {
        setToken(val);
        setHasExisting(true);
      }
      if (syncMode !== null) {
        setSyncAuto(syncMode === "auto");
      }
      setLastSync(lastSyncVal);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleSave() {
    if (!token.trim()) return;
    startTransition(async () => {
      await setSecret("monobank_token", token.trim());
      await setUserPreference(
        "monobank_sync_mode",
        syncAuto ? "auto" : "manual"
      );
      setSaved(true);
      setHasExisting(true);
      setTimeout(() => setSaved(false), 3000);
    });
  }

  function handleSyncModeChange(checked: boolean) {
    setSyncAuto(checked);
  }

  /** Mask all but last 4 characters */
  function maskToken(val: string) {
    if (val.length <= 4) return val;
    return "*".repeat(val.length - 4) + val.slice(-4);
  }

  return (
    <div className="space-y-4">
      {isDemo && <p className="text-xs text-muted-foreground">Read-only in demo mode</p>}
      <div className="flex items-center gap-3">
        <h2 className="text-lg font-semibold">{t("integration_monobank")}</h2>
        <Badge variant={hasExisting ? "default" : "secondary"}>
          {hasExisting
            ? t("integration_status_connected")
            : t("integration_status_not_configured")}
        </Badge>
      </div>

      <Card className="p-4 space-y-4">
        {/* Token input */}
        <div className="space-y-1.5">
          <Label htmlFor="monobank-token">{t("monobank_token")}</Label>
          <Input
            id="monobank-token"
            type="password"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder={
              hasExisting ? maskToken(token) : "Paste Monobank API token"
            }
          />
        </div>

        {/* Sync mode toggle */}
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label htmlFor="sync-mode">
              {syncAuto
                ? "\uD83D\uDD04 Auto (every 10 min)"
                : "\uD83D\uDC46 Manual only"}
            </Label>
          </div>
          <Switch
            id="sync-mode"
            checked={syncAuto}
            onCheckedChange={handleSyncModeChange}
          />
        </div>

        {/* Last sync */}
        {lastSync && (
          <p className="text-sm text-muted-foreground">
            {t("last_sync")}: {lastSync}
          </p>
        )}

        {/* Save & Sync buttons */}
        <div className="flex items-center gap-3">
          <Button onClick={handleSave} disabled={isDemo || isPending || !token.trim()}>
            {isPending ? "..." : "Save"}
          </Button>
          <Button
            variant="outline"
            onClick={() => {
              startTransition(async () => {
                try {
                  const res = await fetch("/api/sync/monobank", { method: "POST" });
                  const data = await res.json();
                  if (data.error) {
                    alert(data.error);
                  } else {
                    await setUserPreference("monobank_last_sync", new Date().toISOString());
                    setLastSync(new Date().toISOString());
                    alert(`Synced: ${data.synced ?? 0} new, ${data.skipped ?? 0} skipped`);
                  }
                } catch { alert("Sync failed"); }
              });
            }}
            disabled={isDemo || isPending || !hasExisting}
          >
            {t("sync_now")}
          </Button>
          {saved && (
            <span className="text-sm text-green-600 dark:text-green-400">
              Saved!
            </span>
          )}
        </div>
      </Card>

      {/* Setup instructions (expandable) */}
      <Card className="p-4">
        <button
          type="button"
          className="flex w-full items-center justify-between text-left"
          onClick={() => setInstructionsOpen((o) => !o)}
        >
          <h3 className="font-medium">{t("how_to_setup")}</h3>
          {instructionsOpen ? (
            <ChevronUp className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          )}
        </button>
        {instructionsOpen && (
          <p className="mt-3 text-sm text-muted-foreground whitespace-pre-line">
            {t("monobank_setup_instructions")}
          </p>
        )}
      </Card>
    </div>
  );
}
