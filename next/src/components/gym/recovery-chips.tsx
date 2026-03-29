"use client";

import { useTranslations } from "next-intl";

type MuscleRecoveryItem = { name: string; lastWorked: string | null; recoveryHours: number };

function getHoursSince(lastWorked: string | null): number {
  if (!lastWorked) return Infinity;
  const now = Date.now();
  const worked = new Date(lastWorked + "T12:00:00").getTime();
  return (now - worked) / (1000 * 60 * 60);
}

function formatTimeSince(hours: number): string {
  if (!isFinite(hours)) return "—";
  if (hours >= 72) {
    const days = Math.floor(hours / 24);
    return `${days}d`;
  }
  return `${Math.round(hours)}h`;
}

export function RecoveryChips({ muscleGroups }: { muscleGroups: MuscleRecoveryItem[] }) {
  const t = useTranslations("gym");

  const getRecoveryPct = (lastWorked: string | null, recoveryHours: number): number => {
    if (!lastWorked) return 100;
    const hoursSince = getHoursSince(lastWorked);
    return Math.min(100, Math.round((hoursSince / recoveryHours) * 100));
  };

  const sorted = [...muscleGroups].sort(
    (a, b) => getRecoveryPct(a.lastWorked, a.recoveryHours) - getRecoveryPct(b.lastWorked, b.recoveryHours)
  );

  return (
    <div className="flex flex-wrap gap-1.5">
      {sorted.map((mg) => {
        const pct = getRecoveryPct(mg.lastWorked, mg.recoveryHours);
        const hours = getHoursSince(mg.lastWorked);
        const bgColor = pct > 80 ? "bg-green-500/15 text-green-700 dark:text-green-400 border-green-500/25"
          : pct >= 50 ? "bg-yellow-500/15 text-yellow-700 dark:text-yellow-400 border-yellow-500/25"
          : "bg-red-500/15 text-red-700 dark:text-red-400 border-red-500/25";
        return (
          <span key={mg.name} data-testid="recovery-chip" className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium border ${bgColor}`}>
            {t(`muscle_groups.${mg.name}`) || mg.name}
            <span className="font-bold tabular-nums text-[11px]">{formatTimeSince(hours)}</span>
          </span>
        );
      })}
    </div>
  );
}

// Re-export helpers for use in recommendation logic
export { getHoursSince, formatTimeSince };
export type { MuscleRecoveryItem };
