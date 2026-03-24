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

export default function TaxESIntegrationPage() {
  const isDemo = useDemoMode();
  const t = useTranslations("settings");
  const tc = useTranslations("common");
  const [isPending, startTransition] = useTransition();
  const [nif, setNif] = useState("");
  const [certPassword, setCertPassword] = useState("");
  const [saved, setSaved] = useState(false);
  const [configured, setConfigured] = useState(false);
  const [certFileName, setCertFileName] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [readOnly, setReadOnly] = useState(false);

  useEffect(() => {
    startTransition(async () => {
      const [savedNif, savedCert, savedCertFile] = await Promise.all([
        getSecret("tax_es_nif"),
        getSecret("tax_es_cert_password"),
        getSecret("tax_es_cert_filename"),
      ]);
      if (savedNif) { setNif(savedNif); setConfigured(true); }
      if (savedCert) setCertPassword("••••••••");
      if (savedCertFile) setCertFileName(savedCertFile);
      const ro = await getUserPreference("tax_es_read_only");
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
      formData.append("type", "cert_es");
      const res = await fetch("/api/upload/certificate", { method: "POST", body: formData });
      const data = await res.json();
      if (data.success) {
        setCertFileName(data.fileName);
        toast.success(`${data.fileName} uploaded`);
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
      await setSecret("tax_es_nif", nif.trim());
      if (!certPassword.startsWith("••••")) {
        await setSecret("tax_es_cert_password", certPassword.trim());
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
      <h2 className="text-lg font-semibold">{t("tax_es_title")}</h2>

      <Card className="p-4 space-y-4">
        <div className="flex items-center gap-2">
          <span className="font-medium">Status:</span>
          <Badge variant={configured ? "default" : "secondary"}>
            {configured ? t("tax_es_configured") : t("tax_es_not_configured")}
          </Badge>
        </div>

        <div className="flex items-center justify-between">
          <Label htmlFor="tax-es-readonly" className="cursor-pointer">
            {readOnly ? "🔒 Read-only (submission disabled)" : "🔓 Full access (submission enabled)"}
          </Label>
          <Switch
            id="tax-es-readonly"
            checked={readOnly}
            onCheckedChange={(checked) => {
              setReadOnly(checked);
              startTransition(async () => {
                await setUserPreference("tax_es_read_only", checked ? "true" : "false");
              });
            }}
          />
        </div>

        <div className="space-y-1">
          <Label>NIF / NIE</Label>
          <PasswordInput value={nif} onChange={(e) => setNif(e.target.value)} placeholder="X1234567A" />
        </div>

        <div className="space-y-1">
          <Label>{t("tax_es_cert_label")}</Label>
          <div className="flex items-center gap-2">
            <Input type="file" accept=".pfx,.p12" onChange={handleFileUpload} disabled={isDemo || uploading} className="text-sm" />
            {certFileName && <Badge variant="secondary" className="shrink-0">{certFileName}</Badge>}
          </div>
        </div>

        <div className="space-y-1">
          <Label>{t("tax_es_cert_password")}</Label>
          <PasswordInput value={certPassword} onChange={(e) => setCertPassword(e.target.value)} placeholder="Certificate password" />
        </div>

        <Button onClick={handleSave} disabled={isDemo || isPending}>{tc("save")}</Button>
        {saved && <p className="text-sm text-green-600">{tc("saved")}</p>}
      </Card>

      <Card className="p-4 space-y-3">
        <h3 className="font-medium">{t("tax_es_instructions")}</h3>
        <div className="text-sm text-muted-foreground space-y-2">
          <p><strong>{t("tax_es_cert_step")}</strong></p>
          <ul className="list-disc ml-4 space-y-1">
            <li>{t("tax_es_cert_desc1")}</li>
            <li>{t("tax_es_cert_desc2")}</li>
            <li>{t("tax_es_cert_desc3")}</li>
          </ul>

          <p><strong>{t("tax_es_models_step")}</strong></p>
          <ul className="list-disc ml-4 space-y-1">
            <li><strong>Modelo 100</strong> — {t("tax_es_modelo100")}</li>
            <li><strong>Modelo 720</strong> — {t("tax_es_modelo720")}</li>
            <li><strong>Modelo 721</strong> — {t("tax_es_modelo721")}</li>
            <li><strong>Modelo 130</strong> — {t("tax_es_modelo130")}</li>
          </ul>

          <p><strong>{t("tax_es_rates_step")}</strong></p>
          <ul className="list-disc ml-4 space-y-1">
            <li>{t("tax_es_rate1")}</li>
            <li>{t("tax_es_rate2")}</li>
            <li>{t("tax_es_rate3")}</li>
            <li>{t("tax_es_rate4")}</li>
            <li>{t("tax_es_rate5")}</li>
          </ul>

          <p><strong>{t("tax_es_datos_step")}</strong></p>
          <ul className="list-disc ml-4">
            <li>{t("tax_es_datos_desc")}</li>
          </ul>

          <p><strong>{t("tax_es_test_step")}</strong></p>
          <ul className="list-disc ml-4">
            <li>{t("tax_es_test_desc")}</li>
          </ul>
        </div>
      </Card>
    </div>
  );
}
