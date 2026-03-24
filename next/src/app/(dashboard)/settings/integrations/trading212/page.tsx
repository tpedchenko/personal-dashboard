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

export default function Trading212Page() {
  const isDemo = useDemoMode();
  const tc = useTranslations("common");
  const [isPending, startTransition] = useTransition();
  const [apiKeyId, setApiKeyId] = useState("");
  const [secretKey, setSecretKey] = useState("");
  const [configured, setConfigured] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    startTransition(async () => {
      const [keyId, secret] = await Promise.all([
        getSecret("trading212_api_key_id"),
        getSecret("trading212_secret_key"),
      ]);
      if (keyId) { setApiKeyId("••••••••"); setConfigured(true); }
      if (secret) setSecretKey("••••••••");
    });
  }, []);

  function handleSave() {
    startTransition(async () => {
      if (!apiKeyId.startsWith("••••")) await setSecret("trading212_api_key_id", apiKeyId.trim());
      if (!secretKey.startsWith("••••")) await setSecret("trading212_secret_key", secretKey.trim());
      setSaved(true); setConfigured(true); toast.success(tc("saved"));
      setTimeout(() => setSaved(false), 3000);
    });
  }

  return (
    <div className="space-y-4">
      {isDemo && <p className="text-xs text-muted-foreground">Read-only in demo mode</p>}
      <h2 className="text-lg font-semibold">🏦 Trading 212</h2>
      <Card className="p-4 space-y-4">
        <Badge variant={configured ? "default" : "secondary"}>{configured ? "Connected" : "Not configured"}</Badge>
        <div className="space-y-1">
          <Label>API Key ID</Label>
          <PasswordInput value={apiKeyId} onChange={(e) => setApiKeyId(e.target.value)} placeholder="Trading 212 API Key ID" />
        </div>
        <div className="space-y-1">
          <Label>Secret Key</Label>
          <PasswordInput value={secretKey} onChange={(e) => setSecretKey(e.target.value)} placeholder="Trading 212 Secret Key" />
        </div>
        <Button onClick={handleSave} disabled={isDemo || isPending}>{tc("save")}</Button>
        {saved && <p className="text-sm text-green-600">{tc("saved")}</p>}
      </Card>
      <Card className="p-4 space-y-2">
        <h3 className="font-medium">Setup</h3>
        <div className="text-sm text-muted-foreground space-y-1">
          <p>1. Open Trading 212 app or web</p>
          <p>2. Settings → API (beta)</p>
          <p>3. Generate API key — you will get <strong>API Key ID</strong> and <strong>Secret Key</strong></p>
          <p>4. API docs: <a href="https://t212public-api-docs.redoc.ly" className="underline">t212public-api-docs.redoc.ly</a></p>

          <p className="mt-2"><strong>Available data (permissions):</strong></p>
          <ul className="list-disc ml-4 space-y-0.5">
            <li>Account data — balance, cash, invested value</li>
            <li>Portfolio — positions, P&L per instrument</li>
            <li>History — transactions, orders, dividends</li>
            <li>Pies — auto-invest pie allocations</li>
            <li>Orders — read open orders, execute new</li>
            <li>Metadata — instrument info, exchanges</li>
          </ul>

          <p className="mt-2"><strong>Security:</strong></p>
          <ul className="list-disc ml-4 space-y-0.5">
            <li>For read-only: enable only Account data, Portfolio, History, Metadata</li>
            <li>For trading: also enable Orders-Execute</li>
            <li>API keys are encrypted (AES-256-GCM) before storage</li>
          </ul>
        </div>
      </Card>
    </div>
  );
}
