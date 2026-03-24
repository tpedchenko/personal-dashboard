"use server";

import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/current-user";
import { toDateOnly, dateToString } from "@/lib/date-utils";

export async function getGymStats(period: { from: string; to: string }) {
  const user = await requireUser();
  const workouts = await prisma.gymWorkout.findMany({
    where: {
      userId: user.id,
      date: { gte: toDateOnly(period.from), lte: toDateOnly(period.to) },
    },
    include: {
      exercises: {
        include: {
          exercise: true,
          sets: true,
        },
      },
    },
  });

  let totalVolume = 0;
  const muscleGroupMap: Record<string, number> = {};

  for (const w of workouts) {
    for (const we of w.exercises) {
      const mg = we.exercise.muscleGroup ?? "Other";
      for (const s of we.sets) {
        const vol = (s.weightKg ?? 0) * (s.reps ?? 0);
        totalVolume += vol;
        muscleGroupMap[mg] = (muscleGroupMap[mg] ?? 0) + vol;
      }
    }
  }

  const fromDate = new Date(period.from);
  const toDate = new Date(period.to);
  const weeks = Math.max(
    1,
    (toDate.getTime() - fromDate.getTime()) / (7 * 24 * 60 * 60 * 1000)
  );

  return {
    totalWorkouts: workouts.length,
    totalVolume: Math.round(totalVolume),
    sessionsPerWeek: Math.round((workouts.length / weeks) * 10) / 10,
    muscleGroupDistribution: Object.entries(muscleGroupMap)
      .map(([group, volume]) => ({ group, volume: Math.round(volume) }))
      .sort((a, b) => b.volume - a.volume),
  };
}

// Muscle Recovery
export async function getMuscleRecovery(): Promise<
  { name: string; lastWorked: string | null; recoveryHours: number }[]
> {
  const user = await requireUser();
  const MUSCLE_GROUPS = [
    "Chest",
    "Shoulders",
    "Biceps",
    "Triceps",
    "Core",
    "Quads",
    "Hamstrings",
    "Calves",
    "Back",
    "Glutes",
  ];

  const fiveDaysAgo = new Date();
  fiveDaysAgo.setDate(fiveDaysAgo.getDate() - 5);
  const fromDate = fiveDaysAgo.toISOString().slice(0, 10);

  const workouts = await prisma.gymWorkout.findMany({
    where: { userId: user.id, date: { gte: toDateOnly(fromDate) } },
    orderBy: { date: "desc" },
    include: {
      exercises: {
        include: { exercise: true },
      },
    },
  });

  const lastWorkedMap: Record<string, string> = {};
  const recoveryMap: Record<string, number> = {};

  for (const w of workouts) {
    const wds = dateToString(w.date);
    for (const we of w.exercises) {
      const mg = we.exercise.muscleGroup ?? "Other";
      const recHours = we.exercise.recoveryHours ?? 72;

      // Primary muscle group
      if (!lastWorkedMap[mg] || wds > lastWorkedMap[mg]) {
        lastWorkedMap[mg] = wds;
        recoveryMap[mg] = recHours;
      }

      // Map "Legs" -> individual leg muscles
      if (mg === "Legs") {
        for (const leg of ["Quads", "Hamstrings", "Calves", "Glutes"]) {
          if (!lastWorkedMap[leg] || wds > lastWorkedMap[leg]) {
            lastWorkedMap[leg] = wds;
            recoveryMap[leg] = recHours;
          }
        }
      }

      // Secondary muscles at 50% recovery
      if (we.exercise.secondaryMuscles) {
        const secondaries = we.exercise.secondaryMuscles.split(",").map(s => s.trim());
        for (const sec of secondaries) {
          if (MUSCLE_GROUPS.includes(sec)) {
            if (!lastWorkedMap[sec] || wds > lastWorkedMap[sec]) {
              lastWorkedMap[sec] = wds;
              recoveryMap[sec] = Math.round(recHours * 0.5);
            }
          }
        }
      }
    }
  }

  return MUSCLE_GROUPS.map((name) => ({
    name,
    lastWorked: lastWorkedMap[name] ?? null,
    recoveryHours: recoveryMap[name] ?? 72,
  }));
}
