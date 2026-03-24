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
import { CheckCircleIcon, AlertCircleIcon, RefreshCwIcon } from "lucide-react";
import { importFlexStatement } from "@/actions/brokers-ibkr";
import { useDemoMode } from "@/hooks/use-demo-mode";

export default function IBKRPage() {
  const isDemo = useDemoMode();
  const tc = useTranslations("common");
  const [isPending, startTransition] = useTransition();
  const [accountId, setAccountId] = useState("");
  const [configured, setConfigured] = useState(false);
  const [flexToken, setFlexToken] = useState("");
  const [flexQueryId, setFlexQueryId] = useState("");
  const [saved, setSaved] = useState(false);
  const [syncResult, setSyncResult] = useState<{ ok: boolean; message: string } | null>(null);

  useEffect(() => {
    startTransition(async () => {
      const [acct, ft, fq] = await Promise.all([
        getSecret("ibkr_account_id"),
        getSecret("ibkr_flex_token"),
        getUserPreference("ibkr_flex_query_id"),
      ]);
      if (acct) { setAccountId(acct); setConfigured(true); }
      if (ft) setFlexToken(ft);
      if (fq) setFlexQueryId(fq);
    });
  }, []);

  function handleSave() {
    startTransition(async () => {
      if (accountId.trim()) await setSecret("ibkr_account_id", accountId.trim());
      if (flexToken.trim()) await setSecret("ibkr_flex_token", flexToken.trim());
      if (flexQueryId.trim()) await setUserPreference("ibkr_flex_query_id", flexQueryId.trim());
      setSaved(true); setConfigured(true); toast.success(tc("saved"));
      setTimeout(() => setSaved(false), 3000);
    });
  }

  function handleSync() {
    setSyncResult(null);
    startTransition(async () => {
      const queryId = flexQueryId || (await getUserPreference("ibkr_flex_query_id")) || "";
      if (!queryId) {
        setSyncResult({ ok: false, message: "Flex Query ID не задано" });
        toast.error("Flex Query ID не задано");
        return;
      }
      const res = await importFlexStatement(queryId);
      setSyncResult(res);
      if (res.ok) toast.success(res.message); else toast.error(res.message);
    });
  }

  return (
    <div className="space-y-4">
      {isDemo && <p className="text-xs text-muted-foreground">Read-only in demo mode</p>}
      <h2 className="text-lg font-semibold">🏦 Interactive Brokers</h2>
      <Card className="p-4 space-y-4">
        <div className="flex items-center gap-2">
          <span className="font-medium">Status:</span>
          <Badge variant={configured ? "default" : "secondary"}>
            {configured ? "Configured" : "Not configured"}
          </Badge>
        </div>

        <div className="space-y-1">
          <Label>Account ID</Label>
          <Input value={accountId} onChange={(e) => setAccountId(e.target.value)} placeholder="U1234567" />
        </div>

        <hr className="my-2" />
        <h3 className="font-medium text-sm">Flex Web Service</h3>
        <p className="text-xs text-muted-foreground">
          Імпорт позицій, балансу, дивідендів через Flex Query. Не потребує Java gateway.
        </p>

        <div className="space-y-1">
          <Label>Flex Token</Label>
          <Input value={flexToken} onChange={(e) => setFlexToken(e.target.value)} placeholder="666985..." type="password" />
          <p className="text-[10px] text-muted-foreground">IBKR Account Management → Settings → Flex Web Service → Token</p>
        </div>

        <div className="space-y-1">
          <Label>Flex Query ID</Label>
          <Input value={flexQueryId} onChange={(e) => setFlexQueryId(e.target.value)} placeholder="1437105" />
          <p className="text-[10px] text-muted-foreground">IBKR Account Management → Reports → Flex Queries → Query ID</p>
        </div>

        <div className="flex gap-2">
          <Button onClick={handleSave} disabled={isDemo || isPending}>{tc("save")}</Button>
          <Button variant="outline" onClick={handleSync} disabled={isDemo || isPending}>
            <RefreshCwIcon className="size-3.5 mr-1" /> Sync Portfolio
          </Button>
        </div>

        {saved && <p className="text-sm text-green-600">{tc("saved")}</p>}
        {syncResult && (
          <div className="flex items-center gap-2 text-sm">
            {syncResult.ok ? <CheckCircleIcon className="size-4 text-green-500" /> : <AlertCircleIcon className="size-4 text-red-500" />}
            <span>{syncResult.message}</span>
          </div>
        )}
      </Card>

      <Card className="p-4 space-y-3">
        <h3 className="font-medium">Налаштування Flex Query в IBKR</h3>
        <div className="text-sm text-muted-foreground space-y-2">
          <p><strong>1.</strong> Зайти на <a href="https://www.interactivebrokers.com" className="underline" target="_blank">interactivebrokers.com</a> → Account Management</p>
          <p><strong>2.</strong> Performance & Reports → <strong>Flex Queries</strong></p>
          <p><strong>3.</strong> Create Activity Flex Query, включити:</p>
          <ul className="list-disc ml-8 space-y-0.5">
            <li><strong>Open Positions</strong> — поточні позиції</li>
            <li><strong>Net Asset Value (NAV) in Base</strong> — загальний баланс</li>
            <li><strong>Change in NAV</strong> — дивіденди, withholding tax</li>
            <li><strong>Open Dividend Accruals</strong> — нараховані дивіденди</li>
          </ul>
          <p><strong>4.</strong> Period: <strong>Last Business Day</strong>, Format: <strong>XML</strong></p>
          <p><strong>5.</strong> Save → скопіювати <strong>Query ID</strong></p>
          <p><strong>6.</strong> Settings → Flex Web Service → скопіювати <strong>Token</strong></p>
        </div>
      </Card>
    </div>
  );
}
