import type { SplitRecommendation } from "@/types/gym";
import type { MuscleRecoveryItem } from "./recovery-chips";

// Re-export types from canonical location for backward compatibility
export type { GarminActivityItem, GymProgram, GymProgramDay, GymProgramExercise, GymStats, SplitRecommendation } from "@/types/gym";

export const SPLITS: SplitRecommendation[] = [
  { name: "Push", nameKey: "push_day", muscles: ["Chest", "Shoulders", "Triceps"] },
  { name: "Pull", nameKey: "pull_day", muscles: ["Back", "Biceps"] },
  { name: "Legs", nameKey: "legs", muscles: ["Quads", "Hamstrings", "Glutes", "Calves"] },
  { name: "Full Body", nameKey: "full_body", muscles: ["Chest", "Back", "Shoulders", "Quads", "Hamstrings"] },
];

export function getWorkoutRecommendation(
  muscleGroups: MuscleRecoveryItem[]
): { split: SplitRecommendation; recoveredMuscles: string[] } | null {
  const getRecoveryPct = (lastWorked: string | null, recoveryHours: number): number => {
    if (!lastWorked) return 100;
    const now = Date.now();
    const worked = new Date(lastWorked + "T12:00:00").getTime();
    const hoursSince = (now - worked) / (1000 * 60 * 60);
    return Math.min(100, Math.round((hoursSince / recoveryHours) * 100));
  };

  const recoveryMap: Record<string, number> = {};
  for (const mg of muscleGroups) {
    recoveryMap[mg.name] = getRecoveryPct(mg.lastWorked, mg.recoveryHours);
  }

  // Find the best split: highest average recovery among its muscles, all >80%
  let bestSplit: SplitRecommendation | null = null;
  let bestScore = 0;
  let bestRecovered: string[] = [];

  for (const split of SPLITS) {
    const muscleRecoveries = split.muscles.map((m) => recoveryMap[m] ?? 100);
    const allReady = muscleRecoveries.every((r) => r > 80);
    if (!allReady) continue;

    const avgRecovery = muscleRecoveries.reduce((a, b) => a + b, 0) / muscleRecoveries.length;
    if (avgRecovery > bestScore) {
      bestScore = avgRecovery;
      bestSplit = split;
      bestRecovered = split.muscles.filter((m) => (recoveryMap[m] ?? 100) > 80);
    }
  }

  if (!bestSplit) return null;
  return { split: bestSplit, recoveredMuscles: bestRecovered };
}
