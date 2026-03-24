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
import { PasswordInput } from "@/components/ui/password-input";
import { Switch } from "@/components/ui/switch";
import { useDemoMode } from "@/hooks/use-demo-mode";

export default function BunqIntegrationPage() {
  const isDemo = useDemoMode();
  const t = useTranslations("settings");
  const tc = useTranslations("common");
  const [isPending, startTransition] = useTransition();
  const [token, setToken] = useState("");
  const [saved, setSaved] = useState(false);
  const [hasExisting, setHasExisting] = useState(false);
  const [autoSync, setAutoSync] = useState(false);
  const [lastSync, setLastSync] = useState<string | null>(null);
  const [instructionsOpen, setInstructionsOpen] = useState(false);

  useEffect(() => {
    startTransition(async () => {
      const val = await getSecret("bunq_api_token");
      if (val) {
        setToken(val);
        setHasExisting(true);
      }

      const syncMode = await getUserPreference("bunq_sync_mode");
      setAutoSync(syncMode === "auto");

      const lastSyncVal = await getUserPreference("bunq_last_sync");
      if (lastSyncVal) {
        setLastSync(lastSyncVal);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleSave() {
    if (!token.trim()) return;
    startTransition(async () => {
      await setSecret("bunq_api_token", token.trim());
      await setUserPreference(
        "bunq_sync_mode",
        autoSync ? "auto" : "manual"
      );
      setSaved(true);
      setHasExisting(true);
      setTimeout(() => setSaved(false), 3000);
    });
  }

  function handleSyncModeToggle(checked: boolean) {
    setAutoSync(checked);
    startTransition(async () => {
      await setUserPreference(
        "bunq_sync_mode",
        checked ? "auto" : "manual"
      );
    });
  }

  return (
    <div className="space-y-4">
      {isDemo && <p className="text-xs text-muted-foreground">Read-only in demo mode</p>}
      <h2 className="text-lg font-semibold">{t("integration_bunq")}</h2>

      <Card className="p-4 space-y-4">
        <div className="flex items-center gap-2">
          <span className="font-medium">{t("bunq_status")}:</span>
          <Badge variant={hasExisting ? "default" : "secondary"}>
            {hasExisting
              ? t("integration_status_connected")
              : t("integration_status_not_configured")}
          </Badge>
        </div>

        {lastSync && (
          <p className="text-sm text-muted-foreground">
            {t("last_sync")}: {lastSync}
          </p>
        )}

        <div>
          <Label>{t("bunq_api_token")}</Label>
          <PasswordInput
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder="Paste bunq API token"
          />
        </div>

        <div className="flex items-center justify-between">
          <Label htmlFor="bunq-sync-mode" className="cursor-pointer">
            {autoSync ? "Auto" : "Manual"}
          </Label>
          <Switch
            id="bunq-sync-mode"
            checked={autoSync}
            onCheckedChange={handleSyncModeToggle}
          />
        </div>

        <div className="flex gap-2">
          <Button onClick={handleSave} disabled={isDemo || isPending || !token.trim()}>
            {tc("save")}
          </Button>
          {hasExisting && (
            <Button variant="outline" disabled={isDemo || isPending} onClick={() => alert("bunq sync is handled by the background scheduler.")}>
              {t("sync_now")}
            </Button>
          )}
        </div>

        {saved && (
          <p className="text-sm text-green-600">{tc("success")}</p>
        )}
      </Card>

      <Card className="p-4 space-y-2">
        <button
          type="button"
          className="flex w-full items-center justify-between font-medium"
          onClick={() => setInstructionsOpen((prev) => !prev)}
        >
          {t("how_to_setup")}
          <span className="text-muted-foreground text-sm">
            {instructionsOpen ? "−" : "+"}
          </span>
        </button>
        {instructionsOpen && (
          <p className="text-sm text-muted-foreground whitespace-pre-line">
            {t("bunq_setup_instructions")}
          </p>
        )}
      </Card>
    </div>
  );
}
