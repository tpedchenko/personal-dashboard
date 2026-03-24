"use client";

import { useEffect, useState, useCallback } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  getEnabledModules,
  setEnabledModules,
} from "@/actions/settings";
import { useEnabledModules } from "@/hooks/use-enabled-modules";
import { getModulesByGroup } from "@/lib/modules";

export default function ModulesSettingsPage() {
  const t = useTranslations("settings");
  const tm = useTranslations("modules");
  const [enabled, setEnabled] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const { refresh } = useEnabledModules();

  const loadModules = useCallback(async () => {
    try {
      const modules = await getEnabledModules();
      setEnabled(modules);
    } catch {
      // defaults stay
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    loadModules();
  }, [loadModules]);

  function toggleModule(key: string) {
    setEnabled((prev) =>
      prev.includes(key) ? prev.filter((m) => m !== key) : [...prev, key]
    );
  }

  async function handleSave() {
    setSaving(true);
    try {
      await setEnabledModules(enabled);
      await refresh();
      toast.success(t("modules_updated"));
    } catch {
      toast.error("Failed to save modules");
    } finally {
      setSaving(false);
    }
  }

  if (!loaded) return null;

  return (
    <div className="space-y-4">
      <Card className="p-4 space-y-4">
        <h2 className="text-lg font-semibold">{t("enabled_modules")}</h2>
        <p className="text-sm text-muted-foreground">{tm("modules_description")}</p>

        <div className="space-y-6">
          {getModulesByGroup().map(({ group, modules }) => (
            <div key={group.key} className="space-y-3">
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                {tm(group.labelKey)}
              </h3>
              <div className="space-y-3 pl-1">
                {modules.map((mod) => (
                  <div key={mod.key} className="flex items-start gap-3">
                    <Checkbox
                      id={`mod-${mod.key}`}
                      checked={enabled.includes(mod.key)}
                      onCheckedChange={() => toggleModule(mod.key)}
                      className="mt-0.5"
                    />
                    <div className="space-y-0.5">
                      <Label htmlFor={`mod-${mod.key}`} className="cursor-pointer text-sm font-medium">
                        {tm(mod.labelKey)}
                      </Label>
                      <p className="text-xs text-muted-foreground">
                        {tm(mod.descriptionKey)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        <Button onClick={handleSave} disabled={saving}>
          {saving ? "..." : t("save_modules")}
        </Button>
      </Card>
    </div>
  );
}
