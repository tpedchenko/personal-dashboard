"use client";

import { useEffect, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { getSecret, setSecret, getUserPreference, setUserPreference } from "@/actions/settings";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { useDemoMode } from "@/hooks/use-demo-mode";

export default function CobeeIntegrationPage() {
  const isDemo = useDemoMode();
  const t = useTranslations("settings");
  const tc = useTranslations("common");
  const [isPending, startTransition] = useTransition();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [accountName, setAccountName] = useState("");
  const [enabled, setEnabled] = useState(false);
  const [saved, setSaved] = useState(false);
  const [hasExisting, setHasExisting] = useState(false);
  const [lastSync, setLastSync] = useState<string | null>(null);
  const [showInstructions, setShowInstructions] = useState(false);

  useEffect(() => {
    startTransition(async () => {
      const [e, p, acc, en, ls] = await Promise.all([
        getSecret("cobee_email"),
        getSecret("cobee_password"),
        getUserPreference("cobee_account_name"),
        getUserPreference("cobee_enabled"),
        getUserPreference("cobee_last_sync"),
      ]);
      if (e) { setEmail(e); setHasExisting(true); }
      if (p) setPassword(p);
      if (acc) setAccountName(acc);
      if (en === "true") setEnabled(true);
      setLastSync(ls);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleSave() {
    if (!email.trim() || !password.trim()) return;
    startTransition(async () => {
      await Promise.all([
        setSecret("cobee_email", email.trim()),
        setSecret("cobee_password", password.trim()),
        setUserPreference("cobee_enabled", enabled ? "true" : "false"),
        accountName.trim() ? setUserPreference("cobee_account_name", accountName.trim()) : Promise.resolve(),
      ]);
      setSaved(true);
      setHasExisting(true);
      setTimeout(() => setSaved(false), 3000);
    });
  }

  function handleToggleEnabled(val: boolean) {
    setEnabled(val);
    startTransition(async () => {
      await setUserPreference("cobee_enabled", val ? "true" : "false");
    });
  }

  return (
    <div className="space-y-4">
      {isDemo && <p className="text-xs text-muted-foreground">Read-only in demo mode</p>}
      <Card className="p-4 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">{t("integration_cobee")}</h2>
          <Badge variant={hasExisting && enabled ? "default" : "secondary"}>
            {hasExisting && enabled ? t("integration_status_connected") : t("integration_status_not_configured")}
          </Badge>
        </div>

        <div className="flex items-center justify-between">
          <Label>{enabled ? t("telegram_enable") : t("telegram_disable")}</Label>
          <Switch checked={enabled} onCheckedChange={handleToggleEnabled} />
        </div>

        <div>
          <Label>{t("cobee_email")}</Label>
          <Input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="your@email.com"
          />
        </div>

        <div>
          <Label>{t("cobee_password")}</Label>
          <Input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
          />
        </div>

        <div>
          <Label>Account name</Label>
          <Input
            type="text"
            value={accountName}
            onChange={(e) => setAccountName(e.target.value)}
            placeholder="Cobee"
          />
          <p className="text-xs text-muted-foreground mt-1">
            Account name for imported transactions
          </p>
        </div>

        {lastSync && (
          <p className="text-sm text-muted-foreground">
            {t("last_sync")}: {lastSync}
          </p>
        )}

        <div className="flex gap-2">
          <Button onClick={handleSave} disabled={isDemo || isPending || !email.trim() || !password.trim()}>
            {tc("save")}
          </Button>
          {hasExisting && (
            <Button variant="outline" disabled={isDemo || isPending} onClick={() => alert("Cobee sync is handled by the background scheduler.")}>
              {t("sync_now")}
            </Button>
          )}
        </div>

        {saved && (
          <p className="text-sm text-green-600">{tc("success")}</p>
        )}
      </Card>

      <Card className="p-4">
        <button
          onClick={() => setShowInstructions(!showInstructions)}
          className="flex items-center justify-between w-full text-left"
        >
          <h3 className="font-medium">{t("how_to_setup")}</h3>
          <span className="text-muted-foreground">{showInstructions ? "▲" : "▼"}</span>
        </button>
        {showInstructions && (
          <p className="text-sm text-muted-foreground whitespace-pre-line mt-3">
            {t("cobee_setup_instructions")}
          </p>
        )}
      </Card>
    </div>
  );
}
