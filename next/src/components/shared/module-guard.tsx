"use client";

import { useEnabledModules } from "@/hooks/use-enabled-modules";
import { useTranslations } from "next-intl";
import { Settings } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

interface ModuleGuardProps {
  /** Module key to check (from ALL_MODULES) */
  moduleKey: string;
  children: ReactNode;
}

/**
 * Wraps a page and shows a "module disabled" message if the module is not enabled.
 * Does not redirect — shows an inline message with a link to settings.
 */
export function ModuleGuard({ moduleKey, children }: ModuleGuardProps) {
  const { enabledModules, isLoaded } = useEnabledModules();
  const t = useTranslations("modules");

  // While loading, show nothing to avoid flash
  if (!isLoaded) return null;

  if (!enabledModules.includes(moduleKey)) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-20 text-center">
        <div className="rounded-full bg-muted p-4">
          <Settings className="size-8 text-muted-foreground" />
        </div>
        <div className="space-y-2">
          <h2 className="text-lg font-semibold">{t("module_disabled_title")}</h2>
          <p className="text-sm text-muted-foreground max-w-md">
            {t("module_disabled_desc")}
          </p>
        </div>
        <Link
          href="/settings/modules"
          className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          <Settings className="size-4" />
          {t("go_to_settings")}
        </Link>
      </div>
    );
  }

  return <>{children}</>;
}
