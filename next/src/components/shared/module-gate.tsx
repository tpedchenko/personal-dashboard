import { getEnabledModules } from "@/actions/settings";
import { Settings } from "lucide-react";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import type { ReactNode } from "react";

interface ModuleGateProps {
  /** Module key to check */
  moduleKey: string;
  children: ReactNode;
}

/**
 * Server component that checks if a module is enabled.
 * If disabled, renders a "module disabled" message instead of children.
 */
export async function ModuleGate({ moduleKey, children }: ModuleGateProps) {
  const enabledModules = await getEnabledModules();
  if (enabledModules.includes(moduleKey)) {
    return <>{children}</>;
  }

  const t = await getTranslations("modules");

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
