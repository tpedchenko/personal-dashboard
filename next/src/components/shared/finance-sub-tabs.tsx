"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { useEnabledModules } from "@/hooks/use-enabled-modules";
import { isFinanceSubTabEnabled } from "@/lib/modules";

const tabs = [
  { key: "my_finances", href: "/finance", match: ["/finance"] },
  { key: "transactions", href: "/finance/transactions", match: ["/finance/transactions"] },
  { key: "subscriptions", href: "/finance/subscriptions", match: ["/finance/subscriptions"] },
  { key: "shopping", href: "/finance/shopping", match: ["/finance/shopping"] },
  { key: "investments", href: "/finance/investments", match: ["/finance/investments"] },
  { key: "trading", href: "/trading", match: ["/trading"] },
  { key: "reporting", href: "/reporting", match: ["/reporting"] },
];

export function FinanceSubTabs() {
  const t = useTranslations("nav");
  const pathname = usePathname();
  const { enabledModules } = useEnabledModules();

  const visibleTabs = tabs.filter((tab) =>
    isFinanceSubTabEnabled(tab.key, enabledModules)
  );

  return (
    <nav className="flex gap-1 rounded-lg bg-muted p-[3px] w-fit overflow-x-auto max-w-full">
      {visibleTabs.map((tab) => {
        const isActive = tab.match.some(m =>
          m === "/finance" ? pathname === "/finance" : pathname.startsWith(m)
        );
        return (
          <Link
            key={tab.key}
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
