"use server";

import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/current-user";
import { updateTag } from "next/cache";
import { CACHE_TAGS } from "@/lib/cache-tags";
import { toDateOnly, dateToString } from "@/lib/date-utils";

export type CalendarWorkoutDay = {
  date: string;
  workoutName: string | null;
  totalVolume: number;
  durationMinutes: number | null;
  exerciseCount: number;
};

export type CalendarDayData = CalendarWorkoutDay & {
  garminReadiness?: number | null;
  programType?: string | null;
  calories?: number | null;
  avgHr?: number | null;
  garminActivityDbId?: number | null;
};

export async function getRecentGarminActivities() {
  const user = await requireUser();
  const rows = await prisma.garminActivity.findMany({
    where: { userId: user.id, activityType: "strength_training" },
    orderBy: { date: "desc" },
    take: 10,
  });
  return rows.map(r => ({ ...r, date: dateToString(r.date) }));
}

export async function linkGarminActivity(
  workoutId: number,
  garminActivityId: number
) {
  const user = await requireUser();

  // Fetch Garmin activity data to copy metrics
  const garminActivity = await prisma.garminActivity.findUnique({
    where: { activityId: garminActivityId },
  });

  const updateData: Record<string, unknown> = { garminActivityId };

  if (garminActivity) {
    // Copy duration
    if (garminActivity.durationSeconds) {
      updateData.durationMinutes = Math.round(garminActivity.durationSeconds / 60);
    }
    // Copy HR and calories
    if (garminActivity.avgHr) {
      updateData.avgHr = garminActivity.avgHr;
    }
    if (garminActivity.calories) {
      updateData.calories = garminActivity.calories;
    }
    // Sync date from Garmin activity
    updateData.date = garminActivity.date;
    // Copy start/end time from Garmin
    if (garminActivity.startTimeLocal && garminActivity.startTimeLocal.length >= 16) {
      updateData.startTime = garminActivity.startTimeLocal.slice(11, 16);
      if (garminActivity.durationSeconds) {
        const s = new Date(garminActivity.startTimeLocal);
        const e = new Date(s.getTime() + garminActivity.durationSeconds * 1000);
        updateData.endTime = `${String(e.getHours()).padStart(2, "0")}:${String(e.getMinutes()).padStart(2, "0")}`;
      } else {
        updateData.endTime = "done";
      }
    }
  }

  const workout = await prisma.gymWorkout.update({
    where: { id: workoutId, userId: user.id },
    data: updateData,
  });
  updateTag(CACHE_TAGS.gym);
  return workout;
}

export async function unlinkGarminActivity(workoutId: number) {
  const user = await requireUser();
  const workout = await prisma.gymWorkout.update({
    where: { id: workoutId, userId: user.id },
    data: { garminActivityId: null },
  });
  updateTag(CACHE_TAGS.gym);
  return workout;
}

