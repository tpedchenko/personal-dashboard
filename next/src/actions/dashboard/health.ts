"use server";

import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/current-user";
import { cached, invalidateCache } from "@/lib/cache";
import { toDateOnly, dateToString } from "@/lib/date-utils";

export interface GarminDayPoint {
  date: string;
  bodyBatteryHigh: number | null;
  bodyBatteryLow: number | null;
  steps: number | null;
  intensityMinutes: number | null;
  restingHr: number | null;
  avgStress: number | null;
  maxStress: number | null;
  fitnessAge: number | null;
  caloriesActive: number | null;
  caloriesResting: number | null;
}

export interface GarminSleepPoint {
  date: string;
  durationHours: number | null;
  sleepScore: number | null;
  deepHours: number | null;
  lightHours: number | null;
  remHours: number | null;
  awakeHours: number | null;
  sleepStartHour: number | null;
  sleepEndHour: number | null;
}

export interface GarminWeightPoint {
  date: string;
  weight: number | null;
  bmi: number | null;
  bodyFatPct: number | null;
}

export interface GarminHealthTrends {
  daily: GarminDayPoint[];
  sleep: GarminSleepPoint[];
  weight: GarminWeightPoint[];
}

export interface MoodTimelinePoint {
  date: string;
  level: number | null;
  sexCount: number | null;
  bjCount: number | null;
}

export interface HRVTrendPoint {
  date: string;
  hrvLastNight: number | null;
  hrvWeeklyAvg: number | null;
}

export async function getGarminHealthTrends(days: number = 30): Promise<GarminHealthTrends> {
  const user = await requireUser();
  const now = new Date();
  const fromDate = new Date(now.getTime() - days * 86400000);
  const from = `${fromDate.getFullYear()}-${String(fromDate.getMonth() + 1).padStart(2, "0")}-${String(fromDate.getDate()).padStart(2, "0")}`;
  const to = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

  return cached<GarminHealthTrends>(
    `garmin-health:${user.id}:${days}:${to}`,
    900, // 15 minutes
    async () => {
      const [garminDaily, garminSleep, garminBody, withingsBody] = await Promise.all([
        prisma.garminDaily.findMany({
          where: { userId: user.id, date: { gte: toDateOnly(from), lte: toDateOnly(to) } },
          select: {
            date: true,
            bodyBatteryHigh: true,
            bodyBatteryLow: true,
            steps: true,
            intensityMinutes: true,
            restingHr: true,
            avgStress: true,
            maxStress: true,
            fitnessAge: true,
            caloriesTotal: true,
            caloriesActive: true,
          },
          orderBy: { date: "asc" },
        }),
        prisma.garminSleep.findMany({
          where: { userId: user.id, date: { gte: toDateOnly(from), lte: toDateOnly(to) } },
          select: {
            date: true,
            durationSeconds: true,
            sleepScore: true,
            deepSeconds: true,
            lightSeconds: true,
            remSeconds: true,
            awakeSeconds: true,
            sleepStart: true,
            sleepEnd: true,
          },
          orderBy: { date: "asc" },
        }),
        prisma.garminBodyComposition.findMany({
          where: { userId: user.id, date: { gte: toDateOnly(from), lte: toDateOnly(to) } },
          select: { date: true, weight: true, bmi: true, bodyFatPct: true },
          orderBy: { date: "asc" },
        }),
        // Withings has much more weight data — merge with Garmin
        prisma.withingsMeasurement.findMany({
          where: { userId: user.id, date: { gte: toDateOnly(from), lte: toDateOnly(to) }, weight: { not: null } },
          select: { date: true, weight: true, bmi: true, fatRatio: true },
          orderBy: { date: "asc" },
        }),
      ]);

      const toHours = (sec: number | null) => (sec != null ? Math.round((sec / 3600) * 100) / 100 : null);
      const epochMsToHour = (ms: string | null) => {
        if (!ms) return null;
        const d = new Date(Number(ms));
        return d.getHours() + d.getMinutes() / 60;
      };

      // Merge weight data: Withings first (more data), Garmin as supplement
      // Group by date, prefer Withings values, deduplicate
      const weightByDate = new Map<string, GarminWeightPoint>();
      for (const w of garminBody) {
        const ds = dateToString(w.date);
        weightByDate.set(ds, { date: ds, weight: w.weight, bmi: w.bmi, bodyFatPct: w.bodyFatPct });
      }
      for (const w of withingsBody) {
        const ds = dateToString(w.date);
        const existing = weightByDate.get(ds);
        // Withings overrides Garmin, filter out outliers (e.g. other person's scale readings)
        if (w.weight && w.weight > 70 && w.weight < 110) {
          weightByDate.set(ds, {
            date: ds,
            weight: w.weight,
            bmi: w.bmi ?? existing?.bmi ?? null,
            bodyFatPct: w.fatRatio ?? existing?.bodyFatPct ?? null,
          });
        }
      }
      const mergedWeight = Array.from(weightByDate.values()).sort((a, b) => a.date.localeCompare(b.date));

      return {
        daily: garminDaily.map((g) => ({
          date: dateToString(g.date),
          bodyBatteryHigh: g.bodyBatteryHigh,
          bodyBatteryLow: g.bodyBatteryLow,
          steps: g.steps,
          intensityMinutes: g.intensityMinutes,
          restingHr: g.restingHr,
          avgStress: g.avgStress,
          maxStress: g.maxStress,
          fitnessAge: g.fitnessAge,
          caloriesActive: g.caloriesActive,
          caloriesResting: g.caloriesTotal != null && g.caloriesActive != null ? g.caloriesTotal - g.caloriesActive : null,
        })),
        sleep: garminSleep.map((s) => ({
          date: dateToString(s.date),
          durationHours: toHours(s.durationSeconds),
          sleepScore: s.sleepScore,
          deepHours: toHours(s.deepSeconds),
          lightHours: toHours(s.lightSeconds),
          remHours: toHours(s.remSeconds),
          awakeHours: toHours(s.awakeSeconds),
          sleepStartHour: epochMsToHour(s.sleepStart),
          sleepEndHour: epochMsToHour(s.sleepEnd),
        })),
        weight: mergedWeight,
      };
    },
  );
}

