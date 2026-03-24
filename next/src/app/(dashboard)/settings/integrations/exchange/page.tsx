"use client";

import { useEffect, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { getSecret, setSecret, getUserPreference, setUserPreference } from "@/actions/settings";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PasswordInput } from "@/components/ui/password-input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useDemoMode } from "@/hooks/use-demo-mode";

export default function ExchangeIntegrationPage() {
  const isDemo = useDemoMode();
  const tc = useTranslations("common");
  const [isPending, startTransition] = useTransition();
  const [exchange, setExchange] = useState("kraken");
  const [apiKey, setApiKey] = useState("");
  const [apiSecret, setApiSecret] = useState("");
  const [saved, setSaved] = useState(false);
  const [configured, setConfigured] = useState(false);

  useEffect(() => {
    startTransition(async () => {
      const [savedExchange, savedKey, savedSecret] = await Promise.all([
        getUserPreference("exchange_name"),
        getSecret("exchange_api_key"),
        getSecret("exchange_api_secret"),
      ]);
      if (savedExchange) setExchange(savedExchange);
      if (savedKey) { setApiKey("••••••••"); setConfigured(true); }
      if (savedSecret) setApiSecret("••••••••");
    });
  }, []);

  function handleSave() {
    startTransition(async () => {
      await setUserPreference("exchange_name", exchange);
      if (!apiKey.startsWith("••••")) await setSecret("exchange_api_key", apiKey.trim());
      if (!apiSecret.startsWith("••••")) await setSecret("exchange_api_secret", apiSecret.trim());
      setSaved(true);
      setConfigured(true);
      toast.success(tc("saved"));
      setTimeout(() => setSaved(false), 3000);
    });
  }

  return (
    <div className="space-y-4">
      {isDemo && <p className="text-xs text-muted-foreground">Read-only in demo mode</p>}
      <h2 className="text-lg font-semibold">🏦 Crypto Exchange</h2>

      <Card className="p-4 space-y-4">
        <div className="flex items-center gap-2">
          <span className="font-medium">Status:</span>
          <Badge variant={configured ? "default" : "secondary"}>
            {configured ? `${exchange} connected` : "Not configured"}
          </Badge>
        </div>

        <div className="space-y-1">
          <Label>Exchange</Label>
          <Select value={exchange} onValueChange={(v) => v && setExchange(v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="kraken">Kraken (EU/SEPA)</SelectItem>
              <SelectItem value="binance">Binance</SelectItem>
              <SelectItem value="bybit">Bybit</SelectItem>
              <SelectItem value="okx">OKX</SelectItem>
              <SelectItem value="whitebit">WhiteBIT (UAH)</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1">
          <Label>API Key</Label>
          <PasswordInput value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder="Exchange API key" />
        </div>

        <div className="space-y-1">
          <Label>API Secret</Label>
          <PasswordInput value={apiSecret} onChange={(e) => setApiSecret(e.target.value)} placeholder="Exchange API secret" />
        </div>

        <Button onClick={handleSave} disabled={isDemo || isPending}>{tc("save")}</Button>
        {saved && <p className="text-sm text-green-600">{tc("saved")}</p>}
      </Card>

      <Card className="p-4 space-y-3">
        <h3 className="font-medium">Setup Instructions</h3>
        <div className="text-sm text-muted-foreground space-y-2">
          <p><strong>Kraken (recommended for EU):</strong></p>
          <ol className="list-decimal ml-4 space-y-1">
            <li>Register at <a href="https://kraken.com" className="underline">kraken.com</a></li>
            <li>Complete identity verification (Intermediate level)</li>
            <li>Go to Security → API → Create Key</li>
            <li>Permissions: <strong>Query Funds + Query Open Orders</strong> (read-only for start)</li>
            <li>For trading: add <strong>Create & Modify Orders</strong></li>
            <li>SEPA deposit: free, instant with Kraken Pro</li>
          </ol>

          <p><strong>Binance:</strong></p>
          <ol className="list-decimal ml-4 space-y-1">
            <li>Register at <a href="https://binance.com" className="underline">binance.com</a></li>
            <li>Complete KYC verification</li>
            <li>API Management → Create API</li>
            <li>Enable: <strong>Read Info + Spot Trading</strong></li>
            <li>Restrict to your IP for security</li>
          </ol>

          <p><strong>Security:</strong></p>
          <ul className="list-disc ml-4 space-y-1">
            <li>Never enable withdrawal permission</li>
            <li>Restrict API to specific IPs</li>
            <li>API keys are encrypted (AES-256-GCM) before storage</li>
          </ul>
        </div>
      </Card>
    </div>
  );
}
