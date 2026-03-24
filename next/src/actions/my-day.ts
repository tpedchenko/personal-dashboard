"use server";

import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/current-user";
import { invalidateAiContextSnapshot } from "@/actions/chat-context";
import { upsertEmbedding } from "@/lib/embeddings";
import { z, ZodError } from "zod";
import { dateSchema, saveDailyLogSchema } from "@/lib/validations";
import { toDateOnly, dateToString } from "@/lib/date-utils";

export async function getDailyLog(date: string) {
  try {
    dateSchema.parse(date);
  } catch (e) {
    if (e instanceof ZodError) return null;
    throw e;
  }
  const user = await requireUser();
  const row = await prisma.dailyLog.findFirst({
    where: { date: toDateOnly(date), userId: user.id },
  });
  return row ? { ...row, date: dateToString(row.date) } : null;
}

export async function getPreviousMoodLevel(date: string) {
  try {
    dateSchema.parse(date);
  } catch (e) {
    if (e instanceof ZodError) return 0;
    throw e;
  }
  const user = await requireUser();
  const prev = await prisma.dailyLog.findFirst({
    where: {
      userId: user.id,
      date: { lt: toDateOnly(date) },
      level: { not: null },
    },
    orderBy: { date: "desc" },
    select: { level: true, date: true },
  });
  return prev?.level ?? 0;
}

export async function getGarminData(date: string) {
  try {
    dateSchema.parse(date);
  } catch (e) {
    if (e instanceof ZodError) return null;
    throw e;
  }
  const user = await requireUser();
  const row = await prisma.garminDaily.findFirst({
    where: { date: toDateOnly(date), userId: user.id },
  });
  return row ? { ...row, date: dateToString(row.date) } : null;
}

export async function getGarminSleepData(date: string) {
  try {
    dateSchema.parse(date);
  } catch (e) {
    if (e instanceof ZodError) return null;
    throw e;
  }
  const user = await requireUser();
  const row = await prisma.garminSleep.findFirst({
    where: { date: toDateOnly(date), userId: user.id },
  });
  return row ? { ...row, date: dateToString(row.date) } : null;
}

export async function getRecentLogs(days: number = 7) {
  try {
    z.number().int().min(1).max(365).parse(days);
  } catch (e) {
    if (e instanceof ZodError) return [];
    throw e;
  }
  const user = await requireUser();
  const today = new Date();
  const fmtDate = (d: Date) => d.toISOString().slice(0, 10);

  const startDate = new Date(today);
  startDate.setDate(today.getDate() - days + 1);

  const logs = await prisma.dailyLog.findMany({
    where: {
      userId: user.id,
      date: { gte: toDateOnly(fmtDate(startDate)), lte: toDateOnly(fmtDate(today)) },
    },
    orderBy: { date: "desc" },
    select: {
      id: true,
      date: true,
      level: true,
      moodDelta: true,
      energyLevel: true,
      stressLevel: true,
      focusQuality: true,
      kidsHours: true,
      kidsNote: true,
      generalNote: true,
      alcohol: true,
      caffeine: true,
      sexCount: true,
      bjCount: true,
    },
  });

  // Fill in all days, including those without entries
  const logMap = new Map(logs.map((l) => [dateToString(l.date), l]));
  const result = [];
  for (let i = 0; i < days; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    const ds = fmtDate(d);
    const existingRaw = logMap.get(ds);
    const existing = existingRaw ? { ...existingRaw, date: dateToString(existingRaw.date) } : null;
    result.push(existing ?? {
      id: 0,
      date: ds,
      level: null,
      moodDelta: null,
      energyLevel: null,
      stressLevel: null,
      focusQuality: null,
      kidsHours: null,
      kidsNote: null,
      generalNote: null,
      alcohol: null,
      caffeine: null,
      sexCount: null,
      bjCount: null,
    });
  }
  return result;
}

export async function saveDailyLog(data: {
  date: string;
  level?: number;
  moodDelta?: number;
  energyLevel?: number;
  stressLevel?: number;
  focusQuality?: number;
  alcohol?: number;
  caffeine?: number;
  kidsHours?: number;
  kidsNote?: string;
  generalNote?: string;
  sexCount?: number;
  bjCount?: number;
}) {
  try {
    saveDailyLogSchema.parse(data);
  } catch (e) {
    if (e instanceof ZodError) return { error: "Invalid input" };
    throw e;
  }
  const user = await requireUser();

  // Compute mood level: previous_level + mood_delta/10 (slider -10..+10 → level change -1..+1)
  let computedLevel = data.level;
  if (data.moodDelta != null) {
    const prevLevel = await getPreviousMoodLevel(data.date);
    computedLevel = Math.max(-5, Math.min(5, Math.round((prevLevel + data.moodDelta * 0.1) * 100) / 100));
  }

  const payload = {
    level: computedLevel ?? undefined,
    moodDelta: data.moodDelta ?? undefined,
    energyLevel: data.energyLevel ?? undefined,
    stressLevel: data.stressLevel ?? undefined,
    focusQuality: data.focusQuality ?? undefined,
    alcohol: data.alcohol ?? undefined,
    caffeine: data.caffeine ?? undefined,
    kidsHours: data.kidsHours ?? undefined,
    kidsNote: data.kidsNote ?? undefined,
    generalNote: data.generalNote ?? undefined,
    sexCount: data.sexCount ?? undefined,
    bjCount: data.bjCount ?? undefined,
  };

  // Find existing log for this user+date
  const existing = await prisma.dailyLog.findFirst({
    where: { date: toDateOnly(data.date), userId: user.id },
  });
  let result;
  if (existing) {
    result = await prisma.dailyLog.update({
      where: { id: existing.id },
      data: payload,
    });
  } else {
    result = await prisma.dailyLog.create({
      data: {
        date: toDateOnly(data.date),
        userId: user.id,
        level: computedLevel ?? null,
        moodDelta: data.moodDelta ?? null,
        energyLevel: data.energyLevel ?? null,
        stressLevel: data.stressLevel ?? null,
        focusQuality: data.focusQuality ?? null,
        alcohol: data.alcohol ?? null,
        caffeine: data.caffeine ?? null,
        kidsHours: data.kidsHours ?? null,
        kidsNote: data.kidsNote ?? null,
        generalNote: data.generalNote ?? null,
        sexCount: data.sexCount ?? null,
        bjCount: data.bjCount ?? null,
      },
    });
  }
  await invalidateAiContextSnapshot(user.id);

  // Fire-and-forget embedding for daily log with general_note
  if (result.generalNote) {
    upsertEmbedding(
      user.id,
      "daily_log",
      result.id,
      `[${dateToString(result.date)}] ${result.generalNote}`,
    ).catch((err) => console.error("[embeddings] daily_log embed failed:", err));
  }

  return { ...result, date: dateToString(result.date) };
}
