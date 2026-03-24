"use client";

import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { useTranslations } from "next-intl";

export function HealthAutoSync() {
  const hasFired = useRef(false);
  const t = useTranslations("sync");

  useEffect(() => {
    if (hasFired.current) return;
    hasFired.current = true;

    (async () => {
      try {
        const res = await fetch("/api/sync/health", { method: "POST" });
        const data = await res.json();

        if (data.status === "ok") {
          toast.info(t("syncing"));
          // Simulate completion after a short delay (actual sync is Python-side)
          setTimeout(() => {
            toast.success(t("sync_complete"));
          }, 3000);
        }
        // If skipped, don't show any toast — sync was recent
      } catch {
        // Silently ignore sync errors — non-critical
      }
    })();
  }, [t]);

  return null;
}
