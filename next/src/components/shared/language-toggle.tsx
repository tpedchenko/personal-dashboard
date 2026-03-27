"use client";

import { useRouter } from "next/navigation";
import { useLocale } from "next-intl";

const locales = ["en", "uk", "es"] as const;
const localeLabels: Record<string, string> = {
  en: "EN",
  uk: "UA",
  es: "ES",
};

export function LanguageToggle() {
  const locale = useLocale();
  const router = useRouter();

  const setLocale = (newLocale: string) => {
    if (newLocale === locale) return;
    localStorage.setItem("locale", newLocale);
    document.cookie = `locale=${newLocale};path=/;max-age=31536000;SameSite=Lax;Secure`;
    router.refresh();
  };

  return (
    <div
      className="inline-flex items-center rounded-md border border-border bg-muted/40 p-0.5 gap-0.5"
      role="radiogroup"
      aria-label="Select language"
    >
      {locales.map((loc) => {
        const isActive = loc === locale;
        return (
          <button
            key={loc}
            role="radio"
            aria-checked={isActive}
            onClick={() => setLocale(loc)}
            className={`
              px-2 py-0.5 text-xs font-medium rounded-sm transition-colors cursor-pointer
              ${
                isActive
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted"
              }
            `}
          >
            {localeLabels[loc]}
          </button>
        );
      })}
    </div>
  );
}
