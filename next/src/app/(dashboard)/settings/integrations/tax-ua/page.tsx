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
import { Switch } from "@/components/ui/switch";
import { useDemoMode } from "@/hooks/use-demo-mode";

export default function TaxUAIntegrationPage() {
  const isDemo = useDemoMode();
  const tc = useTranslations("common");
  const ts = useTranslations("settings");
  const [isPending, startTransition] = useTransition();
  const [ipn, setIpn] = useState("");
  const [fopGroup, setFopGroup] = useState("3");
  const [taxRate, setTaxRate] = useState("5");
  const [kepPassword, setKepPassword] = useState("");
  const [saved, setSaved] = useState(false);
  const [configured, setConfigured] = useState(false);
  const [kepFileName, setKepFileName] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [readOnly, setReadOnly] = useState(false);
  const [kepVerifying, setKepVerifying] = useState(false);
  const [kepInfo, setKepInfo] = useState<{ valid: boolean; owner?: string; issuer?: string; validTo?: string; error?: string } | null>(null);
  const [dpsConnecting, setDpsConnecting] = useState(false);
  const [dpsStatus, setDpsStatus] = useState<{ connected: boolean; payerName?: string; error?: string } | null>(null);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{ totalImported: number; totalErrors: number } | null>(null);

  useEffect(() => {
    startTransition(async () => {
      const [savedIpn, savedGroup, savedRate, savedKep, savedKepFile] = await Promise.all([
        getSecret("tax_ua_ipn"),
        getUserPreference("tax_ua_fop_group"),
        getUserPreference("tax_ua_rate"),
        getSecret("tax_ua_kep_password"),
        getSecret("tax_ua_kep_filename"),
      ]);
      if (savedIpn) { setIpn(savedIpn); setConfigured(true); }
      if (savedGroup) setFopGroup(savedGroup);
      if (savedRate) setTaxRate(savedRate);
      if (savedKep) setKepPassword("••••••••");
      if (savedKepFile) setKepFileName(savedKepFile);
      const ro = await getUserPreference("tax_ua_read_only");
      setReadOnly(ro === "true");
    });
  }, []);

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("type", "kep_ua");
      const res = await fetch("/api/upload/certificate", { method: "POST", body: formData });
      const data = await res.json();
      if (data.success) {
        setKepFileName(data.fileName);
        toast.success(`Файл ${data.fileName} завантажено`);
      } else {
        toast.error(data.error || "Upload failed");
      }
    } catch {
      toast.error("Upload failed");
    }
    setUploading(false);
  }

  function handleSave() {
    startTransition(async () => {
      await setSecret("tax_ua_ipn", ipn.trim());
      await setUserPreference("tax_ua_fop_group", fopGroup);
      await setUserPreference("tax_ua_rate", taxRate);
      if (!kepPassword.startsWith("••••")) {
        await setSecret("tax_ua_kep_password", kepPassword.trim());
      }
      setSaved(true);
      setConfigured(true);
      toast.success(tc("saved"));
      setTimeout(() => setSaved(false), 3000);
    });
  }

  return (
    <div className="space-y-4">
      {isDemo && <p className="text-xs text-muted-foreground">Read-only in demo mode</p>}
      <h2 className="text-lg font-semibold">🇺🇦 Податки Україна (ФОП)</h2>

      <Card className="p-4 space-y-4">
        <div className="flex items-center gap-2">
          <span className="font-medium">Status:</span>
          <Badge variant={configured ? "default" : "secondary"}>
            {configured ? ts("tax_ua_configured") : ts("tax_ua_not_configured")}
          </Badge>
        </div>

        <div className="flex items-center justify-between">
          <Label htmlFor="tax-ua-readonly" className="cursor-pointer">
            {readOnly ? ts("tax_ua_readonly_on") : ts("tax_ua_readonly_off")}
          </Label>
          <Switch
            id="tax-ua-readonly"
            checked={readOnly}
            onCheckedChange={(checked) => {
              setReadOnly(checked);
              startTransition(async () => {
                await setUserPreference("tax_ua_read_only", checked ? "true" : "false");
              });
            }}
          />
        </div>

        <div className="space-y-1">
          <Label>РНОКПП (ІПН)</Label>
          <PasswordInput value={ipn} onChange={(e) => setIpn(e.target.value)} placeholder={ts("tax_ua_ipn_placeholder")} />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label>Група ФОП</Label>
            <Input value={fopGroup} onChange={(e) => setFopGroup(e.target.value)} placeholder="3" />
          </div>
          <div className="space-y-1">
            <Label>Ставка єдиного податку (%)</Label>
            <Input value={taxRate} onChange={(e) => setTaxRate(e.target.value)} placeholder="5" />
          </div>
        </div>

        <div className="space-y-1">
          <Label>Файл КЕП (Key-6.dat, .jks, .pfx)</Label>
          <div className="flex items-center gap-2">
            <Input
              type="file"
              accept=".dat,.jks,.pfx,.p12,.zs2"
              onChange={handleFileUpload}
              disabled={isDemo || uploading}
              className="text-sm"
            />
            {kepFileName && (
              <Badge variant="secondary" className="shrink-0">{kepFileName}</Badge>
            )}
          </div>
        </div>

        <div className="space-y-1">
          <Label>{ts("tax_ua_kep_password")}</Label>
          <PasswordInput value={kepPassword} onChange={(e) => setKepPassword(e.target.value)} placeholder={ts("tax_ua_kep_password_placeholder")} />
        </div>

        <div className="flex gap-2">
          <Button onClick={handleSave} disabled={isDemo || isPending}>
            {tc("save")}
          </Button>
          {kepFileName && (
            <Button
              variant="outline"
              disabled={isDemo || kepVerifying}
              onClick={async () => {
                setKepVerifying(true);
                setKepInfo(null);
                try {
                  const res = await fetch("/api/reporting/verify-kep", { method: "POST" });
                  const data = await res.json();
                  setKepInfo(data);
                  if (data.valid) toast.success(ts("tax_ua_kep_valid"));
                  else toast.error(data.error || ts("tax_ua_kep_invalid"));
                } catch {
                  toast.error(ts("tax_ua_kep_error"));
                }
                setKepVerifying(false);
              }}
            >
              {kepVerifying ? ts("tax_ua_kep_verifying") : ts("tax_ua_verify_kep")}
            </Button>
          )}
        </div>
        {saved && <p className="text-sm text-green-600">{tc("saved")}</p>}
        {kepInfo && (
          <div className={`text-sm p-3 rounded-md ${kepInfo.valid ? "bg-green-500/10 border border-green-500/30" : "bg-red-500/10 border border-red-500/30"}`}>
            {kepInfo.valid ? (
              <div className="space-y-1">
                <p className="font-medium text-green-700 dark:text-green-400">✅ КЕП валідний</p>
                {kepInfo.owner && <p>{ts("tax_ua_kep_owner")}: {kepInfo.owner}</p>}
                {kepInfo.issuer && <p>{ts("tax_ua_kep_issuer")}: {kepInfo.issuer}</p>}
                {kepInfo.validTo && <p>{ts("tax_ua_kep_valid_to")}: {new Date(kepInfo.validTo).toLocaleDateString()}</p>}
              </div>
            ) : (
              <p className="text-red-700 dark:text-red-400">❌ {kepInfo.error}</p>
            )}
          </div>
        )}
      </Card>

      {/* DPS Connection & Import */}
      <Card className="p-4 space-y-4">
        <h3 className="font-medium">Електронний кабінет ДПС</h3>
        <p className="text-sm text-muted-foreground">
          {ts("tax_ua_dps_desc")}
        </p>

        <div className="flex gap-2">
          <Button
            variant="outline"
            disabled={isDemo || dpsConnecting || !configured}
            onClick={async () => {
              setDpsConnecting(true);
              setDpsStatus(null);
              try {
                const res = await fetch("/api/reporting/dps/test-connection", { method: "POST" });
                const data = await res.json();
                setDpsStatus(data);
                if (data.connected) toast.success(ts("tax_ua_dps_success"));
                else toast.error(data.error || ts("tax_ua_dps_fail"));
              } catch {
                toast.error(ts("tax_ua_dps_error"));
              }
              setDpsConnecting(false);
            }}
          >
            {dpsConnecting ? ts("tax_ua_dps_testing") : ts("tax_ua_dps_test")}
          </Button>

          <Button
            disabled={isDemo || importing || !configured}
            onClick={async () => {
              setImporting(true);
              setImportResult(null);
              try {
                const res = await fetch("/api/reporting/dps/import", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ years: [2022, 2023, 2024, 2025] }),
                });
                const data = await res.json();
                if (data.success) {
                  setImportResult({ totalImported: data.totalImported, totalErrors: data.totalErrors });
                  toast.success(ts("tax_ua_import_success", { count: data.totalImported }));
                } else {
                  toast.error(data.error || ts("tax_ua_import_error"));
                }
              } catch {
                toast.error(ts("tax_ua_import_error"));
              }
              setImporting(false);
            }}
          >
            {importing ? ts("tax_ua_importing") : ts("tax_ua_import")}
          </Button>
        </div>

        {dpsStatus && (
          <div className={`text-sm p-3 rounded-md ${dpsStatus.connected ? "bg-green-500/10 border border-green-500/30" : "bg-red-500/10 border border-red-500/30"}`}>
            {dpsStatus.connected ? (
              <div className="space-y-1">
                <p className="font-medium text-green-700 dark:text-green-400">Підключено до ДПС</p>
                {dpsStatus.payerName && <p>{ts("tax_ua_dps_payer")}: {dpsStatus.payerName}</p>}
              </div>
            ) : (
              <p className="text-red-700 dark:text-red-400">{dpsStatus.error}</p>
            )}
          </div>
        )}

        {importResult && (
          <div className="text-sm p-3 rounded-md bg-blue-500/10 border border-blue-500/30">
            <p>{ts("tax_ua_imported_count")}: <strong>{importResult.totalImported}</strong></p>
            {importResult.totalErrors > 0 && (
              <p className="text-amber-600">{ts("tax_ua_import_errors")}: {importResult.totalErrors}</p>
            )}
          </div>
        )}
      </Card>

      <Card className="p-4 space-y-3">
        <h3 className="font-medium">Актуальні ставки 2025</h3>
        <div className="text-sm space-y-1 mb-4">
          <div className="flex justify-between py-1 border-b">
            <span>Єдиний податок (3 група)</span>
            <span className="font-semibold">5% від доходу</span>
          </div>
          <div className="flex justify-between py-1 border-b">
            <span>ЄСВ (мін. внесок/місяць)</span>
            <span className="font-semibold">1,760 UAH (22% від мін. ЗП 8,000 UAH)</span>
          </div>
          <div className="flex justify-between py-1 border-b">
            <span>Військовий збір</span>
            <span className="font-semibold">1% від доходу (з 01.2025)</span>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            * Ставки актуальні на 2025 рік. Джерело: Податковий кодекс України, ст. 293, 298
          </p>
        </div>

        <h3 className="font-medium">Інструкція налаштування</h3>
        <div className="text-sm text-muted-foreground space-y-2">
          <p><strong>1. КЕП (Кваліфікований Електронний Підпис):</strong></p>
          <ul className="list-disc ml-4 space-y-1">
            <li>Отримати КЕП у акредитованого КНЕДП (Дія.Підпис, ПриватБанк, тощо)</li>
            <li>Формат файлу: <code>Key-6.dat</code> (найпоширеніший), <code>.jks</code> (ПриватБанк), або <code>.pfx</code></li>
            <li>Завантажити файл ключа та ввести пароль вище</li>
          </ul>

          <p><strong>2. Сертифікат податкової для шифрування:</strong></p>
          <ul className="list-disc ml-4 space-y-1">
            <li>Завантажити з <a href="https://ca.tax.gov.ua" className="underline">ca.tax.gov.ua</a></li>
            <li>Потрібен для шифрування звітів перед подачею</li>
          </ul>

          <p><strong>3. Тестування:</strong></p>
          <ul className="list-disc ml-4 space-y-1">
            <li>Перевірити підключення на тестовому сервері: <code>cabinet.tax.gov.ua:9443</code></li>
            <li>Подати тестову декларацію перед реальною</li>
          </ul>

          <p><strong>4. Що подавати (ФОП 3 група):</strong></p>
          <ul className="list-disc ml-4 space-y-1">
            <li><strong>F0103309</strong> — декларація єдиного податку (щоквартально, наростаючим підсумком)</li>
            <li><strong>ЄСВ</strong> — єдиний соціальний внесок (в складі декларації)</li>
            <li><strong>Військовий збір</strong> — в складі декларації</li>
          </ul>

          <p><strong>Дедлайни 2025:</strong></p>
          <ul className="list-disc ml-4 space-y-1">
            <li>I квартал → до 12 травня</li>
            <li>Півріччя → до 11 серпня</li>
            <li>9 місяців → до 10 листопада</li>
            <li>Рік → до 9 лютого 2026</li>
          </ul>
        </div>
      </Card>
    </div>
  );
}
