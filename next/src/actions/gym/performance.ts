"use server";

import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/current-user";
import { dateToString } from "@/lib/date-utils";

export type ExercisePR = {
  maxWeight: number | null;
  maxWeightReps: number | null;
  maxVolume: number | null;
  maxVolumeWeight: number | null;
  maxVolumeReps: number | null;
  recentSets: {
    date: string;
    setNum: number;
    weightKg: number | null;
    reps: number | null;
  }[];
};

export async function getExercisePRs(exerciseId: number): Promise<ExercisePR> {
  const user = await requireUser();

  // Use SQL aggregates instead of loading all historical sets
  type PRRow = {
    max_weight: number | null;
    max_weight_reps: number | null;
    max_volume: number | null;
    max_volume_weight: number | null;
    max_volume_reps: number | null;
  };

  const prRows = await prisma.$queryRaw<PRRow[]>`
    WITH ranked AS (
      SELECT
        s.weight_kg,
        s.reps,
        COALESCE(s.weight_kg, 0) AS w,
        COALESCE(s.reps, 0) AS r,
        COALESCE(s.weight_kg, 0) * COALESCE(s.reps, 0) AS vol
      FROM gym_sets s
      JOIN gym_workout_exercises we ON we.id = s.workout_exercise_id
      WHERE we.user_id = ${user.id}
        AND we.exercise_id = ${exerciseId}
        AND (s.is_warmup IS NULL OR s.is_warmup = false)
    )
    SELECT
      (SELECT w FROM ranked ORDER BY w DESC, r DESC LIMIT 1) AS max_weight,
      (SELECT r FROM ranked ORDER BY w DESC, r DESC LIMIT 1) AS max_weight_reps,
      (SELECT vol FROM ranked ORDER BY vol DESC LIMIT 1) AS max_volume,
      (SELECT w FROM ranked ORDER BY vol DESC LIMIT 1) AS max_volume_weight,
      (SELECT r FROM ranked ORDER BY vol DESC LIMIT 1) AS max_volume_reps
  `;

  const pr = prRows[0] ?? {
    max_weight: null,
    max_weight_reps: null,
    max_volume: null,
    max_volume_weight: null,
    max_volume_reps: null,
  };

  // Recent sets: last 10 non-warmup sets ordered by workout date desc, set_num asc
  type RecentRow = {
    date: Date;
    set_num: number;
    weight_kg: number | null;
    reps: number | null;
  };

  const recentRows = await prisma.$queryRaw<RecentRow[]>`
    SELECT w.date, s.set_num, s.weight_kg, s.reps
    FROM gym_sets s
    JOIN gym_workout_exercises we ON we.id = s.workout_exercise_id
    JOIN gym_workouts w ON w.id = we.workout_id
    WHERE we.user_id = ${user.id}
      AND we.exercise_id = ${exerciseId}
      AND (s.is_warmup IS NULL OR s.is_warmup = false)
    ORDER BY w.date DESC, s.set_num ASC
    LIMIT 10
  `;

  const recentSets = recentRows.map((r) => ({
    date: dateToString(r.date),
    setNum: r.set_num,
    weightKg: r.weight_kg,
    reps: r.reps,
  }));

  return {
    maxWeight: pr.max_weight !== null ? Number(pr.max_weight) : null,
    maxWeightReps: pr.max_weight_reps !== null ? Number(pr.max_weight_reps) : null,
    maxVolume: pr.max_volume !== null ? Number(pr.max_volume) : null,
    maxVolumeWeight: pr.max_volume_weight !== null ? Number(pr.max_volume_weight) : null,
    maxVolumeReps: pr.max_volume_reps !== null ? Number(pr.max_volume_reps) : null,
    recentSets,
  };
}

/**
 * Check if a set is a new PR for the given exercise.
 * Returns { isWeightPR, isVolumePR }.
 */
export async function checkSetPR(
  exerciseId: number,
  weightKg: number,
  reps: number
): Promise<{ isWeightPR: boolean; isVolumePR: boolean }> {
  const prs = await getExercisePRs(exerciseId);
  const isWeightPR = prs.maxWeight !== null && weightKg > prs.maxWeight;
  const volume = weightKg * reps;
  const isVolumePR = prs.maxVolume !== null && volume > prs.maxVolume;
  return { isWeightPR, isVolumePR };
}
