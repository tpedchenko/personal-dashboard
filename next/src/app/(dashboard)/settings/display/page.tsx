"use client";

import { useState, useEffect, useCallback } from "react";
import { useTranslations } from "next-intl";
import { useLocale } from "next-intl";
import { useTheme } from "next-themes";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  getUserPreference,
  setUserPreference,
  submitBugReport,
} from "@/actions/settings";

const COMMON_TIMEZONES = [
  "Europe/Kyiv",
  "Europe/London",
  "Europe/Berlin",
  "Europe/Paris",
  "Europe/Madrid",
  "Europe/Rome",
  "Europe/Warsaw",
  "Europe/Bucharest",
  "Europe/Moscow",
  "Europe/Istanbul",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "Asia/Tokyo",
  "Asia/Shanghai",
  "Asia/Dubai",
  "Australia/Sydney",
  "Pacific/Auckland",
];

export default function DisplayPage() {
  const t = useTranslations("settings");
  const { theme, setTheme } = useTheme();
  const locale = useLocale();
  const router = useRouter();

  const [skin, setSkin] = useState(() => {
    if (typeof document !== "undefined") {
      return document.documentElement.getAttribute("data-skin") || "easy";
    }
    return "easy";
  });
  const [timezone, setTimezone] = useState("Europe/Kyiv");
  const [firstDay, setFirstDay] = useState("monday");
  const [prefsSaving, setPrefsSaving] = useState(false);
  const [prefsLoaded, setPrefsLoaded] = useState(false);

  const [bugText, setBugText] = useState("");
  const [bugSending, setBugSending] = useState(false);

  const loadPreferences = useCallback(async () => {
    try {
      const [tz, fd] = await Promise.all([
        getUserPreference("timezone"),
        getUserPreference("first_day_of_week"),
      ]);
      if (tz) setTimezone(tz);
      if (fd) setFirstDay(fd);
    } catch {
      // ignore — defaults stay
    } finally {
      setPrefsLoaded(true);
    }
  }, []);

  useEffect(() => {
    loadPreferences();
  }, [loadPreferences]);

  function handleLocaleChange(newLocale: string) {
    document.cookie = `locale=${newLocale};path=/;max-age=31536000;SameSite=Lax;Secure`;
    router.refresh();
  }

  function handleSkinChange(newSkin: string) {
    setSkin(newSkin);
    if (newSkin === "easy") {
      document.documentElement.removeAttribute("data-skin");
    } else {
      document.documentElement.setAttribute("data-skin", newSkin);
    }
    document.cookie = `skin=${newSkin};path=/;max-age=31536000;SameSite=Lax;Secure`;
    // Taras & Neon skins force dark mode
    if (newSkin === "taras" || newSkin === "neon") {
      setTheme("dark");
    }
  }

  async function savePreferences() {
    setPrefsSaving(true);
    try {
      await Promise.all([
        setUserPreference("timezone", timezone),
        setUserPreference("first_day_of_week", firstDay),
      ]);
      toast.success(t("preferences_saved"));
    } catch {
      toast.error("Failed to save preferences");
    } finally {
      setPrefsSaving(false);
    }
  }

  async function handleBugReport() {
    const desc = bugText.trim();
    if (!desc) {
      toast.error(t("bug_empty"));
      return;
    }
    setBugSending(true);
    try {
      await submitBugReport(desc);
      toast.success(t("bug_sent"));
      setBugText("");
    } catch {
      toast.error("Failed to send report");
    } finally {
      setBugSending(false);
    }
  }

  return (
    <div className="space-y-4">
      {/* Theme */}
      <Card className="p-4 space-y-3">
        <h2 className="text-lg font-semibold">{t("color_scheme")}</h2>
        <RadioGroup
          value={theme ?? "system"}
          onValueChange={(val) => setTheme(val as string)}
          className="flex gap-4"
        >
          {(["light", "dark", "system"] as const).map((opt) => (
            <div key={opt} className="flex items-center gap-2">
              <RadioGroupItem value={opt} />
              <Label className="cursor-pointer">
                {opt === "light"
                  ? t("light")
                  : opt === "dark"
                    ? t("dark")
                    : "System"}
              </Label>
            </div>
          ))}
        </RadioGroup>
      </Card>

      {/* Skin */}
      <Card className="p-4 space-y-3">
        <h2 className="text-lg font-semibold">{t("skin") || "Skin"}</h2>
        <RadioGroup
          value={skin}
          onValueChange={handleSkinChange}
          className="flex gap-4"
        >
          <div className="flex items-center gap-2">
            <RadioGroupItem value="easy" />
            <Label className="cursor-pointer">Easy</Label>
          </div>
          <div className="flex items-center gap-2">
            <RadioGroupItem value="taras" />
            <Label className="cursor-pointer">Taras</Label>
          </div>
          <div className="flex items-center gap-2">
            <RadioGroupItem value="neon" />
            <Label className="cursor-pointer">Neon</Label>
          </div>
        </RadioGroup>
        <p className="text-xs text-muted-foreground">
          {skin === "taras" ? "Dark gold theme inspired by taras.cloud" : skin === "neon" ? "Cyberpunk neon — electric cyan & magenta" : "Default clean theme with light/dark modes"}
        </p>
      </Card>

      {/* Language */}
      <Card className="p-4 space-y-3">
        <h2 className="text-lg font-semibold">{t("language")}</h2>
        <RadioGroup
          value={locale}
          onValueChange={handleLocaleChange}
          className="flex gap-4"
        >
          <div className="flex items-center gap-2">
            <RadioGroupItem value="uk" />
            <Label className="cursor-pointer">Українська</Label>
          </div>
          <div className="flex items-center gap-2">
            <RadioGroupItem value="en" />
            <Label className="cursor-pointer">English</Label>
          </div>
        </RadioGroup>
      </Card>

      {/* Timezone + First Day of Week */}
      {prefsLoaded && (
        <Card className="p-4 space-y-4">
          <h2 className="text-lg font-semibold">{t("preferences")}</h2>

          {/* Timezone */}
          <div className="space-y-2">
            <Label>{t("timezone")}</Label>
            <p className="text-xs text-muted-foreground">{t("timezone_desc")}</p>
            <select
              value={timezone}
              onChange={(e) => setTimezone(e.target.value)}
              className="flex h-8 w-full max-w-xs rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
            >
              {COMMON_TIMEZONES.map((tz) => (
                <option key={tz} value={tz}>
                  {tz.replace(/_/g, " ")}
                </option>
              ))}
            </select>
          </div>

          {/* First Day of Week */}
          <div className="space-y-2">
            <Label>{t("first_day_of_week")}</Label>
            <RadioGroup
              value={firstDay}
              onValueChange={(v) => v && setFirstDay(v)}
              className="flex gap-4"
            >
              <div className="flex items-center gap-2">
                <RadioGroupItem value="monday" />
                <Label className="cursor-pointer">{t("monday")}</Label>
              </div>
              <div className="flex items-center gap-2">
                <RadioGroupItem value="sunday" />
                <Label className="cursor-pointer">{t("sunday")}</Label>
              </div>
            </RadioGroup>
          </div>

          <Button
            onClick={savePreferences}
            disabled={prefsSaving}
          >
            {prefsSaving ? "..." : t("preferences_saved").replace("!", "")}
          </Button>
        </Card>
      )}

      {/* Bug Report */}
      <Card className="p-4 space-y-3">
        <h2 className="text-lg font-semibold">{t("report_bug")}</h2>
        <div className="space-y-2">
          <Label>{t("bug_description")}</Label>
          <Textarea
            value={bugText}
            onChange={(e) => setBugText(e.target.value)}
            placeholder={t("bug_placeholder")}
            rows={4}
          />
        </div>
        <Button
          onClick={handleBugReport}
          disabled={bugSending}
        >
          {bugSending ? "..." : t("send_report")}
        </Button>
      </Card>
    </div>
  );
}