export async function getWorkoutCalendar(
  year: number,
  month: number
): Promise<CalendarDayData[]> {
  const user = await requireUser();

  const from = `${year}-${String(month).padStart(2, "0")}-01`;
  const nextMonth = month === 12 ? 1 : month + 1;
  const nextYear = month === 12 ? year + 1 : year;
  const to = `${nextYear}-${String(nextMonth).padStart(2, "0")}-01`;

  const [workouts, garminDays, garminActivities] = await Promise.all([
    prisma.gymWorkout.findMany({
      where: {
        userId: user.id,
        date: { gte: toDateOnly(from), lt: toDateOnly(to) },
      },
      include: {
        exercises: {
          include: {
            sets: true,
          },
        },
      },
      orderBy: { date: "asc" },
    }),
    prisma.garminDaily.findMany({
      where: { userId: user.id, date: { gte: toDateOnly(from), lt: toDateOnly(to) } },
      select: { date: true, trainingReadinessScore: true },
    }),
    prisma.garminActivity.findMany({
      where: { userId: user.id, date: { gte: toDateOnly(from), lt: toDateOnly(to) } },
      select: { activityId: true, date: true, activityType: true, activityName: true, durationSeconds: true, calories: true, avgHr: true },
      orderBy: { date: "asc" },
    }),
  ]);

  // Map garmin readiness by date
  const garminMap = new Map<string, number | null>();
  for (const g of garminDays) {
    garminMap.set(dateToString(g.date), g.trainingReadinessScore);
  }

  // Map garmin activities by date
  const garminActivityMap = new Map<string, typeof garminActivities>();
  for (const ga of garminActivities) {
    const ds = dateToString(ga.date);
    const existing = garminActivityMap.get(ds) ?? [];
    existing.push(ga);
    garminActivityMap.set(ds, existing);
  }

  // Workout days — merge with Garmin data if same day
  const workoutDates = new Set<string>();
  const result: CalendarDayData[] = workouts.map((w) => {
    let totalVolume = 0;
    for (const we of w.exercises) {
      for (const s of we.sets) {
        totalVolume += (s.weightKg ?? 0) * (s.reps ?? 0);
      }
    }
    const wds = dateToString(w.date);
    workoutDates.add(wds);

    // Merge Garmin activity data (duration, calories) if linked or same day
    const dayActivities = garminActivityMap.get(wds);
    let duration = w.durationMinutes;
    if (!duration && dayActivities) {
      const strengthActivity = dayActivities.find(a => a.activityType === "strength_training");
      if (strengthActivity?.durationSeconds) {
        duration = Math.round(strengthActivity.durationSeconds / 60);
      }
    }

    return {
      date: wds,
      workoutName: w.workoutName,
      totalVolume: Math.round(totalVolume),
      durationMinutes: duration,
      exerciseCount: w.exercises.length,
      garminReadiness: garminMap.get(wds) ?? null,
      programType: w.programType ?? dayActivities?.[0]?.activityType ?? null,
    };
  });

  // Add Garmin-only activities (no gym workout that day)
  for (const [date, activities] of garminActivityMap) {
    if (!workoutDates.has(date)) {
      for (const ga of activities) {
        result.push({
          date,
          workoutName: ga.activityName,
          totalVolume: 0,
          durationMinutes: ga.durationSeconds ? Math.round(ga.durationSeconds / 60) : null,
          exerciseCount: 0,
          garminReadiness: garminMap.get(date) ?? null,
          programType: ga.activityType ?? null,
          calories: ga.calories,
          avgHr: ga.avgHr,
          garminActivityDbId: ga.activityId,
        });
      }
      workoutDates.add(date);
    }
  }

  // Add non-workout, non-activity days that have Garmin readiness data
  for (const [date, readiness] of garminMap) {
    if (!workoutDates.has(date) && readiness != null) {
      result.push({
        date,
        workoutName: null,
        totalVolume: 0,
        durationMinutes: null,
        exerciseCount: 0,
        garminReadiness: readiness,
      });
    }
  }

  result.sort((a, b) => a.date.localeCompare(b.date));
  return result;
}

/** Auto-create or auto-link gym workouts from unlinked Garmin strength_training activities */
export async function syncGarminStrengthToGym(): Promise<number> {
  const user = await requireUser();

  // Find strength activities that are not yet linked to any gym workout
  const unlinked = await prisma.$queryRaw<
    { activity_id: number; date: Date; duration_seconds: number | null; calories: number | null; avg_hr: number | null; start_time_local: string | null }[]
  >`
    SELECT ga.activity_id, ga.date, ga.duration_seconds, ga.calories, ga.avg_hr, ga.start_time_local
    FROM garmin_activities ga
    WHERE ga.user_id = ${user.id}
      AND ga.activity_type = 'strength_training'
      AND NOT EXISTS (
        SELECT 1 FROM gym_workouts gw
        WHERE gw.garmin_activity_id = ga.activity_id
      )
    ORDER BY ga.date
  `;

  let synced = 0;
  for (const ga of unlinked) {
    const durationMinutes = ga.duration_seconds ? Math.round(ga.duration_seconds / 60) : null;

    // Extract HH:MM from startTimeLocal (e.g. "2026-03-21 14:30:00" → "14:30")
    let startTime: string | null = null;
    let endTime: string | null = null;
    if (ga.start_time_local && ga.start_time_local.length >= 16) {
      startTime = ga.start_time_local.slice(11, 16); // "14:30"
      if (ga.duration_seconds) {
        const startDate = new Date(ga.start_time_local);
        const endDate = new Date(startDate.getTime() + ga.duration_seconds * 1000);
        endTime = `${String(endDate.getHours()).padStart(2, "0")}:${String(endDate.getMinutes()).padStart(2, "0")}`;
      }
    }

    const garminData = {
      garminActivityId: ga.activity_id,
      durationMinutes,
      calories: ga.calories,
      avgHr: ga.avg_hr,
      ...(startTime ? { startTime } : {}),
      ...(endTime ? { endTime } : { endTime: startTime ? "done" : "done" }),
    };

    // Check if there's an existing manual workout on the same day (same-day merge)
    const existingWorkout = await prisma.gymWorkout.findFirst({
      where: { userId: user.id, date: ga.date, garminActivityId: null },
    });

    if (existingWorkout) {
      // Auto-link: copy Garmin metrics (incl. time) to existing manual workout
      await prisma.gymWorkout.update({
        where: { id: existingWorkout.id },
        data: garminData,
      });
    } else {
      // Create new workout from Garmin activity (marked as completed)
      await prisma.gymWorkout.create({
        data: {
          userId: user.id,
          date: ga.date,
          workoutName: "Strength",
          programType: "strength_training",
          ...garminData,
        },
      });
    }
    synced++;
  }

  if (synced > 0) {
    updateTag(CACHE_TAGS.gym);
  }
  return synced;
}
