"use client";

import { useEffect, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { getSecret, setSecret, getUserPreference, setUserPreference } from "@/actions/settings";
import { applyExchangeConfig } from "@/actions/trading";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PasswordInput } from "@/components/ui/password-input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { CheckCircleIcon, AlertCircleIcon } from "lucide-react";
import { useDemoMode } from "@/hooks/use-demo-mode";

const EXCHANGES = [
  { value: "kraken", label: "Kraken (EU/SEPA)", desc: "Recommended for EU traders" },
  { value: "binance", label: "Binance", desc: "Largest exchange globally" },
  { value: "bybit", label: "Bybit", desc: "Derivatives & spot" },
  { value: "okx", label: "OKX", desc: "Global exchange" },
] as const;

export default function FreqtradeIntegrationPage() {
  const isDemo = useDemoMode();
  const tc = useTranslations("common");
  const [isPending, startTransition] = useTransition();
  const [apiUrl, setApiUrl] = useState("http://freqtrade:8080");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [exchange, setExchange] = useState("kraken");
  const [exchangeKey, setExchangeKey] = useState("");
  const [exchangeSecret, setExchangeSecret] = useState("");
  const [saved, setSaved] = useState(false);
  const [connected, setConnected] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);
  const [applyResult, setApplyResult] = useState<string | null>(null);
  const [dryRun, setDryRun] = useState(true);

  useEffect(() => {
    startTransition(async () => {
      const [url, user, pass, exch, exKey, exSecret] = await Promise.all([
        getSecret("freqtrade_api_url"),
        getSecret("freqtrade_username"),
        getSecret("freqtrade_password"),
        getUserPreference("freqtrade_exchange"),
        getSecret("freqtrade_exchange_key"),
        getSecret("freqtrade_exchange_secret"),
      ]);
      if (url) setApiUrl(url);
      if (user) setUsername(user);
      if (pass) { setPassword("••••••••"); setConnected(true); }
      if (exch) setExchange(exch);
      if (exKey) setExchangeKey("••••••••");
      if (exSecret) setExchangeSecret("••••••••");
    });
  }, []);

  function handleSave() {
    startTransition(async () => {
      await setSecret("freqtrade_api_url", apiUrl.trim());
      await setSecret("freqtrade_username", username.trim());
      if (!password.startsWith("••••")) {
        await setSecret("freqtrade_password", password.trim());
      }
      await setUserPreference("freqtrade_exchange", exchange);
      if (!exchangeKey.startsWith("••••") && exchangeKey) {
        await setSecret("freqtrade_exchange_key", exchangeKey.trim());
      }
      if (!exchangeSecret.startsWith("••••") && exchangeSecret) {
        await setSecret("freqtrade_exchange_secret", exchangeSecret.trim());
      }
      setSaved(true);
      setConnected(true);
      toast.success(tc("saved"));
      setTimeout(() => setSaved(false), 3000);
    });
  }

  async function handleTest() {
    setTestResult(null);
    try {
      const auth = btoa(`${username}:${password.startsWith("••••") ? "" : password}`);
      const res = await fetch(`${apiUrl}/api/v1/ping`, {
        headers: { Authorization: `Basic ${auth}` },
      });
      if (res.ok) {
        setTestResult("Connected! Freqtrade is running.");
        toast.success("Freqtrade connected");
      } else {
        setTestResult(`Error: HTTP ${res.status}`);
        toast.error("Connection failed");
      }
    } catch {
      setTestResult("Connection failed — check URL and that Freqtrade is running");
      toast.error("Connection failed");
    }
  }

  return (
    <div className="space-y-4">
      {isDemo && <p className="text-xs text-muted-foreground">Read-only in demo mode</p>}
      <h2 className="text-lg font-semibold">📈 Freqtrade Trading Bot</h2>

      <Card className="p-4 space-y-4">
        <div className="flex items-center gap-2">
          <span className="font-medium">Status:</span>
          <Badge variant={connected ? "default" : "secondary"}>
            {connected ? "Configured" : "Not configured"}
          </Badge>
        </div>

        <div className="space-y-1">
          <Label>API URL</Label>
          <Input value={apiUrl} onChange={(e) => setApiUrl(e.target.value)} placeholder="http://freqtrade:8080" />
        </div>

        <div className="space-y-1">
          <Label>Username</Label>
          <Input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="freqtrader" />
        </div>

        <div className="space-y-1">
          <Label>Password</Label>
          <PasswordInput value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Freqtrade API password" />
        </div>

        <div className="flex gap-2">
          <Button onClick={handleSave} disabled={isDemo || isPending}>
            {tc("save")}
          </Button>
          <Button variant="outline" onClick={handleTest} disabled={isDemo || isPending}>
            Test Connection
          </Button>
        </div>

        {saved && <p className="text-sm text-green-600">{tc("saved")}</p>}
        {testResult && (
          <div className="flex items-center gap-2 text-sm">
            {testResult.startsWith("Connected") ? (
              <CheckCircleIcon className="size-4 text-green-500" />
            ) : (
              <AlertCircleIcon className="size-4 text-red-500" />
            )}
            <span>{testResult}</span>
          </div>
        )}
      </Card>

      {/* Exchange Configuration */}
      <Card className="p-4 space-y-4">
        <h3 className="font-medium">Exchange Configuration</h3>

        <div className="space-y-1">
          <Label>Exchange</Label>
          <Select value={exchange} onValueChange={(v) => v && setExchange(v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {EXCHANGES.map(ex => (
                <SelectItem key={ex.value} value={ex.value}>
                  {ex.label} <span className="text-muted-foreground ml-1 text-xs">— {ex.desc}</span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground mt-1">
            Exchange API keys are used by Freqtrade for market data and trading.
          </p>
        </div>

        <div className="space-y-1">
          <Label>Exchange API Key</Label>
          <PasswordInput value={exchangeKey} onChange={(e) => setExchangeKey(e.target.value)} placeholder={`${exchange} API key`} />
        </div>

        <div className="space-y-1">
          <Label>Exchange Secret Key</Label>
          <PasswordInput value={exchangeSecret} onChange={(e) => setExchangeSecret(e.target.value)} placeholder={`${exchange} secret key`} />
        </div>

        <div className="flex gap-2">
          <Button onClick={handleSave} disabled={isDemo || isPending}>{tc("save")}</Button>
        </div>

        <div className="border-t pt-4 space-y-3">
          <h4 className="text-sm font-medium">Apply to Freqtrade Bot</h4>
          <p className="text-xs text-muted-foreground">
            Save settings first, then apply to update the running bot config and restart.
          </p>

          <div className="flex items-center justify-between">
            <Label className="text-sm">{dryRun ? "🧪 Dry Run (paper trading)" : "💰 Live Trading (real money)"}</Label>
            <Switch checked={!dryRun} onCheckedChange={(v) => setDryRun(!v)} />
          </div>

          <Button
            variant={dryRun ? "outline" : "destructive"}
            onClick={() => {
              setApplyResult(null);
              startTransition(async () => {
                const res = await applyExchangeConfig({ dryRun });
                if ("error" in res && res.error) {
                  setApplyResult(`Error: ${res.error}`);
                  toast.error(res.error);
                } else if ("success" in res) {
                  setApplyResult(`Applied! Exchange: ${res.exchange}, ${res.dryRun ? "dry run" : "LIVE"}`);
                  toast.success("Config applied to Freqtrade");
                }
              });
            }}
            disabled={isDemo || isPending}
          >
            {dryRun ? "Apply Config (dry run)" : "⚠️ Apply Config (LIVE)"}
          </Button>

          {applyResult && (
            <div className="flex items-center gap-2 text-sm">
              {applyResult.startsWith("Applied") ? (
                <CheckCircleIcon className="size-4 text-green-500" />
              ) : (
                <AlertCircleIcon className="size-4 text-red-500" />
              )}
              <span>{applyResult}</span>
            </div>
          )}
        </div>
      </Card>

      <Card className="p-4 space-y-3">
        <h3 className="font-medium">Setup Instructions</h3>
        <div className="text-sm text-muted-foreground space-y-2">
          <p><strong>Kraken (recommended for EU):</strong></p>
          <ol className="list-decimal ml-4 space-y-1">
            <li>Register at <a href="https://kraken.com" className="underline">kraken.com</a></li>
            <li>Complete identity verification (Intermediate level)</li>
            <li>Go to Security → API → Create Key</li>
            <li>Permissions: <strong>Query Funds + Query Open Orders + Create & Modify Orders</strong></li>
            <li>Pair format: <code>XBT/USD</code>, <code>ETH/EUR</code></li>
          </ol>

          <p><strong>Binance:</strong></p>
          <ol className="list-decimal ml-4 space-y-1">
            <li>Register at <a href="https://binance.com" className="underline">binance.com</a></li>
            <li>API Management → Create API</li>
            <li>Enable: <strong>Read Info + Spot Trading</strong></li>
            <li>Pair format: <code>BTC/USDT</code>, <code>ETH/USDT</code></li>
          </ol>

          <p><strong>Security:</strong></p>
          <ul className="list-disc ml-4 space-y-1">
            <li>Never enable withdrawal permission</li>
            <li>Restrict API to specific IPs when possible</li>
            <li>Start with <strong>dry_run: true</strong> (paper trading)</li>
          </ul>
        </div>
      </Card>
    </div>
  );
}
