"use server";

import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/current-user";
import { toDateOnly, dateToString } from "@/lib/date-utils";

export interface GymWorkoutSummary {
  id: number;
  date: string;
  name: string;
  durationMinutes: number | null;
  totalVolume: number;
}

export interface MuscleGroupVolume {
  muscleGroup: string;
  totalSets: number;
  totalVolume: number;
}

export interface GymDashboardData {
  recentWorkouts: GymWorkoutSummary[];
  muscleDistribution: MuscleGroupVolume[];
}

export interface ExerciseProgressPoint {
  date: string;
  est1rm: number;
  maxWeight: number;
  totalVolume: number;
}

export interface ExerciseOption {
  id: number;
  name: string;
  nameUa: string | null;
  usageCount: number;
}

export interface WeeklyMuscleVolumeRow {
  week: string;
  [muscleGroup: string]: number | string;
}

export async function getGymDashboard(period: {
  from: string;
  to: string;
}): Promise<GymDashboardData> {
  const user = await requireUser();
  const { from, to } = period;

  const workouts = await prisma.gymWorkout.findMany({
    where: { userId: user.id, date: { gte: toDateOnly(from), lte: toDateOnly(to) } },
    orderBy: { date: "desc" },
    include: {
      exercises: {
        include: {
          exercise: { select: { muscleGroup: true } },
          sets: { select: { weightKg: true, reps: true, isWarmup: true } },
        },
      },
    },
  });

  // Recent 5 workouts
  const recentWorkouts: GymWorkoutSummary[] = workouts.slice(0, 5).map((w) => {
    let totalVolume = 0;
    for (const ex of w.exercises) {
      for (const s of ex.sets) {
        if (!s.isWarmup && s.weightKg && s.reps) {
          totalVolume += s.weightKg * s.reps;
        }
      }
    }
    return {
      id: w.id,
      date: dateToString(w.date),
      name: w.workoutName ?? w.programType ?? "Workout",
      durationMinutes: w.durationMinutes,
      totalVolume: Math.round(totalVolume),
    };
  });

  // Muscle group distribution across all workouts in period
  const muscleMap = new Map<string, { sets: number; volume: number }>();
  for (const w of workouts) {
    for (const ex of w.exercises) {
      const mg = ex.exercise.muscleGroup ?? "Other";
      const entry = muscleMap.get(mg) ?? { sets: 0, volume: 0 };
      for (const s of ex.sets) {
        if (!s.isWarmup) {
          entry.sets++;
          if (s.weightKg && s.reps) {
            entry.volume += s.weightKg * s.reps;
          }
        }
      }
      muscleMap.set(mg, entry);
    }
  }

  const muscleDistribution: MuscleGroupVolume[] = Array.from(muscleMap.entries())
    .map(([muscleGroup, data]) => ({
      muscleGroup,
      totalSets: data.sets,
      totalVolume: Math.round(data.volume),
    }))
    .sort((a, b) => b.totalSets - a.totalSets);

  return { recentWorkouts, muscleDistribution };
}

export async function getExerciseList(): Promise<ExerciseOption[]> {
  const user = await requireUser();

  const exercises = await prisma.gymExercise.findMany({
    where: {
      userId: user.id,
      workoutExercises: { some: {} },
    },
    select: { id: true, name: true, nameUa: true, _count: { select: { workoutExercises: true } } },
    orderBy: { name: "asc" },
  });

  return exercises
    .map((e) => ({ id: e.id, name: e.name, nameUa: e.nameUa, usageCount: e._count.workoutExercises }))
    .sort((a, b) => b.usageCount - a.usageCount);
}

