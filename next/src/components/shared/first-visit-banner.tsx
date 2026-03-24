"use client";

import { useState, useEffect, useCallback } from "react";
import { useTranslations } from "next-intl";
import { X, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getUserPreference, setUserPreference } from "@/actions/settings";

interface FirstVisitBannerProps {
  moduleKey: string;
}

const MODULE_KEYS = [
  "Finance",
  "Dashboard",
  "Gym",
  "My Day",
  "Food",
  "List",
  "AI Chat",
  "Settings",
] as const;

export function FirstVisitBanner({ moduleKey }: FirstVisitBannerProps) {
  const t = useTranslations("module_descriptions");
  const tCommon = useTranslations("first_visit");
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const raw = await getUserPreference("visited_modules");
        const visited: string[] = raw ? JSON.parse(raw) : [];
        if (!visited.includes(moduleKey) && !cancelled) {
          setVisible(true);
        }
      } catch {
        // ignore errors — just don't show banner
      }
    })();
    return () => { cancelled = true; };
  }, [moduleKey]);

  const dismiss = useCallback(async () => {
    setVisible(false);
    try {
      const raw = await getUserPreference("visited_modules");
      const visited: string[] = raw ? JSON.parse(raw) : [];
      if (!visited.includes(moduleKey)) {
        visited.push(moduleKey);
        await setUserPreference("visited_modules", JSON.stringify(visited));
      }
    } catch {
      // ignore
    }
  }, [moduleKey]);

  if (!visible || !MODULE_KEYS.includes(moduleKey as typeof MODULE_KEYS[number])) {
    return null;
  }

  const description = t(moduleKey as typeof MODULE_KEYS[number]);

  return (
    <div className="mb-4 rounded-lg border border-blue-500/30 bg-blue-500/10 px-4 py-3 flex items-start gap-3">
      <Info className="h-5 w-5 text-blue-500 shrink-0 mt-0.5" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-blue-600 dark:text-blue-400">
          {tCommon("welcome_to_module", { module: moduleKey })}
        </p>
        <p className="text-sm text-muted-foreground mt-0.5">
          {description}
        </p>
      </div>
      <Button
        variant="ghost"
        size="sm"
        className="h-7 w-7 p-0 shrink-0 text-muted-foreground hover:text-foreground"
        onClick={dismiss}
      >
        <X className="h-4 w-4" />
      </Button>
    </div>
  );
}
