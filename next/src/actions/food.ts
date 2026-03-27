"use server";

import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/current-user";
import { invalidateAiContextSnapshot } from "@/actions/chat-context/index";
import { z } from "zod";
import { dateSchema, addFoodEntrySchema } from "@/lib/validations";
import { toDateOnly, dateToString } from "@/lib/date-utils";

export async function getFoodEntries(date: string) {
  dateSchema.parse(date);
  const user = await requireUser();
  const rows = await prisma.foodLog.findMany({
    where: { date: toDateOnly(date), userId: user.id },
    orderBy: { time: "asc" },
  });
  return rows.map(r => ({ ...r, date: dateToString(r.date) }));
}

export async function getDailySummary(date: string) {
  dateSchema.parse(date);
  const user = await requireUser();
  const result = await prisma.foodLog.aggregate({
    where: { date: toDateOnly(date), userId: user.id },
    _sum: {
      calories: true,
      proteinG: true,
      fatG: true,
      carbsG: true,
    },
  });

  return {
    calories: result._sum.calories ?? 0,
    protein: result._sum.proteinG ?? 0,
    fat: result._sum.fatG ?? 0,
    carbs: result._sum.carbsG ?? 0,
  };
}

export async function addFoodEntry(data: {
  date: string;
  time?: string;
  description: string;
  calories?: number;
  proteinG?: number;
  fatG?: number;
  carbsG?: number;
}) {
  const validated = addFoodEntrySchema.parse(data);
  const user = await requireUser();
  const entry = await prisma.foodLog.create({
    data: {
      date: toDateOnly(validated.date),
      time: validated.time ?? null,
      description: validated.description,
      calories: validated.calories ?? null,
      proteinG: validated.proteinG ?? null,
      fatG: validated.fatG ?? null,
      carbsG: validated.carbsG ?? null,
      source: "manual",
      confirmed: true,
      userId: user.id,
    },
  });
  await invalidateAiContextSnapshot(user.id);
  return { ...entry, date: dateToString(entry.date) };
}

export async function deleteFoodEntry(id: number) {
  z.number().int().positive().parse(id);
  const user = await requireUser();
  const result = await prisma.foodLog.delete({
    where: { id, userId: user.id },
  });
  await invalidateAiContextSnapshot(user.id);
  return result;
}

export async function getCalorieTrend(days: number = 30) {
  z.number().int().min(1).max(365).parse(days);
  const user = await requireUser();
  const end = new Date();
  const start = new Date();
  start.setDate(end.getDate() - days + 1);

  const fmtDate = (d: Date) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  };

  const rows = await prisma.foodLog.groupBy({
    by: ["date"],
    where: {
      userId: user.id,
      date: { gte: toDateOnly(fmtDate(start)), lte: toDateOnly(fmtDate(end)) },
    },
    _sum: { calories: true },
    orderBy: { date: "asc" },
  });

  // Build a full array of days so gaps show as 0
  const result: { date: string; calories: number }[] = [];
  const cursor = new Date(start);
  const rowMap = new Map(rows.map((r) => [dateToString(r.date), r._sum.calories ?? 0]));

  while (cursor <= end) {
    const ds = fmtDate(cursor);
    result.push({ date: ds, calories: Math.round(rowMap.get(ds) ?? 0) });
    cursor.setDate(cursor.getDate() + 1);
  }

  return result;
}
