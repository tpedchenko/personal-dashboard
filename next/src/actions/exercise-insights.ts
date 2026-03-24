"use server";

import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/current-user";
import { dateToString } from "@/lib/date-utils";

type ExerciseStats = {
  name: string;
  muscleGroup: string | null;
  totalSessions: number;
  lastDate: string | null;
  allTime1RM: number;
  recent1RM: number;
  allTimeMaxVolume: number;
  recentAvgVolume: number;
  trend: "improving" | "stable" | "declining";
  history: { date: string; max1RM: number; totalVolume: number; sets: number }[];
};

export async function getExerciseInsightsContext(): Promise<string> {
  const user = await requireUser();

  // Get all exercises with their workout data
  const exercises = await prisma.gymExercise.findMany({
    where: { userId: user.id },
    include: {
      workoutExercises: {
        include: {
          workout: { select: { date: true } },
          sets: {
            where: { isWarmup: { not: true } },
            select: { weightKg: true, reps: true },
          },
        },
        orderBy: { workout: { date: "desc" } },
      },
    },
  });

  const stats: ExerciseStats[] = [];

  for (const ex of exercises) {
    if (ex.workoutExercises.length === 0) continue;

    // Build per-session data
    const sessions: { date: string; max1RM: number; totalVolume: number; sets: number }[] = [];

    for (const we of ex.workoutExercises) {
      const date = dateToString(we.workout.date);
      let maxWeight = 0;
      let max1RM = 0;
      let totalVolume = 0;
      let setCount = 0;

      for (const s of we.sets) {
        const w = s.weightKg ?? 0;
        const r = s.reps ?? 0;
        if (w > maxWeight) maxWeight = w;
        // Epley formula for 1RM
        const estimated1RM = r === 1 ? w : w * (1 + r / 30);
        if (estimated1RM > max1RM) max1RM = estimated1RM;
        totalVolume += w * r;
        setCount++;
      }

      if (setCount > 0) {
        sessions.push({ date, max1RM: Math.round(max1RM * 10) / 10, totalVolume: Math.round(totalVolume), sets: setCount });
      }
    }

    if (sessions.length === 0) continue;

    // Sort by date desc
    sessions.sort((a, b) => b.date.localeCompare(a.date));

    const allTime1RM = Math.max(...sessions.map(s => s.max1RM));
    const recent4 = sessions.slice(0, 4);
    const prev4 = sessions.slice(4, 8);
    const recent1RM = Math.max(...recent4.map(s => s.max1RM));
    const recentAvgVolume = recent4.reduce((s, x) => s + x.totalVolume, 0) / recent4.length;
    const allTimeMaxVolume = Math.max(...sessions.map(s => s.totalVolume));

    // Determine trend
    let trend: "improving" | "stable" | "declining" = "stable";
    if (prev4.length >= 2) {
      const prevAvg1RM = prev4.reduce((s, x) => s + x.max1RM, 0) / prev4.length;
      const recentAvg1RM = recent4.reduce((s, x) => s + x.max1RM, 0) / recent4.length;
      const diff = ((recentAvg1RM - prevAvg1RM) / prevAvg1RM) * 100;
      if (diff > 3) trend = "improving";
      else if (diff < -3) trend = "declining";
    }

    stats.push({
      name: ex.name,
      muscleGroup: ex.muscleGroup,
      totalSessions: sessions.length,
      lastDate: sessions[0]?.date ?? null,
      allTime1RM,
      recent1RM,
      allTimeMaxVolume,
      recentAvgVolume: Math.round(recentAvgVolume),
      trend,
      history: sessions.slice(0, 8), // last 8 sessions for context
    });
  }

  // Sort by total sessions desc (most trained first)
  stats.sort((a, b) => b.totalSessions - a.totalSessions);

  // Build context string
  const lines = stats.map(ex => {
    const historyStr = ex.history
      .slice(0, 4)
      .map(h => `${h.date}: 1RM=${h.max1RM}kg vol=${h.totalVolume}kg×reps`)
      .join("; ");

    return [
      `${ex.name} (${ex.muscleGroup || "?"})`,
      `  Sessions: ${ex.totalSessions}, Last: ${ex.lastDate}`,
      `  All-time 1RM: ${ex.allTime1RM}kg, Recent 1RM: ${ex.recent1RM}kg`,
      `  Avg volume (last 4): ${ex.recentAvgVolume}kg, Max volume: ${ex.allTimeMaxVolume}kg`,
      `  Trend: ${ex.trend}`,
      `  Recent: ${historyStr}`,
    ].join("\n");
  });

  return `Exercise Progress (${stats.length} exercises, ${stats.reduce((s, x) => s + x.totalSessions, 0)} total sessions):\n\n${lines.join("\n\n")}`;
}
