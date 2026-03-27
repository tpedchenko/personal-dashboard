"use server";

import { prisma } from "@/lib/db";
import { dateToString } from "@/lib/date-utils";

/**
 * Build gym/workout context sections.
 */
export async function buildGymContext(
  userId: number,
  allowedSections: string[],
): Promise<string[]> {
  const parts: string[] = [];

  if (allowedSections.includes("workouts")) {
    const workouts = await prisma.gymWorkout.findMany({
      where: { userId },
      orderBy: { date: "desc" },
      take: 5,
      include: {
        exercises: {
          include: {
            exercise: { select: { name: true } },
            sets: { select: { weightKg: true, reps: true } },
          },
        },
      },
    });
    if (workouts.length > 0) {
      const wLines = workouts.map((w) => {
        const exerciseCount = w.exercises.length;
        let totalVolume = 0;
        for (const ex of w.exercises) {
          for (const s of ex.sets) {
            totalVolume += (s.weightKg ?? 0) * (s.reps ?? 0);
          }
        }
        const items: string[] = [`  ${dateToString(w.date)}:`];
        if (w.workoutName) items.push(`"${w.workoutName}"`);
        items.push(`${exerciseCount} exercises`);
        if (totalVolume > 0) items.push(`volume=${totalVolume.toFixed(0)}kg`);
        if (w.durationMinutes) items.push(`${w.durationMinutes}min`);
        const exNames = w.exercises.map((e) => e.exercise.name).join(", ");
        if (exNames) items.push(`[${exNames}]`);
        return items.join(" ");
      });
      parts.push(`Last 5 Workouts:\n${wLines.join("\n")}`);
    }
  }

  return parts;
}
