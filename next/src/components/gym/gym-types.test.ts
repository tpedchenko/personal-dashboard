import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { getWorkoutRecommendation, SPLITS } from "./gym-types";
import type { MuscleRecoveryItem } from "./recovery-chips";

/**
 * Helper: create a MuscleRecoveryItem with sensible defaults.
 * recoveryHours defaults to 48 (typical for most muscle groups).
 */
function muscle(name: string, lastWorked: string | null, recoveryHours = 48): MuscleRecoveryItem {
  return { name, lastWorked, recoveryHours };
}

/** Returns an ISO date string N days before now. */
function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10); // YYYY-MM-DD
}

/** Today's date as YYYY-MM-DD */
function today(): string {
  return new Date().toISOString().slice(0, 10);
}

describe("getWorkoutRecommendation", () => {
  it("recommends best split when all muscles are 100% recovered", () => {
    // All muscles never worked → 100% recovery
    const muscles: MuscleRecoveryItem[] = [
      muscle("Chest", null),
      muscle("Shoulders", null),
      muscle("Triceps", null),
      muscle("Back", null),
      muscle("Biceps", null),
      muscle("Quads", null),
      muscle("Hamstrings", null),
      muscle("Glutes", null),
      muscle("Calves", null),
    ];

    const result = getWorkoutRecommendation(muscles);
    expect(result).not.toBeNull();
    // All at 100% — every split qualifies; the first with avgRecovery > bestScore wins.
    // Since all are 100%, the first split checked that beats 0 wins — "Push" (index 0).
    expect(result!.split.name).toBeDefined();
    expect(result!.recoveredMuscles.length).toBeGreaterThan(0);
  });

  it("excludes a split when one of its muscles is below 80%", () => {
    // Chest worked today → recovery ~0%, so Push & Full Body should be excluded
    const muscles: MuscleRecoveryItem[] = [
      muscle("Chest", today(), 48),
      muscle("Shoulders", daysAgo(5), 48),
      muscle("Triceps", daysAgo(5), 48),
      muscle("Back", daysAgo(5), 48),
      muscle("Biceps", daysAgo(5), 48),
      muscle("Quads", daysAgo(5), 48),
      muscle("Hamstrings", daysAgo(5), 48),
      muscle("Glutes", daysAgo(5), 48),
      muscle("Calves", daysAgo(5), 48),
    ];

    const result = getWorkoutRecommendation(muscles);
    expect(result).not.toBeNull();
    // Push requires Chest → excluded. Full Body requires Chest → excluded.
    // Pull or Legs should be recommended.
    expect(["Pull", "Legs"]).toContain(result!.split.name);
  });

  it("returns ~0% recovery when lastWorked is today", () => {
    // All muscles worked today with 48h recovery → all below 80% → no recommendation
    const muscles: MuscleRecoveryItem[] = [
      muscle("Chest", today(), 48),
      muscle("Shoulders", today(), 48),
      muscle("Triceps", today(), 48),
      muscle("Back", today(), 48),
      muscle("Biceps", today(), 48),
      muscle("Quads", today(), 48),
      muscle("Hamstrings", today(), 48),
      muscle("Glutes", today(), 48),
      muscle("Calves", today(), 48),
    ];

    const result = getWorkoutRecommendation(muscles);
    expect(result).toBeNull();
  });

  it("treats lastWorked = null as 100% recovery", () => {
    // Only provide muscles for Pull split, all with null lastWorked
    const muscles: MuscleRecoveryItem[] = [
      muscle("Back", null),
      muscle("Biceps", null),
    ];

    const result = getWorkoutRecommendation(muscles);
    expect(result).not.toBeNull();
    // Pull split muscles are all 100%, and unknown muscles default to 100% in the function
    expect(result!.split).toBeDefined();
  });

  it("returns null when no split has all muscles above 80%", () => {
    // Every key muscle worked today → nothing qualifies
    const muscles: MuscleRecoveryItem[] = [
      muscle("Chest", today(), 72),
      muscle("Shoulders", today(), 72),
      muscle("Triceps", today(), 72),
      muscle("Back", today(), 72),
      muscle("Biceps", today(), 72),
      muscle("Quads", today(), 72),
      muscle("Hamstrings", today(), 72),
      muscle("Glutes", today(), 72),
      muscle("Calves", today(), 72),
    ];

    const result = getWorkoutRecommendation(muscles);
    expect(result).toBeNull();
  });

  it("picks the split with higher average recovery when competing splits qualify", () => {
    // Pull muscles: never worked → 100% recovery each
    // Push muscles: worked 1 day ago with 40h recovery → ~87% (above 80% but below 100%)
    // Legs muscles: worked today → below 80% → excluded
    // Pull (avg 100%) should beat Push (avg ~87%)
    const muscles: MuscleRecoveryItem[] = [
      muscle("Chest", daysAgo(1), 40),       // ~87%
      muscle("Shoulders", daysAgo(1), 40),    // ~87%
      muscle("Triceps", daysAgo(1), 40),      // ~87%
      muscle("Back", null),                    // 100%
      muscle("Biceps", null),                  // 100%
      muscle("Quads", today(), 72),            // ~0% → Legs excluded
      muscle("Hamstrings", today(), 72),       // ~0%
      muscle("Glutes", today(), 72),           // ~0%
      muscle("Calves", today(), 72),           // ~0%
    ];

    const result = getWorkoutRecommendation(muscles);
    expect(result).not.toBeNull();
    // Pull has 100% avg, Push has ~87% avg → Pull wins
    expect(result!.split.name).toBe("Pull");
    expect(result!.recoveredMuscles).toContain("Back");
    expect(result!.recoveredMuscles).toContain("Biceps");
  });

  it("returns all split muscles as recovered when they qualify", () => {
    const muscles: MuscleRecoveryItem[] = [
      muscle("Back", null),
      muscle("Biceps", null),
    ];

    const result = getWorkoutRecommendation(muscles);
    expect(result).not.toBeNull();

    // The recovered muscles should include all muscles of the recommended split
    // that are above 80% recovery
    for (const m of result!.recoveredMuscles) {
      expect(result!.split.muscles).toContain(m);
    }
  });
});