export async function getHRVTrend(days: number = 30): Promise<HRVTrendPoint[]> {
  const user = await requireUser();
  const now = new Date();
  const fromDate = new Date(now.getTime() - days * 86400000);
  const from = `${fromDate.getFullYear()}-${String(fromDate.getMonth() + 1).padStart(2, "0")}-${String(fromDate.getDate()).padStart(2, "0")}`;
  const to = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

  return cached<HRVTrendPoint[]>(
    `hrv-trend:${user.id}:${days}:${to}`,
    900, // 15 minutes
    async () => {
      const data = await prisma.garminDaily.findMany({
        where: { userId: user.id, date: { gte: toDateOnly(from), lte: toDateOnly(to) } },
        select: { date: true, hrvLastNight: true, hrvWeeklyAvg: true },
        orderBy: { date: "asc" },
      });

      return data.map((d) => ({
        date: dateToString(d.date),
        hrvLastNight: d.hrvLastNight,
        hrvWeeklyAvg: d.hrvWeeklyAvg,
      }));
    },
  );
}

/** Invalidate all Garmin-related caches (call after Garmin sync) */
export async function invalidateGarminCache(userId?: number) {
  const prefix = userId ? `${userId}:` : "";
  await Promise.all([
    invalidateCache(`garmin-health:${prefix}*`),
    invalidateCache(`hrv-trend:${prefix}*`),
  ]);
}

export async function getMoodTimeline(period: {
  from: string;
  to: string;
}): Promise<MoodTimelinePoint[]> {
  const user = await requireUser();
  const { from, to } = period;

  const logs = await prisma.dailyLog.findMany({
    where: { userId: user.id, date: { gte: toDateOnly(from), lte: toDateOnly(to) } },
    select: { date: true, level: true, sexCount: true, bjCount: true },
    orderBy: { date: "asc" },
  });

  return logs.map((l) => ({ date: dateToString(l.date), level: l.level, sexCount: l.sexCount ?? null, bjCount: l.bjCount ?? null }));
}

export async function getAllDailyLogs() {
  const user = await requireUser();
  const rows = await prisma.dailyLog.findMany({
    where: { userId: user.id },
    orderBy: { date: "desc" },
    take: 500,
    select: {
      id: true, date: true, level: true, moodDelta: true,
      energyLevel: true, stressLevel: true, focusQuality: true,
      kidsHours: true, sexCount: true, bjCount: true,
      alcohol: true, caffeine: true, generalNote: true,
    },
  });
  return rows.map(r => ({ ...r, date: dateToString(r.date) }));
}

export async function getFullMoodTimeline(): Promise<MoodTimelinePoint[]> {
  const user = await requireUser();
  const logs = await prisma.dailyLog.findMany({
    where: { userId: user.id },
    select: { date: true, level: true, sexCount: true, bjCount: true },
    orderBy: { date: "asc" },
    take: 1000,
  });
  return logs.map((l) => ({ date: dateToString(l.date), level: l.level, sexCount: l.sexCount ?? null, bjCount: l.bjCount ?? null }));
}
