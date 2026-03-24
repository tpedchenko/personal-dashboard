"use server";

import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/current-user";
import { cached } from "@/lib/cache";
import { pearsonR } from "./utils";
import { toDateOnly, dateToString } from "@/lib/date-utils";

export interface CorrelationPoint {
  date: string;
  mood: number | null;
  energy: number | null;
  stress: number | null;
  sleepScore: number | null;
  steps: number | null;
  alcohol: number | null;
  caffeine: number | null;
}

export interface WellbeingTimelinePoint {
  date: string;
  mood: number | null;
  energy: number | null;
  stress: number | null;
  focus: number | null;
  cumulativeMood: number | null;
}

export interface MoodByWeekday {
  day: string;
  dayIndex: number;
  avgDelta: number;
}

export interface WellbeingAnalytics {
  timeline: WellbeingTimelinePoint[];
  moodByWeekday: MoodByWeekday[];
}

export interface PearsonCorrelation {
  pair: string;
  labelX: string;
  labelY: string;
  r: number;
  n: number;
}

export interface ExtendedCorrelations {
  correlations: PearsonCorrelation[];
}

export async function getLifestyleCorrelations(period: {
  from: string;
  to: string;
}): Promise<CorrelationPoint[]> {
  const user = await requireUser();
  const { from, to } = period;

  return cached<CorrelationPoint[]>(
    `lifestyle-corr:${user.id}:${from}:${to}`,
    300, // 5 minutes
    async () => {
  const [dailyLogs, garminData] = await Promise.all([
    prisma.dailyLog.findMany({
      where: { userId: user.id, date: { gte: toDateOnly(from), lte: toDateOnly(to) } },
      select: {
        date: true,
        level: true,
        energyLevel: true,
        stressLevel: true,
        alcohol: true,
        caffeine: true,
      },
      orderBy: { date: "asc" },
    }),
    prisma.garminDaily.findMany({
      where: { userId: user.id, date: { gte: toDateOnly(from), lte: toDateOnly(to) } },
      select: {
        date: true,
        sleepScore: true,
        steps: true,
      },
      orderBy: { date: "asc" },
    }),
  ]);

  const garminByDate = new Map(garminData.map((g) => [dateToString(g.date), g]));
  const allDates = new Set([
    ...dailyLogs.map((l) => dateToString(l.date)),
    ...garminData.map((g) => dateToString(g.date)),
  ]);

  const logByDate = new Map(dailyLogs.map((l) => [dateToString(l.date), l]));

  return Array.from(allDates)
    .sort()
    .map((date) => {
      const log = logByDate.get(date);
      const garmin = garminByDate.get(date);
      return {
        date,
        mood: log?.level ?? null,
        energy: log?.energyLevel ?? null,
        stress: log?.stressLevel ?? null,
        sleepScore: garmin?.sleepScore ?? null,
        steps: garmin?.steps ?? null,
        alcohol: log?.alcohol ?? null,
        caffeine: log?.caffeine ?? null,
      };
    });
    }, // end of cached fn
  ); // end of cached()
}

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export async function getWellbeingAnalytics(period: {
  from: string;
  to: string;
}): Promise<WellbeingAnalytics> {
  const user = await requireUser();
  const { from, to } = period;

  const dailyLogs = await prisma.dailyLog.findMany({
    where: { userId: user.id, date: { gte: toDateOnly(from), lte: toDateOnly(to) } },
    select: {
      date: true,
      level: true,
      moodDelta: true,
      energyLevel: true,
      stressLevel: true,
      focusQuality: true,
    },
    orderBy: { date: "asc" },
  });

  let cumulativeMood = 0;
  let moodCount = 0;

  const timeline: WellbeingTimelinePoint[] = dailyLogs.map((log) => {
    if (log.level != null) {
      cumulativeMood += log.level;
      moodCount++;
    }
    return {
      date: dateToString(log.date),
      mood: log.level,
      energy: log.energyLevel,
      stress: log.stressLevel,
      focus: log.focusQuality,
      cumulativeMood: moodCount > 0 ? Math.round((cumulativeMood / moodCount) * 100) / 100 : null,
    };
  });

  // Mood delta by weekday (Mon=1 ... Sun=7)
  const weekdayAccum: { sum: number; count: number }[] = Array.from({ length: 7 }, () => ({ sum: 0, count: 0 }));
  for (const log of dailyLogs) {
    if (log.moodDelta != null) {
      const dow = new Date(log.date).getDay(); // 0=Sun
      weekdayAccum[dow].sum += log.moodDelta;
      weekdayAccum[dow].count++;
    }
  }

  // Return Mon-Sun order (1,2,3,4,5,6,0)
  const weekdayOrder = [1, 2, 3, 4, 5, 6, 0];
  const moodByWeekday: MoodByWeekday[] = weekdayOrder.map((dow) => ({
    day: DAY_NAMES[dow],
    dayIndex: dow === 0 ? 7 : dow,
    avgDelta: weekdayAccum[dow].count > 0
      ? Math.round((weekdayAccum[dow].sum / weekdayAccum[dow].count) * 100) / 100
      : 0,
  }));

  return { timeline, moodByWeekday };
}

