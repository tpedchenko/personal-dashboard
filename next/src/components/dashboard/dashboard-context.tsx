"use client";

import { createContext, useContext, useRef, useSyncExternalStore } from "react";
import type {
  MonthlyTrend,
  CorrelationPoint,
  MonthlyDeepDive,
  GarminHealthTrends,
  MoodTimelinePoint,
  HRVTrendPoint,
  ExerciseOption,
  WeeklyMuscleVolumeRow,
  ExtendedCorrelations,
} from "@/actions/dashboard";

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

interface TradingPnL {
  totalFiat: number;
  totalPct: number;
  currency: string;
  openTrades: number;
}

export interface DeferredDashboardData {
  trends?: MonthlyTrend[];
  correlations?: CorrelationPoint[];
  deepDive?: MonthlyDeepDive;
  garminHealth?: GarminHealthTrends;
  moodTimeline?: MoodTimelinePoint[];
  hrvTrend?: HRVTrendPoint[];
  exerciseList?: ExerciseOption[];
  weeklyMuscleVolume?: WeeklyMuscleVolumeRow[];
  extendedCorrelations?: ExtendedCorrelations;
  tradingPnL?: TradingPnL | null;
}

type SlotKey = keyof DeferredDashboardData;

interface DeferredStore {
  data: DeferredDashboardData;
  inject: (slot: SlotKey, value: unknown) => void;
  subscribe: (cb: () => void) => () => void;
  getSnapshot: () => DeferredDashboardData;
}

/* ------------------------------------------------------------------ */
/* Store factory                                                       */
/* ------------------------------------------------------------------ */

function createDeferredStore(): DeferredStore {
  let data: DeferredDashboardData = {};
  const listeners = new Set<() => void>();

  return {
    get data() { return data; },
    inject(slot, value) {
      data = { ...data, [slot]: value };
      listeners.forEach((cb) => cb());
    },
    subscribe(cb) {
      listeners.add(cb);
      return () => { listeners.delete(cb); };
    },
    getSnapshot() { return data; },
  };
}

/* ------------------------------------------------------------------ */
/* Context                                                             */
/* ------------------------------------------------------------------ */

const DeferredCtx = createContext<DeferredStore | null>(null);

export function DeferredDashboardProvider({ children }: { children: React.ReactNode }) {
  const storeRef = useRef<DeferredStore | null>(null);
  if (!storeRef.current) storeRef.current = createDeferredStore();
  return <DeferredCtx.Provider value={storeRef.current}>{children}</DeferredCtx.Provider>;
}

const EMPTY: DeferredDashboardData = {};
const EMPTY_SUB = () => () => {};
const EMPTY_SNAP = () => EMPTY;

/** Hook to read deferred data reactively */
export function useDeferredDashboardData(): DeferredDashboardData {
  const store = useContext(DeferredCtx);
  return useSyncExternalStore(
    store?.subscribe ?? EMPTY_SUB,
    store?.getSnapshot ?? EMPTY_SNAP,
    store?.getSnapshot ?? EMPTY_SNAP,
  );
}

/** Hook to get the inject function */
export function useDeferredInject() {
  const store = useContext(DeferredCtx);
  if (!store) throw new Error("DeferredDashboardProvider not found");
  return store.inject;
}
