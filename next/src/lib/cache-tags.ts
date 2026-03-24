/**
 * Semantic cache tags for Next.js tag-based revalidation.
 *
 * Usage in server actions (Next.js 16+):
 *   import { updateTag } from "next/cache";
 *   import { CACHE_TAGS } from "@/lib/cache-tags";
 *   updateTag(CACHE_TAGS.finance);
 *
 * Usage in data fetching ("use cache" + cacheTag):
 *   cacheTag(CACHE_TAGS.finance);
 */
export const CACHE_TAGS = {
  /** Transactions, budgets, accounts, recurring */
  finance: "finance",
  /** Workouts, exercises, sets */
  gym: "gym",
  /** Garmin, sleep, weight */
  health: "health",
  /** Food log */
  food: "food",
  /** Shopping items, history */
  shopping: "shopping",
  /** User settings, preferences */
  settings: "settings",
  /** Admin operations */
  admin: "admin",
  /** Broker data (IBKR, T212, eToro) */
  investments: "investments",
  /** Trading strategies, Freqtrade */
  trading: "trading",
  /** Tax data, reporting */
  reporting: "reporting",
} as const;

export type CacheTag = (typeof CACHE_TAGS)[keyof typeof CACHE_TAGS];
