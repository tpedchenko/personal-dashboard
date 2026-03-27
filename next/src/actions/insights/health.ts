"use server";

import { prisma } from "@/lib/db";
import { toDateOnly } from "@/lib/date-utils";

type DateRange = { start: string; end: string };

/**
 * Fetch health-related insight context (daily logs + garmin) for current and comparison periods.
 */
export async function getHealthInsightContext(
  userId: number,
  current: DateRange,
  comparison: DateRange,
): Promise<string[]> {
  const [currentLogs, comparisonLogs, currentGarmin, comparisonGarmin] = await Promise.all([
    prisma.dailyLog.findMany({
      where: { userId, date: { gte: toDateOnly(current.start), lte: toDateOnly(current.end) } },
      orderBy: { date: "desc" },
    }),
    prisma.dailyLog.findMany({
      where: { userId, date: { gte: toDateOnly(comparison.start), lte: toDateOnly(comparison.end) } },
      orderBy: { date: "desc" },
    }),
    prisma.garminDaily.findMany({
      where: { userId, date: { gte: toDateOnly(current.start), lte: toDateOnly(current.end) } },
      orderBy: { date: "desc" },
    }),
    prisma.garminDaily.findMany({
      where: { userId, date: { gte: toDateOnly(comparison.start), lte: toDateOnly(comparison.end) } },
      orderBy: { date: "desc" },
    }),
  ]);

  const summarizeLogs = (logs: typeof currentLogs, label: string) => {
    if (logs.length === 0) return `${label}: no data`;
    const avgMood = logs.reduce((s, l) => s + (l.moodDelta ?? 0), 0) / logs.length;
    const avgEnergy = logs.filter(l => l.energyLevel != null).reduce((s, l) => s + (l.energyLevel ?? 0), 0) / (logs.filter(l => l.energyLevel != null).length || 1);
    const avgStress = logs.filter(l => l.stressLevel != null).reduce((s, l) => s + (l.stressLevel ?? 0), 0) / (logs.filter(l => l.stressLevel != null).length || 1);
    return `${label} (${logs.length} days): avg mood_delta=${avgMood.toFixed(1)}, avg energy=${avgEnergy.toFixed(1)}, avg stress=${avgStress.toFixed(1)}`;
  };

  const summarizeGarmin = (data: typeof currentGarmin, label: string) => {
    if (data.length === 0) return `${label}: no data`;
    const avgSteps = data.reduce((s, g) => s + (g.steps ?? 0), 0) / data.length;
    const avgSleep = data.filter(g => g.sleepSeconds != null).reduce((s, g) => s + (g.sleepSeconds ?? 0), 0) / (data.filter(g => g.sleepSeconds != null).length || 1);
    const avgHrv = data.filter(g => g.hrvLastNight != null).reduce((s, g) => s + (g.hrvLastNight ?? 0), 0) / (data.filter(g => g.hrvLastNight != null).length || 1);
    const avgRestHr = data.filter(g => g.restingHr != null).reduce((s, g) => s + (g.restingHr ?? 0), 0) / (data.filter(g => g.restingHr != null).length || 1);
    return `${label} (${data.length} days): avg steps=${Math.round(avgSteps)}, avg sleep=${(avgSleep / 3600).toFixed(1)}h, avg HRV=${avgHrv.toFixed(0)}ms, avg resting HR=${avgRestHr.toFixed(0)}`;
  };

  return [
    summarizeLogs(currentLogs, `CURRENT PERIOD Daily Log (${current.start} to ${current.end})`),
    summarizeLogs(comparisonLogs, `COMPARISON PERIOD Daily Log (${comparison.start} to ${comparison.end})`),
    summarizeGarmin(currentGarmin, `CURRENT PERIOD Garmin (${current.start} to ${current.end})`),
    summarizeGarmin(comparisonGarmin, `COMPARISON PERIOD Garmin (${comparison.start} to ${comparison.end})`),
  ];
}

/**
 * Fetch gym insight context for current and comparison periods.
 */
export async function getGymInsightContext(
  userId: number,
  current: DateRange,
  comparison: DateRange,
): Promise<string[]> {
  const [currentWorkouts, comparisonWorkouts] = await Promise.all([
    prisma.gymWorkout.findMany({
      where: { userId, date: { gte: toDateOnly(current.start), lte: toDateOnly(current.end) } },
      include: { exercises: { include: { sets: { select: { weightKg: true, reps: true } } } } },
    }),
    prisma.gymWorkout.findMany({
      where: { userId, date: { gte: toDateOnly(comparison.start), lte: toDateOnly(comparison.end) } },
      include: { exercises: { include: { sets: { select: { weightKg: true, reps: true } } } } },
    }),
  ]);

  const summarizeWorkouts = (workouts: typeof currentWorkouts, label: string) => {
    if (workouts.length === 0) return `${label}: no workouts`;
    let totalVolume = 0;
    for (const w of workouts) {
      for (const ex of w.exercises) {
        for (const s of ex.sets) totalVolume += (s.weightKg ?? 0) * (s.reps ?? 0);
      }
    }
    const avgDuration = workouts.reduce((s, w) => s + (w.durationMinutes ?? 0), 0) / workouts.length;
    return `${label} (${workouts.length} workouts): total volume=${Math.round(totalVolume)}kg, avg duration=${Math.round(avgDuration)}min`;
  };

  return [
    summarizeWorkouts(currentWorkouts, `CURRENT PERIOD Gym (${current.start} to ${current.end})`),
    summarizeWorkouts(comparisonWorkouts, `COMPARISON PERIOD Gym (${comparison.start} to ${comparison.end})`),
  ];
}
