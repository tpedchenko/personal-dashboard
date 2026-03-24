import type { ShoppingItem } from "@/generated/prisma/client";

/* ─── optimistic types ─────────────────────────────────────────────── */

export type OptimisticAction =
  | { type: "add"; item: ShoppingItem }
  | { type: "toggle"; id: number }
  | { type: "delete"; id: number }
  | { type: "clearBought" };

export function optimisticReducer(
  state: ShoppingItem[],
  action: OptimisticAction
): ShoppingItem[] {
  switch (action.type) {
    case "add":
      return [action.item, ...state];
    case "toggle":
      return state.map((item) =>
        item.id === action.id
          ? {
              ...item,
              boughtAt: item.boughtAt ? null : new Date(),
              boughtBy: item.boughtAt ? null : "app",
            }
          : item
      );
    case "delete":
      return state.filter((item) => item.id !== action.id);
    case "clearBought":
      return state.filter((item) => !item.boughtAt);
    default:
      return state;
  }
}

/* ─── helper: format date to YYYY-MM-DD ────────────────────────────── */

export function toDateStr(d: Date) {
  return d.toISOString().slice(0, 10);
}

/* ─── period helpers for stats ─────────────────────────────────────── */

export type StatsPeriod = "all" | "month" | "3months" | "year";

export function periodRange(period: StatsPeriod): { from: string; to: string } {
  const now = new Date();
  const to = toDateStr(now);
  switch (period) {
    case "month": {
      const d = new Date(now);
      d.setMonth(d.getMonth() - 1);
      return { from: toDateStr(d), to };
    }
    case "3months": {
      const d = new Date(now);
      d.setMonth(d.getMonth() - 3);
      return { from: toDateStr(d), to };
    }
    case "year": {
      return { from: `${now.getFullYear()}-01-01`, to };
    }
    default:
      return { from: "2000-01-01", to };
  }
}

/* ─── types for history / stats data ──────────────────────────────── */

export type HistoryRow = {
  id: number;
  itemName: string;
  quantity: string | null;
  boughtDate: string;
  boughtBy: string | null;
  userId: number | null;
};

export type StatsRow = {
  itemName: string;
  count: number;
  lastBought: string;
};
