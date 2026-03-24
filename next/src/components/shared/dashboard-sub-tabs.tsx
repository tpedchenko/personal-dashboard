"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";

const tabs = [
  { key: "dashboard_life", href: "/dashboard", match: ["/dashboard"] },
  { key: "dashboard_finance", href: "/dashboard/finance", match: ["/dashboard/finance"] },
  { key: "dashboard_training", href: "/dashboard/training", match: ["/dashboard/training"] },
];

export function DashboardSubTabs() {
  const t = useTranslations("nav");
  const pathname = usePathname();

  return (
    <nav role="tablist" aria-label="Dashboard sections" className="flex gap-1 rounded-lg bg-muted p-[3px] w-fit overflow-x-auto max-w-full">
      {tabs.map((tab) => {
        const isActive = tab.match.some(m =>
          m === "/dashboard" ? pathname === "/dashboard" : pathname.startsWith(m)
        );
        return (
          <Link
            key={tab.key}
            role="tab"
            aria-selected={isActive}
            data-testid={`dashboard-tab-${tab.key.replace("dashboard_", "")}`}
            href={tab.href}
            className={cn(
              "inline-flex items-center justify-center rounded-md px-3 py-1.5 text-sm font-medium transition-all whitespace-nowrap min-h-[44px]",
              isActive
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {t(tab.key)}
          </Link>
        );
      })}
    </nav>
  );
}
