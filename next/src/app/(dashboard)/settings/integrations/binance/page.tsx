"use client";
import { useEffect, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { getSecret, setSecret } from "@/actions/settings";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { PasswordInput } from "@/components/ui/password-input";
import { useDemoMode } from "@/hooks/use-demo-mode";

export default function BinancePage() {
  const isDemo = useDemoMode();
  const tc = useTranslations("common");
  const [isPending, startTransition] = useTransition();
  const [apiKey, setApiKey] = useState("");
  const [apiSecret, setApiSecret] = useState("");
  const [configured, setConfigured] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    startTransition(async () => {
      const [key, secret] = await Promise.all([getSecret("binance_api_key"), getSecret("binance_api_secret")]);
      if (key) { setApiKey("••••••••"); setConfigured(true); }
      if (secret) setApiSecret("••••••••");
    });
  }, []);

  function handleSave() {
    startTransition(async () => {
      if (!apiKey.startsWith("••••")) await setSecret("binance_api_key", apiKey.trim());
      if (!apiSecret.startsWith("••••")) await setSecret("binance_api_secret", apiSecret.trim());
      setSaved(true); setConfigured(true); toast.success(tc("saved"));
      setTimeout(() => setSaved(false), 3000);
    });
  }

  return (
    <div className="space-y-4">
      {isDemo && <p className="text-xs text-muted-foreground">Read-only in demo mode</p>}
      <h2 className="text-lg font-semibold">🪙 Binance</h2>
      <Card className="p-4 space-y-4">
        <Badge variant={configured ? "default" : "secondary"}>{configured ? "Connected" : "Not configured"}</Badge>
        <div className="space-y-1"><Label>API Key</Label><PasswordInput value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder="Binance API key" /></div>
        <div className="space-y-1"><Label>API Secret</Label><PasswordInput value={apiSecret} onChange={(e) => setApiSecret(e.target.value)} placeholder="Binance API secret" /></div>
        <Button onClick={handleSave} disabled={isDemo || isPending}>{tc("save")}</Button>
        {saved && <p className="text-sm text-green-600">{tc("saved")}</p>}
      </Card>
      <Card className="p-4 space-y-2">
        <h3 className="font-medium">Setup</h3>
        <div className="text-sm text-muted-foreground space-y-1">
          <p>1. Register at <a href="https://binance.com" className="underline">binance.com</a></p>
          <p>2. Complete identity verification</p>
          <p>3. Create API key (Security → API)</p>
          <p>4. Permissions: <strong>Read Info + Spot Trading</strong></p>
          <p className="text-xs text-amber-600 dark:text-amber-400">⚠️ Never enable withdrawal permission</p>
        </div>
      </Card>
    </div>
  );
}
