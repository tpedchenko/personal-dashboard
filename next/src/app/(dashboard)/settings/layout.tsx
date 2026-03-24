"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { useState, useEffect } from "react";

type Tab = { key: string; href: string };

type SubCategory = { label: string; tabs: Tab[] };

type Group = {
  groupKey: string;
  tabs: Tab[];
  subCategories?: SubCategory[];
};

const groups: Group[] = [
  {
    groupKey: "group_finance",
    tabs: [
      { key: "accounts_tab", href: "/settings/accounts" },
      { key: "categories_tab", href: "/settings/categories" },
      { key: "budgets_tab", href: "/settings/budgets" },
      { key: "budget_auto_calc_tab", href: "/settings/budget-calc" },
      { key: "savings_tab", href: "/settings/savings" },
      { key: "recurring_tab", href: "/settings/recurring" },
      { key: "import_tab", href: "/settings/import" },
    ],
  },
  {
    groupKey: "group_finance_integrations",
    tabs: [
      { key: "integration_monobank", href: "/settings/integrations/monobank" },
      { key: "integration_bunq", href: "/settings/integrations/bunq" },
      { key: "integration_freqtrade", href: "/settings/integrations/freqtrade" },
      { key: "integration_ibkr", href: "/settings/integrations/ibkr" },
      { key: "integration_trading212", href: "/settings/integrations/trading212" },
      { key: "integration_etoro", href: "/settings/integrations/etoro" },
      { key: "integration_cobee", href: "/settings/integrations/cobee" },
      { key: "integration_tax_ua", href: "/settings/integrations/tax-ua" },
      { key: "integration_tax_es", href: "/settings/integrations/tax-es" },
    ],
    subCategories: [
      {
        label: "subcat_banks",
        tabs: [
          { key: "integration_monobank", href: "/settings/integrations/monobank" },
          { key: "integration_bunq", href: "/settings/integrations/bunq" },
        ],
      },
      {
        label: "subcat_trading",
        tabs: [
          { key: "integration_freqtrade", href: "/settings/integrations/freqtrade" },
        ],
      },
      {
        label: "subcat_investments",
        tabs: [
          { key: "integration_ibkr", href: "/settings/integrations/ibkr" },
          { key: "integration_trading212", href: "/settings/integrations/trading212" },
          { key: "integration_etoro", href: "/settings/integrations/etoro" },
        ],
      },
      {
        label: "subcat_other",
        tabs: [
          { key: "integration_cobee", href: "/settings/integrations/cobee" },
          { key: "integration_tax_ua", href: "/settings/integrations/tax-ua" },
          { key: "integration_tax_es", href: "/settings/integrations/tax-es" },
        ],
      },
    ],
  },
  {
    groupKey: "group_integrations",
    tabs: [
      { key: "integration_ai", href: "/settings/integrations/ai-providers" },
      { key: "integration_garmin", href: "/settings/integrations/garmin" },
      { key: "integration_withings", href: "/settings/integrations/withings" },
      { key: "integration_telegram", href: "/settings/integrations/telegram" },
    ],
  },
  {
    groupKey: "group_gym",
    tabs: [
      { key: "gym_planning_tab", href: "/settings/gym" },
      { key: "gym_exercises_tab", href: "/settings/gym/exercises" },
    ],
  },
  {
    groupKey: "group_display",
    tabs: [
      { key: "display", href: "/settings/display" },
    ],
  },
  {
    groupKey: "group_modules",
    tabs: [
      { key: "modules_tab", href: "/settings/modules" },
    ],
  },
  {
    groupKey: "group_other",
    tabs: [
      { key: "guests_tab", href: "/settings/guests" },
      { key: "ai_insights_tab", href: "/settings/ai-insights" },
      { key: "backup_tab", href: "/settings/backup" },
      { key: "bug_report_tab", href: "/settings/bug-report" },
      { key: "version_tab", href: "/settings/version" },
    ],
  },
];

function findActiveGroup(pathname: string): string {
  for (const group of groups) {
    for (const tab of group.tabs) {
      if (pathname.startsWith(tab.href)) {
        return group.groupKey;
      }
    }
  }
  return groups[0].groupKey;
}

export default function SettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const t = useTranslations("settings");
  const pathname = usePathname();
  const router = useRouter();
  const [activeGroup, setActiveGroup] = useState(() => findActiveGroup(pathname));

  // Sync active group when pathname changes (e.g. browser back/forward)
  useEffect(() => {
    const detected = findActiveGroup(pathname);
    if (detected !== activeGroup) {
      setActiveGroup(detected);
    }
  }, [pathname, activeGroup]);

  const currentGroup = groups.find((g) => g.groupKey === activeGroup) ?? groups[0];

  return (
    <div className="space-y-3">
      <h1 className="text-2xl font-bold">{t("title")}</h1>

      {/* Top-level group tabs */}
      <nav className="flex gap-1 rounded-lg bg-muted p-[3px] overflow-x-auto max-w-full scrollbar-hide">
        {groups.map((group) => (
          <button
            key={group.groupKey}
            onClick={() => {
              setActiveGroup(group.groupKey);
              router.push(group.tabs[0].href);
            }}
            className={cn(
              "inline-flex items-center justify-center rounded-md px-2.5 py-1.5 text-xs sm:text-sm sm:px-3 font-medium transition-all whitespace-nowrap shrink-0",
              activeGroup === group.groupKey
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {t(group.groupKey)}
          </button>
        ))}
      </nav>

      {/* Sub-tabs within the active group (only if >1 tab) */}
      {currentGroup.tabs.length > 1 && (
        <nav className="flex gap-1 items-center rounded-lg bg-muted/50 p-[3px] overflow-x-auto max-w-full scrollbar-hide">
          {currentGroup.subCategories
            ? currentGroup.subCategories.map((sub, i) => (
                <span key={sub.label} className="contents">
                  {i > 0 && <span className="w-px h-5 bg-border mx-1 shrink-0" />}
                  <span className="text-[10px] uppercase tracking-wider text-muted-foreground/60 px-1 shrink-0">{t(sub.label)}</span>
                  {sub.tabs.map((tab) => (
                    <Link
                      key={tab.href}
                      href={tab.href}
                      className={cn(
                        "inline-flex items-center justify-center rounded-md px-3 py-1.5 text-sm font-medium transition-all whitespace-nowrap",
                        pathname.startsWith(tab.href)
                          ? "bg-background text-foreground shadow-sm"
                          : "text-muted-foreground hover:text-foreground"
                      )}
                    >
                      {t(tab.key)}
                    </Link>
                  ))}
                </span>
              ))
            : currentGroup.tabs.map((tab) => (
                <Link
                  key={tab.href}
                  href={tab.href}
                  className={cn(
                    "inline-flex items-center justify-center rounded-md px-3 py-1.5 text-sm font-medium transition-all whitespace-nowrap",
                    pathname.startsWith(tab.href)
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  {t(tab.key)}
                </Link>
              ))}
        </nav>
      )}

      <div>{children}</div>
    </div>
  );
}
