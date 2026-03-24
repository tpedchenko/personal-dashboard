/**
 * Module system — defines available modules and maps them to nav/route keys.
 *
 * Each module can be toggled per-user via user_preferences (key: "enabled_modules").
 * When disabled, navigation items and pages for that module are hidden/blocked.
 *
 * Global feature flags (env vars) take priority — see lib/features.ts.
 */

import { FEATURES, type FeatureKey } from "./features";

/** Map module keys to feature flag keys */
const MODULE_TO_FEATURE: Record<string, FeatureKey> = {
  finance: "finance",
  investments: "investments",
  trading: "trading",
  reporting: "reporting",
  gym: "gym",
  my_day: "health",
  food: "food",
  list: "shopping",
  ai_chat: "aiChat",
};

/** Check if a module is globally enabled via feature flags */
function isModuleGloballyEnabled(moduleKey: string): boolean {
  const featureKey = MODULE_TO_FEATURE[moduleKey];
  if (!featureKey) return true; // No flag → always enabled (dashboard, settings, admin)
  return FEATURES[featureKey];
}

export interface ModuleDefinition {
  /** Unique key stored in user_preferences JSON array */
  key: string;
  /** i18n key inside "modules" namespace */
  labelKey: string;
  /** i18n key inside "modules" namespace for description */
  descriptionKey: string;
  /** Nav item keys (from nav-items.ts) that belong to this module */
  navKeys: string[];
  /** Route prefixes that belong to this module (used for page-level protection) */
  routes: string[];
  /** Finance sub-tab keys that belong to this module */
  financeSubTabKeys?: string[];
  /** Group key for settings page grouping */
  group: "finance" | "health" | "productivity";
}

export const ALL_MODULES: ModuleDefinition[] = [
  {
    key: "finance",
    labelKey: "Finance",
    descriptionKey: "finance_desc",
    navKeys: ["finance"],
    routes: ["/finance"],
    financeSubTabKeys: ["my_finances", "transactions"],
    group: "finance",
  },
  {
    key: "investments",
    labelKey: "Investments",
    descriptionKey: "investments_desc",
    navKeys: [],
    routes: ["/finance/investments"],
    financeSubTabKeys: ["investments"],
    group: "finance",
  },
  {
    key: "trading",
    labelKey: "Trading",
    descriptionKey: "trading_desc",
    navKeys: [],
    routes: ["/trading"],
    financeSubTabKeys: ["trading"],
    group: "finance",
  },
  {
    key: "reporting",
    labelKey: "Reporting",
    descriptionKey: "reporting_desc",
    navKeys: [],
    routes: ["/reporting"],
    financeSubTabKeys: ["reporting"],
    group: "finance",
  },
  {
    key: "my_day",
    labelKey: "My Day",
    descriptionKey: "my_day_desc",
    navKeys: ["my_day"],
    routes: ["/my-day"],
    group: "health",
  },
  {
    key: "gym",
    labelKey: "Gym",
    descriptionKey: "gym_desc",
    navKeys: ["gym"],
    routes: ["/gym"],
    group: "health",
  },
  {
    key: "food",
    labelKey: "Food",
    descriptionKey: "food_desc",
    navKeys: ["food"],
    routes: ["/food"],
    group: "health",
  },
  {
    key: "dashboard",
    labelKey: "Dashboard",
    descriptionKey: "dashboard_desc",
    navKeys: ["dashboard"],
    routes: ["/dashboard"],
    group: "productivity",
  },
  {
    key: "list",
    labelKey: "List",
    descriptionKey: "list_desc",
    navKeys: ["list"],
    routes: ["/list"],
    group: "productivity",
  },
  {
    key: "ai_chat",
    labelKey: "AI Chat",
    descriptionKey: "ai_chat_desc",
    navKeys: ["ai_chat"],
    routes: ["/ai-chat"],
    group: "productivity",
  },
];

/** Module group definitions for settings page */
export const MODULE_GROUPS = [
  { key: "finance" as const, labelKey: "group_finance" },
  { key: "health" as const, labelKey: "group_health" },
  { key: "productivity" as const, labelKey: "group_productivity" },
] as const;

/** Get modules grouped by their group key */
export function getModulesByGroup(): { group: typeof MODULE_GROUPS[number]; modules: ModuleDefinition[] }[] {
  return MODULE_GROUPS.map((group) => ({
    group,
    modules: ALL_MODULES.filter((m) => m.group === group.key),
  }));
}

/** All module keys — used as default (all enabled) */
export const ALL_MODULE_KEYS = ALL_MODULES.map((m) => m.key);

/** Check if a nav key is allowed given a set of enabled module keys */
export function isNavKeyEnabled(navKey: string, enabledModules: string[]): boolean {
  // Settings and admin are always visible
  if (navKey === "settings" || navKey === "admin") return true;

  // Finance nav key is special: visible if any of finance/investments/trading/reporting enabled
  if (navKey === "finance") {
    const financeModules = ["finance", "investments", "trading", "reporting"];
    return financeModules.some((k) =>
      isModuleGloballyEnabled(k) && enabledModules.includes(k)
    );
  }

  const mod = ALL_MODULES.find((m) => m.navKeys.includes(navKey));
  if (!mod) return true; // Unknown nav keys are always shown
  // Check global feature flag first, then user preference
  if (!isModuleGloballyEnabled(mod.key)) return false;
  return enabledModules.includes(mod.key);
}

/** Check if a finance sub-tab key is allowed */
export function isFinanceSubTabEnabled(tabKey: string, enabledModules: string[]): boolean {
  const mod = ALL_MODULES.find((m) => m.financeSubTabKeys?.includes(tabKey));
  if (!mod) return true;
  if (!isModuleGloballyEnabled(mod.key)) return false;
  return enabledModules.includes(mod.key);
}

/** Check if a route is allowed given enabled modules */
export function isRouteEnabled(pathname: string, enabledModules: string[]): boolean {
  for (const mod of ALL_MODULES) {
    for (const route of mod.routes) {
      // Check if pathname matches or starts with route
      if (pathname === route || pathname.startsWith(route + "/")) {
        if (!isModuleGloballyEnabled(mod.key)) return false;
        if (!enabledModules.includes(mod.key)) return false;
      }
    }
  }
  return true;
}
