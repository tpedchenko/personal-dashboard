"use client";

import { useEffect } from "react";
import { useDeferredInject, type DeferredDashboardData } from "./dashboard-context";

type SlotKey = keyof DeferredDashboardData;

/**
 * Invisible client component that injects server-fetched data into the
 * DeferredDashboardProvider store. Rendered inside <Suspense> boundaries
 * so it streams in as each data group resolves.
 */
export function DashboardDataHydrator<K extends SlotKey>({
  slot,
  data,
}: {
  slot: K;
  data: DeferredDashboardData[K];
}) {
  const inject = useDeferredInject();

  useEffect(() => {
    inject(slot, data);
  }, [inject, slot, data]);

  return null;
}
