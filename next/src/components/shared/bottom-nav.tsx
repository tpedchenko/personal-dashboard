"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { useRef, useEffect } from "react";
import { navItems } from "./nav-items";
import { cn } from "@/lib/utils";
import { useScrollMemory } from "@/hooks/use-scroll-memory";
import { usePullToRefresh } from "@/hooks/use-pull-to-refresh";
import { useEnabledModules } from "@/hooks/use-enabled-modules";
import { isNavKeyEnabled } from "@/lib/modules";

interface BottomNavProps {
  userRole?: string;
}

const mobileItems = navItems.filter((item) => item.key !== "admin");

export function BottomNav({ userRole }: BottomNavProps) {
  const pathname = usePathname();
  const t = useTranslations("nav");
  useScrollMemory();
  usePullToRefresh();
  const { enabledModules } = useEnabledModules();
  const isOwner = userRole === "owner";
  const scrollRef = useRef<HTMLDivElement>(null);
  const activeRef = useRef<HTMLAnchorElement>(null);

  const items = (isOwner ? navItems : mobileItems).filter((item) =>
    isNavKeyEnabled(item.key, enabledModules)
  );

  // Scroll active tab into view on mount and route change
  useEffect(() => {
    if (activeRef.current && scrollRef.current) {
      const container = scrollRef.current;
      const el = activeRef.current;
      const left = el.offsetLeft - container.offsetWidth / 2 + el.offsetWidth / 2;
      container.scrollTo({ left, behavior: "smooth" });
    }
  }, [pathname]);

  return (
    <nav role="navigation" aria-label="Main navigation">
      <div
        ref={scrollRef}
        className="flex overflow-x-auto scrollbar-hide gap-1 px-2 py-1.5 border-t border-border/50"
        style={{
          WebkitOverflowScrolling: "touch",
          scrollbarWidth: "none",
          msOverflowStyle: "none",
        }}
      >
        {items.map((item) => {
          const isActive = pathname.startsWith(item.href);
          return (
            <Link
              key={item.key}
              ref={isActive ? activeRef : undefined}
              href={item.href}
              data-testid={`nav-${item.key}`}
              onClick={() => navigator?.vibrate?.(10)}
              aria-current={isActive ? "page" : undefined}
              className={cn(
                "flex items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-2 text-sm transition-colors shrink-0 min-h-[44px] min-w-[44px] active:scale-95",
                isActive
                  ? "bg-primary text-primary-foreground font-medium shadow-sm"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
              )}
            >
              <item.icon className="size-4 shrink-0" />
              <span className="leading-tight">{t(item.key)}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
