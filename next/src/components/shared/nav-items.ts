import type { LucideIcon } from "lucide-react";
import {
  WalletIcon,
  CalendarCheckIcon,
  DumbbellIcon,
  AppleIcon,
  ShoppingCartIcon,
  LayoutDashboardIcon,
  BotMessageSquareIcon,
  SettingsIcon,
  ShieldIcon,
} from "lucide-react";

export interface NavItem {
  key: string;
  href: string;
  icon: LucideIcon;
  ownerOnly?: boolean;
}

export const navItems: NavItem[] = [
  { key: "finance", href: "/finance", icon: WalletIcon },
  { key: "my_day", href: "/my-day", icon: CalendarCheckIcon },
  { key: "gym", href: "/gym", icon: DumbbellIcon },
  { key: "food", href: "/food", icon: AppleIcon },
  { key: "list", href: "/list", icon: ShoppingCartIcon },
  { key: "dashboard", href: "/dashboard", icon: LayoutDashboardIcon },
  { key: "ai_chat", href: "/ai-chat", icon: BotMessageSquareIcon },
  { key: "settings", href: "/settings", icon: SettingsIcon },
  { key: "admin", href: "/admin", icon: ShieldIcon, ownerOnly: true },
];

// Finance sub-tabs
export const financeSubTabs = [
  { key: "my_finances", href: "/finance" },
  { key: "investments", href: "/finance/investments" },
  { key: "trading", href: "/trading" },
  { key: "reporting", href: "/reporting" },
];