export async function getExerciseProgress(
  exerciseId: number,
  days: number = 180,
): Promise<ExerciseProgressPoint[]> {
  const user = await requireUser();
  const now = new Date();
  const fromDate = new Date(now.getTime() - days * 86400000);
  const from = `${fromDate.getFullYear()}-${String(fromDate.getMonth() + 1).padStart(2, "0")}-${String(fromDate.getDate()).padStart(2, "0")}`;

  const workoutExercises = await prisma.gymWorkoutExercise.findMany({
    where: {
      userId: user.id,
      exerciseId,
      workout: { date: { gte: toDateOnly(from) } },
    },
    include: {
      workout: { select: { date: true } },
      sets: {
        where: { isWarmup: { not: true } },
        select: { weightKg: true, reps: true },
      },
    },
    orderBy: { workout: { date: "asc" } },
  });

  const byDate = new Map<string, { est1rm: number; maxWeight: number; totalVolume: number }>();

  for (const we of workoutExercises) {
    const date = dateToString(we.workout.date);
    const entry = byDate.get(date) ?? { est1rm: 0, maxWeight: 0, totalVolume: 0 };

    for (const s of we.sets) {
      if (s.weightKg && s.reps) {
        const est1rm = s.weightKg * (1 + s.reps / 30);
        if (est1rm > entry.est1rm) entry.est1rm = Math.round(est1rm * 10) / 10;
        if (s.weightKg > entry.maxWeight) entry.maxWeight = s.weightKg;
        entry.totalVolume += s.weightKg * s.reps;
      }
    }

    byDate.set(date, entry);
  }

  return Array.from(byDate.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, data]) => ({
      date,
      est1rm: data.est1rm,
      maxWeight: data.maxWeight,
      totalVolume: Math.round(data.totalVolume),
    }));
}

export async function getWeeklyMuscleVolume(
  weeks: number = 8,
): Promise<WeeklyMuscleVolumeRow[]> {
  const user = await requireUser();
  const now = new Date();
  const fromDate = new Date(now.getTime() - weeks * 7 * 86400000);
  const from = `${fromDate.getFullYear()}-${String(fromDate.getMonth() + 1).padStart(2, "0")}-${String(fromDate.getDate()).padStart(2, "0")}`;

  const workouts = await prisma.gymWorkout.findMany({
    where: { userId: user.id, date: { gte: toDateOnly(from) } },
    include: {
      exercises: {
        include: {
          exercise: { select: { muscleGroup: true } },
          sets: {
            where: { isWarmup: { not: true } },
            select: { weightKg: true, reps: true },
          },
        },
      },
    },
    orderBy: { date: "asc" },
  });

  // Group by ISO week
  const weekMap = new Map<string, Map<string, number>>();

  for (const w of workouts) {
    const d = new Date(w.date);
    // Get ISO week label (Mon of that week)
    const dayOfWeek = d.getDay() || 7; // Mon=1...Sun=7
    const monday = new Date(d.getTime() - (dayOfWeek - 1) * 86400000);
    const weekKey = `${monday.getFullYear()}-${String(monday.getMonth() + 1).padStart(2, "0")}-${String(monday.getDate()).padStart(2, "0")}`;

    if (!weekMap.has(weekKey)) weekMap.set(weekKey, new Map());
    const weekData = weekMap.get(weekKey)!;

    for (const ex of w.exercises) {
      const mg = ex.exercise.muscleGroup ?? "Other";
      let volume = 0;
      for (const s of ex.sets) {
        if (s.weightKg && s.reps) volume += s.weightKg * s.reps;
      }
      weekData.set(mg, (weekData.get(mg) ?? 0) + volume);
    }
  }

  // Also compute weekly duration
  const durationMap = new Map<string, number>();
  for (const w of workouts) {
    const d = new Date(w.date);
    const dayOfWeek = d.getDay() || 7;
    const monday = new Date(d.getTime() - (dayOfWeek - 1) * 86400000);
    const weekKey = `${monday.getFullYear()}-${String(monday.getMonth() + 1).padStart(2, "0")}-${String(monday.getDate()).padStart(2, "0")}`;
    durationMap.set(weekKey, (durationMap.get(weekKey) ?? 0) + (w.durationMinutes ?? 0));
  }

  return Array.from(weekMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([week, muscles]) => {
      const row: WeeklyMuscleVolumeRow = { week: week.slice(5) }; // MM-DD
      for (const [mg, vol] of muscles) {
        row[mg] = Math.round(vol);
      }
      row._durationMin = durationMap.get(week) ?? 0;
      return row;
    });
}
