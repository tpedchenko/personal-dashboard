"use client";

import { useEffect, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import {
  getSecret,
  setSecret,
  getUserPreference,
  setUserPreference,
} from "@/actions/settings";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { ChevronDownIcon, ChevronUpIcon, RefreshCwIcon, CheckCircleIcon, AlertCircleIcon, ClockIcon } from "lucide-react";
import { PasswordInput } from "@/components/ui/password-input";
import { useDemoMode } from "@/hooks/use-demo-mode";

type IntegrationStatus = {
  configured: boolean;
  lastSync: string | null;
  totalDays: number;
  latestDate: string | null;
  isUpToDate: boolean;
  mfaRequired: boolean;
  status: "not_configured" | "up_to_date" | "syncing" | "no_data" | "mfa_required";
};

export default function GarminIntegrationPage() {
  const isDemo = useDemoMode();
  const t = useTranslations("settings");
  const tc = useTranslations("common");
  const [isPending, startTransition] = useTransition();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [hasExisting, setHasExisting] = useState(false);
  const [autoSync, setAutoSync] = useState(false);
  const [saved, setSaved] = useState(false);
  const [showInstructions, setShowInstructions] = useState(false);
  const [checking, setChecking] = useState(false);
  const [syncing, setSyncing] = useState(false);

  // MFA state
  const [mfaRequired, setMfaRequired] = useState(false);
  const [mfaCode, setMfaCode] = useState("");

  // Integration status
  const [status, setStatus] = useState<IntegrationStatus | null>(null);
  const [syncResult, setSyncResult] = useState<string | null>(null);

  useEffect(() => {
    startTransition(async () => {
      const [savedEmail, savedPassword, syncMode] = await Promise.all([
        getSecret("garmin_email"),
        getSecret("garmin_password"),
        getUserPreference("garmin_sync_mode"),
      ]);
      if (savedEmail) {
        setEmail(savedEmail);
        setHasExisting(true);
      }
      if (savedPassword) setPassword("••••••••");
      setAutoSync(syncMode === "auto");
    });
    checkStatus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function checkStatus() {
    setChecking(true);
    try {
      const res = await fetch("/api/sync/garmin");
      if (res.ok) {
        const data = await res.json();
        setStatus(data);
        if (data.mfaRequired) {
          setMfaRequired(true);
        } else {
          setMfaRequired(false);
        }
      }
    } catch {
      // ignore
    }
    setChecking(false);
  }

  function handleSave() {
    if (!email.trim() || !password.trim()) return;
    startTransition(async () => {
      await setSecret("garmin_email", email.trim());
      if (!password.startsWith("••••")) {
        await setSecret("garmin_password", password.trim());
      }
      setSaved(true);
      setHasExisting(true);
      toast.success(tc("saved"));
      setTimeout(() => setSaved(false), 3000);
    });
  }

  function handleSyncModeToggle(checked: boolean) {
    setAutoSync(checked);
    startTransition(async () => {
      await setUserPreference("garmin_sync_mode", checked ? "auto" : "manual");
    });
  }

  async function handleSync() {
    setSyncing(true);
    setSyncResult(null);
    try {
      const res = await fetch("/api/sync/garmin", { method: "POST" });
      const data = await res.json();
      if (data.error) {
        toast.error(data.error);
        setSyncResult(`Error: ${data.error}`);
      } else if (data.mfaRequired) {
        setMfaRequired(true);
        setSyncResult(data.message);
        toast.info("MFA code required — check your email");
      } else {
        const counts = data.dataCounts;
        if (counts) {
          setSyncResult(
            `Daily: ${counts.daily}, Activities: ${counts.activities}, Sleep: ${counts.sleep}, Body: ${counts.bodyComposition}`
          );
        }
        toast.success(data.message || "OK");
        checkStatus();
      }
    } catch {
      toast.error("Connection error");
    }
    setSyncing(false);
  }

  async function handleMfaSubmit() {
    if (!mfaCode.trim()) return;
    setSyncing(true);
    try {
      const res = await fetch("/api/sync/garmin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mfaCode: mfaCode.trim() }),
      });
      const data = await res.json();
      if (data.error) {
        toast.error(data.error);
      } else {
        setMfaRequired(false);
        setMfaCode("");
        toast.success(data.message || "MFA code saved");
      }
    } catch {
      toast.error("MFA verification failed");
    }
    setSyncing(false);
  }

  const statusIcon = status?.status === "up_to_date"
    ? <CheckCircleIcon className="size-4 text-green-500" />
    : status?.status === "mfa_required"
      ? <AlertCircleIcon className="size-4 text-yellow-500" />
      : status?.status === "syncing"
        ? <ClockIcon className="size-4 text-yellow-500" />
        : status?.status === "no_data"
          ? <AlertCircleIcon className="size-4 text-red-500" />
          : null;

  const statusBadgeVariant = status?.status === "up_to_date" ? "default" as const
    : status?.status === "mfa_required" ? "destructive" as const
      : status?.status === "syncing" ? "secondary" as const
        : "destructive" as const;

  return (
    <div className="space-y-4">
      {isDemo && <p className="text-xs text-muted-foreground">Read-only in demo mode</p>}
      <h2 className="text-lg font-semibold">{t("integration_garmin")}</h2>

      {/* Integration Status Card */}
      {status && status.configured && (
        <Card className="p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {statusIcon}
              <span className="font-medium">
                {status.status === "up_to_date" && "Synced today"}
                {status.status === "mfa_required" && "MFA Required — enter code below"}
                {status.status === "syncing" && "Syncing..."}
                {status.status === "no_data" && "No data yet"}
              </span>
            </div>
            <Button variant="ghost" size="sm" onClick={checkStatus} disabled={isDemo || checking}>
              <RefreshCwIcon className={`size-4 ${checking ? "animate-spin" : ""}`} />
            </Button>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
            <div>
              <span className="text-muted-foreground">Days synced</span>
              <p className="font-semibold">{status.totalDays}</p>
            </div>
            <div>
              <span className="text-muted-foreground">Latest date</span>
              <p className="font-semibold">{status.latestDate ?? "—"}</p>
            </div>
            <div>
              <span className="text-muted-foreground">Last sync</span>
              <p className="font-semibold text-xs">
                {status.lastSync ? new Date(status.lastSync.split("|")[0]).toLocaleString("en") : "—"}
              </p>
            </div>
            <div>
              <span className="text-muted-foreground">Status</span>
              <Badge variant={statusBadgeVariant} className="mt-0.5">
                {status.status === "up_to_date" ? "OK" : status.status}
              </Badge>
            </div>
          </div>
        </Card>
      )}

      {/* Credentials & Status */}
      <Card className="p-4 space-y-4">
        <div className="flex items-center gap-2">
          <span className="font-medium">Status:</span>
          <Badge variant={hasExisting ? "default" : "secondary"}>
            {hasExisting
              ? t("integration_status_connected")
              : t("integration_status_not_configured")}
          </Badge>
        </div>

        <div>
          <Label>Email</Label>
          <Input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="your@email.com"
          />
        </div>

        <div>
          <Label>Password</Label>
          <PasswordInput
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Garmin Connect password"
          />
        </div>

        <Button
          onClick={handleSave}
          disabled={isDemo || isPending || !email.trim() || !password.trim()}
        >
          {tc("save")}
        </Button>

        {saved && <p className="text-sm text-green-600">{tc("saved")}</p>}
      </Card>

      {/* Sync Settings */}
      <Card className="p-4 space-y-4">
        <div className="flex items-center justify-between">
          <Label>
            {autoSync ? t("garmin_sync_mode_auto") : t("garmin_sync_mode_manual")}
          </Label>
          <Switch checked={autoSync} onCheckedChange={handleSyncModeToggle} />
        </div>

        <div className="flex gap-2">
          <Button
            onClick={handleSync}
            disabled={isDemo || !hasExisting || syncing}
          >
            {syncing ? tc("loading") : t("sync_now")}
          </Button>
          <Button
            variant="outline"
            onClick={checkStatus}
            disabled={isDemo || checking}
          >
            <RefreshCwIcon className={`size-4 mr-1 ${checking ? "animate-spin" : ""}`} />
            Check status
          </Button>
        </div>

        {syncResult && (
          <p className={`text-sm ${syncResult.startsWith("Error") ? "text-red-600" : "text-muted-foreground"}`}>
            {syncResult}
          </p>
        )}
      </Card>

      {/* MFA Dialog */}
      {mfaRequired && (
        <Card className="p-4 space-y-4 border-yellow-500">
          <h3 className="font-medium text-yellow-700 dark:text-yellow-400">
            MFA Required
          </h3>
          <p className="text-sm text-muted-foreground">
            Garmin requires a verification code. Check your email or authenticator app.
            The code will be saved and the scheduler will use it on the next sync attempt (within 5 min).
          </p>
          <div className="flex gap-2">
            <Input
              value={mfaCode}
              onChange={(e) => setMfaCode(e.target.value)}
              placeholder="6-digit code"
              maxLength={6}
              onKeyDown={(e) => e.key === "Enter" && handleMfaSubmit()}
            />
            <Button onClick={handleMfaSubmit} disabled={isDemo || syncing || !mfaCode.trim()}>
              Verify
            </Button>
          </div>
        </Card>
      )}

      {/* Setup Instructions */}
      <Card className="p-4 space-y-2">
        <button
          onClick={() => setShowInstructions(!showInstructions)}
          className="flex items-center gap-2 font-medium w-full text-left"
        >
          {t("how_to_setup")}
          {showInstructions ? <ChevronUpIcon className="size-4" /> : <ChevronDownIcon className="size-4" />}
        </button>
        {showInstructions && (
          <p className="text-sm text-muted-foreground whitespace-pre-line">
            {t("garmin_setup_instructions")}
          </p>
        )}
      </Card>
    </div>
  );
}
