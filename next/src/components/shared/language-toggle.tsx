"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { useLocale } from "next-intl";

const localeOrder = ["uk", "en", "es"] as const;
const localeLabels: Record<string, string> = {
  uk: "UA",
  en: "EN",
  es: "ES",
};

export function LanguageToggle() {
  const locale = useLocale();
  const router = useRouter();

  const cycleLocale = () => {
    const currentIndex = localeOrder.indexOf(locale as (typeof localeOrder)[number]);
    const nextIndex = (currentIndex + 1) % localeOrder.length;
    const newLocale = localeOrder[nextIndex];
    document.cookie = `locale=${newLocale};path=/;max-age=31536000;SameSite=Lax;Secure`;
    router.refresh();
  };

  return (
    <Button variant="ghost" size="sm" onClick={cycleLocale} aria-label="Switch language">
      {localeLabels[locale] || locale.toUpperCase()}
    </Button>
  );
}
