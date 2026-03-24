"use client";

import { useEffect, useState, useTransition } from "react";
import { useSession } from "next-auth/react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import {
  getSecret,
  setSecret,
  getUserPreference,
  setUserPreference,
  checkWithingsData,
  generateWithingsOAuthState,
} from "@/actions/settings";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useDemoMode } from "@/hooks/use-demo-mode";

export default function WithingsIntegrationPage() {
  const isDemo = useDemoMode();
  const t = useTranslations("settings");
  const tc = useTranslations("common");
  const { data: session } = useSession();
  const [isPending, startTransition] = useTransition();

  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [connected, setConnected] = useState(false);
  const [autoSync, setAutoSync] = useState(false);
  const [lastSync, setLastSync] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [dataCheckResult, setDataCheckResult] = useState<string | null>(null);

  useEffect(() => {
    startTransition(async () => {
      const [token, id, secret, syncMode, syncTime] = await Promise.all([
        getSecret("withings_access_token"),
        getSecret("withings_client_id"),
        getSecret("withings_client_secret"),
        getUserPreference("withings_sync_mode"),
        getUserPreference("withings_last_sync"),
      ]);
      setConnected(!!token);
      if (id) setClientId(id);
      if (secret) setClientSecret(secret);
      setAutoSync(syncMode === "auto");
      setLastSync(syncTime);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleSave() {
    if (!clientId.trim() || !clientSecret.trim()) return;
    startTransition(async () => {
      await setSecret("withings_client_id", clientId.trim());
      await setSecret("withings_client_secret", clientSecret.trim());
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    });
  }

  function handleSyncToggle(checked: boolean) {
    setAutoSync(checked);
    startTransition(async () => {
      await setUserPreference(
        "withings_sync_mode",
        checked ? "auto" : "manual",
      );
    });
  }

  return (
    <div className="space-y-4">
      {isDemo && <p className="text-xs text-muted-foreground">Read-only in demo mode</p>}
      <h2 className="text-lg font-semibold">{t("integration_withings")}</h2>

      <Card className="p-4 space-y-4">
        <div className="flex items-center gap-2">
          <span className="font-medium">{t("withings_status")}:</span>
          <Badge variant={connected ? "default" : "secondary"}>
            {connected
              ? t("integration_status_connected")
              : t("integration_status_not_configured")}
          </Badge>
        </div>

        {lastSync && (
          <p className="text-sm text-muted-foreground">
            {t("last_sync")}: {lastSync}
          </p>
        )}

        <div className="flex items-center gap-3">
          <Switch
            id="sync-mode"
            checked={autoSync}
            onCheckedChange={handleSyncToggle}
            disabled={isDemo || isPending}
          />
          <Label htmlFor="sync-mode">
            {autoSync ? "Auto" : "Manual"}
          </Label>
        </div>

        <div className="space-y-1">
          <Label>Client ID</Label>
          <Input
            value={clientId}
            onChange={(e) => setClientId(e.target.value)}
            placeholder="Withings Client ID"
          />
        </div>

        <div className="space-y-1">
          <Label>Client Secret</Label>
          <Input
            type="password"
            value={clientSecret}
            onChange={(e) => setClientSecret(e.target.value)}
            placeholder="Withings Client Secret"
          />
        </div>

        <div className="flex gap-2">
          <Button
            onClick={handleSave}
            disabled={
              isPending || !clientId.trim() || !clientSecret.trim()
            }
          >
            {tc("save")}
          </Button>

          <Button
            variant="outline"
            onClick={() => {
              if (!clientId.trim()) { toast.error("Enter Client ID first"); return; }
              startTransition(async () => {
                const state = await generateWithingsOAuthState();
                const redirectUri = `${window.location.origin}/api/sync/withings/callback`;
                const params = new URLSearchParams({
                  response_type: "code",
                  client_id: clientId.trim(),
                  redirect_uri: redirectUri,
                  scope: "user.metrics",
                  state,
                });
                window.location.href = `https://account.withings.com/oauth2_user/authorize2?${params}`;
              });
            }}
            disabled={isDemo || isPending || !clientId.trim()}
          >
            {t("withings_connect")}
          </Button>

          {connected && (
            <Button
              variant="outline"
              onClick={() => {
                startTransition(async () => {
                  try {
                    const res = await fetch("/api/sync/withings", { method: "POST" });
                    const data = await res.json();
                    if (data.error) toast.error(data.error);
                    else {
                      await setUserPreference("withings_last_sync", new Date().toISOString());
                      setLastSync(new Date().toISOString());
                      toast.success(`Synced: ${data.measurements ?? 0} measurements`);
                    }
                  } catch { toast.error("Sync failed"); }
                });
              }}
              disabled={isDemo || isPending}
            >
              {t("sync_now")}
            </Button>
          )}

          <Button
            variant="outline"
            onClick={() => {
              startTransition(async () => {
                try {
                  const result = await checkWithingsData();
                  setDataCheckResult(result.message);
                  if (result.found) {
                    toast.success(result.message);
                  } else {
                    toast.info(result.message);
                  }
                } catch {
                  toast.error("Failed to check data");
                }
              });
            }}
            disabled={isDemo || isPending}
          >
            Check Data
          </Button>
        </div>

        {saved && (
          <p className="text-sm text-green-600">{tc("success")}</p>
        )}

        {dataCheckResult && (
          <p className="text-sm text-blue-600 dark:text-blue-400">{dataCheckResult}</p>
        )}

        <p
          className="text-sm text-muted-foreground"
          suppressHydrationWarning
        >
          {t("withings_oauth_note")}
        </p>
      </Card>

      <Card className="p-4 space-y-2">
        <h3 className="font-medium">{t("how_to_setup")}</h3>
        <p className="text-sm text-muted-foreground whitespace-pre-line">
          {t("withings_setup_instructions")}
        </p>
      </Card>
    </div>
  );
}