export async function getExtendedCorrelations(period: {
  from: string;
  to: string;
}): Promise<ExtendedCorrelations> {
  const user = await requireUser();
  const { from, to } = period;

  const [dailyLogs, garminData, expenses, gymWorkouts] = await Promise.all([
    prisma.dailyLog.findMany({
      where: { userId: user.id, date: { gte: toDateOnly(from), lte: toDateOnly(to) } },
      select: {
        date: true,
        level: true,
        energyLevel: true,
        stressLevel: true,
      },
      orderBy: { date: "asc" },
    }),
    prisma.garminDaily.findMany({
      where: { userId: user.id, date: { gte: toDateOnly(from), lte: toDateOnly(to) } },
      select: { date: true, sleepScore: true, steps: true },
      orderBy: { date: "asc" },
    }),
    prisma.transaction.findMany({
      where: { userId: user.id, date: { gte: toDateOnly(from), lte: toDateOnly(to) }, type: "EXPENSE", NOT: { subType: "TRANSFER" } },
      select: { date: true, amountEur: true },
    }),
    prisma.gymWorkout.findMany({
      where: { userId: user.id, date: { gte: toDateOnly(from), lte: toDateOnly(to) } },
      select: { date: true },
    }),
  ]);

  const logByDate = new Map(dailyLogs.map((l) => [dateToString(l.date), l]));
  const garminByDate = new Map(garminData.map((g) => [dateToString(g.date), g]));

  // Aggregate daily expenses
  const expByDate = new Map<string, number>();
  for (const tx of expenses) {
    const txds = dateToString(tx.date);
    expByDate.set(txds, (expByDate.get(txds) ?? 0) + Math.abs(tx.amountEur ?? 0));
  }

  // Track gym days (1 = worked out, 0 = rest day)
  const gymDates = new Set(gymWorkouts.map((w) => dateToString(w.date)));

  const allDates = new Set([
    ...dailyLogs.map((l) => dateToString(l.date)),
    ...garminData.map((g) => dateToString(g.date)),
    ...expenses.map((e) => dateToString(e.date)),
  ]);

  // Build paired arrays
  const expenseMood: { x: number; y: number }[] = [];
  const sleepStress: { x: number; y: number }[] = [];
  const stepsEnergy: { x: number; y: number }[] = [];
  const gymSleep: { x: number; y: number }[] = [];

  for (const date of allDates) {
    const log = logByDate.get(date);
    const garmin = garminByDate.get(date);
    const exp = expByDate.get(date);

    if (exp != null && log?.level != null) {
      expenseMood.push({ x: exp, y: log.level });
    }
    if (garmin?.sleepScore != null && log?.stressLevel != null) {
      sleepStress.push({ x: garmin.sleepScore, y: log.stressLevel });
    }
    if (garmin?.steps != null && log?.energyLevel != null) {
      stepsEnergy.push({ x: garmin.steps, y: log.energyLevel });
    }
    // Gym day (binary) vs next-day sleep score
    if (garmin?.sleepScore != null) {
      // Check if previous day was a gym day
      const prevDate = new Date(new Date(date + "T00:00:00").getTime() - 86400000);
      const prevKey = `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, "0")}-${String(prevDate.getDate()).padStart(2, "0")}`;
      gymSleep.push({ x: gymDates.has(prevKey) ? 1 : 0, y: garmin.sleepScore });
    }
  }

  const correlations: PearsonCorrelation[] = [
    {
      pair: "expense_mood",
      labelX: "Daily Expense",
      labelY: "Mood",
      r: pearsonR(expenseMood.map((p) => p.x), expenseMood.map((p) => p.y)),
      n: expenseMood.length,
    },
    {
      pair: "sleep_stress",
      labelX: "Sleep Score",
      labelY: "Stress",
      r: pearsonR(sleepStress.map((p) => p.x), sleepStress.map((p) => p.y)),
      n: sleepStress.length,
    },
    {
      pair: "steps_energy",
      labelX: "Steps",
      labelY: "Energy",
      r: pearsonR(stepsEnergy.map((p) => p.x), stepsEnergy.map((p) => p.y)),
      n: stepsEnergy.length,
    },
    {
      pair: "gym_sleep",
      labelX: "Gym (prev day)",
      labelY: "Sleep Score",
      r: pearsonR(gymSleep.map((p) => p.x), gymSleep.map((p) => p.y)),
      n: gymSleep.length,
    },
  ];

  return { correlations };
}
