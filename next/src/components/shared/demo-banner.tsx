"use client";

import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { exitDemoMode } from "@/actions/demo";
import { X } from "lucide-react";

export function DemoBanner() {
  const t = useTranslations("demo");

  return (
    <div className="bg-amber-500/15 border-b border-amber-500/30 px-4 py-2 flex items-center justify-between gap-2">
      <p className="text-sm text-amber-600 dark:text-amber-400">
        {t("banner_message")}
      </p>
      <form action={exitDemoMode}>
        <Button type="submit" variant="ghost" size="sm" className="h-7 text-amber-600 dark:text-amber-400 hover:text-amber-700">
          <X className="h-4 w-4 mr-1" />
          {t("exit")}
        </Button>
      </form>
    </div>
  );
}
