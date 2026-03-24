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
import { WifiIcon, CheckCircleIcon, AlertCircleIcon } from "lucide-react";
import { useDemoMode } from "@/hooks/use-demo-mode";

export default function EtoroPage() {
  const isDemo = useDemoMode();
  const tc = useTranslations("common");
  const [isPending, startTransition] = useTransition();
  const [apiKey, setApiKey] = useState("");
  const [userKey, setUserKey] = useState("");
  const [configured, setConfigured] = useState(false);
  const [saved, setSaved] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);

  useEffect(() => {
    startTransition(async () => {
      const [key, ukey] = await Promise.all([
        getSecret("etoro_api_key"),
        getSecret("etoro_user_key"),
      ]);
      if (key) setApiKey("••••••••");
      if (ukey) setUserKey("••••••••");
      if (key && ukey) setConfigured(true);
    });
  }, []);

  function handleSave() {
    startTransition(async () => {
      if (!apiKey.startsWith("••••")) await setSecret("etoro_api_key", apiKey.trim());
      if (!userKey.startsWith("••••")) await setSecret("etoro_user_key", userKey.trim());
      setSaved(true); setConfigured(true); toast.success(tc("saved"));
      setTimeout(() => setSaved(false), 3000);
    });
  }

  function handleTest() {
    setTestResult(null);
    startTransition(async () => {
      const { testConnection } = await import("@/lib/brokers/etorro-client");
      const ak = apiKey.startsWith("••••") ? (await getSecret("etoro_api_key")) || "" : apiKey.trim();
      const uk = userKey.startsWith("••••") ? (await getSecret("etoro_user_key")) || "" : userKey.trim();
      const res = await testConnection(ak, uk);
      setTestResult(res);
      if (res.ok) toast.success(res.message); else toast.error(res.message);
    });
  }

  return (
    <div className="space-y-4">
      {isDemo && <p className="text-xs text-muted-foreground">Read-only in demo mode</p>}
      <h2 className="text-lg font-semibold">📊 eToro</h2>
      <Card className="p-4 space-y-4">
        <div className="flex items-center gap-2">
          <span className="font-medium">Status:</span>
          <Badge variant={configured ? "default" : "secondary"}>{configured ? "Configured" : "Not configured"}</Badge>
          {testResult && (
            <Badge variant={testResult.ok ? "default" : "destructive"} className="text-xs">
              {testResult.ok ? "Connected" : "Error"}
            </Badge>
          )}
        </div>

        <div className="space-y-1">
          <Label>Public API Key (x-api-key)</Label>
          <PasswordInput value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder="sdgdskld..." />
        </div>

        <div className="space-y-1">
          <Label>User Key (x-user-key)</Label>
          <PasswordInput value={userKey} onChange={(e) => setUserKey(e.target.value)} placeholder="eyJjaSI6..." />
          <p className="text-[10px] text-muted-foreground">Private key from eToro Settings → Trading → API Key Management</p>
        </div>

        <div className="flex gap-2">
          <Button onClick={handleSave} disabled={isDemo || isPending}>{tc("save")}</Button>
          <Button variant="outline" onClick={handleTest} disabled={isDemo || isPending}>
            <WifiIcon className="size-3.5 mr-1" /> Test Connection
          </Button>
        </div>

        {saved && <p className="text-sm text-green-600">{tc("saved")}</p>}
        {testResult && (
          <div className="flex items-center gap-2 text-sm">
            {testResult.ok ? <CheckCircleIcon className="size-4 text-green-500" /> : <AlertCircleIcon className="size-4 text-red-500" />}
            <span>{testResult.message}</span>
          </div>
        )}
      </Card>

      <Card className="p-4 space-y-2">
        <h3 className="font-medium">Setup</h3>
        <div className="text-sm text-muted-foreground space-y-1">
          <p><strong>1.</strong> Log in to <a href="https://www.etoro.com" className="underline">etoro.com</a></p>
          <p><strong>2.</strong> Go to Settings → Trading → API Key Management</p>
          <p><strong>3.</strong> Generate API key (account must be verified)</p>
          <p><strong>4.</strong> Copy both <strong>Public key</strong> and <strong>User key (private)</strong></p>
          <p><strong>5.</strong> Paste them above and click Save</p>
          <p className="text-xs mt-2">API docs: <a href="https://api-portal.etoro.com" className="underline">api-portal.etoro.com</a></p>
          <p className="text-xs">Base URL: <code>https://public-api.etoro.com/api/v1</code></p>
        </div>
      </Card>
    </div>
  );
}
