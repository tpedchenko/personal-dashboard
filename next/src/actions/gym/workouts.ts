"use server";

import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/current-user";
import { updateTag } from "next/cache";
import { CACHE_TAGS } from "@/lib/cache-tags";
import { invalidateAiContextSnapshot } from "@/actions/chat-context/index";
import { z, ZodError } from "zod";
import { dateSchema, getWorkoutsSchema, createWorkoutSchema, completeWorkoutSchema, updateWorkoutSchema } from "@/lib/validations";
import { toDateOnly, dateToString } from "@/lib/date-utils";

export async function getWorkouts(limit?: number, dateFrom?: string, dateTo?: string) {
  const validated = getWorkoutsSchema.parse({ limit, dateFrom, dateTo });
  const user = await requireUser();
  const dateFilter: { gte?: Date; lte?: Date } = {};
  if (validated.dateFrom) dateFilter.gte = toDateOnly(validated.dateFrom);
  if (validated.dateTo) dateFilter.lte = toDateOnly(validated.dateTo);
  const where = {
    userId: user.id,
    ...(validated.dateFrom || validated.dateTo ? { date: dateFilter } : {}),
  };
  const rows = await prisma.gymWorkout.findMany({
    where,
    take: validated.limit ?? 20,
    orderBy: { date: "desc" },
    include: {
      exercises: {
        orderBy: { orderNum: "asc" },
        include: {
          exercise: true,
          sets: { orderBy: { setNum: "asc" } },
        },
      },
    },
  });
  return rows.map(r => ({ ...r, date: dateToString(r.date) }));
}

export async function getWorkout(id: number) {
  z.number().int().positive().parse(id);
  const user = await requireUser();
  const row = await prisma.gymWorkout.findUnique({
    where: { id, userId: user.id },
    include: {
      exercises: {
        orderBy: { orderNum: "asc" },
        include: {
          exercise: true,
          sets: { orderBy: { setNum: "asc" } },
        },
      },
    },
  });
  return row ? { ...row, date: dateToString(row.date) } : null;
}

export async function createWorkout(data: {
  date: string;
  workoutName?: string;
  programType?: string;
}) {
  const validated = createWorkoutSchema.parse(data);
  const user = await requireUser();
  const now = new Date();
  const startTime = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  const workout = await prisma.gymWorkout.create({
    data: {
      userId: user.id,
      date: toDateOnly(validated.date),
      workoutName: validated.workoutName ?? null,
      programType: validated.programType ?? null,
      startTime,
    },
  });
  updateTag(CACHE_TAGS.gym);
  await invalidateAiContextSnapshot(user.id);
  return { ...workout, date: dateToString(workout.date) };
}

export async function completeWorkout(id: number, durationMinutes: number) {
  const validated = completeWorkoutSchema.parse({ id, durationMinutes });
  const user = await requireUser();
  const now = new Date();
  const endTime = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  const workout = await prisma.gymWorkout.update({
    where: { id: validated.id, userId: user.id },
    data: { endTime, durationMinutes: validated.durationMinutes },
  });
  updateTag(CACHE_TAGS.gym);
  return { ...workout, date: dateToString(workout.date) };
}

export async function updateWorkout(id: number, data: { workoutName?: string; date?: string }) {
  const validated = updateWorkoutSchema.parse({ id, data });
  const user = await requireUser();
  const updateData = { ...validated.data, ...(validated.data.date ? { date: toDateOnly(validated.data.date) } : {}) };
  const workout = await prisma.gymWorkout.update({
    where: { id: validated.id, userId: user.id },
    data: updateData,
  });
  updateTag(CACHE_TAGS.gym);
  return { ...workout, date: dateToString(workout.date) };
}

export async function deleteWorkout(id: number) {
  z.number().int().positive().parse(id);
  const user = await requireUser();
  await prisma.gymWorkout.delete({ where: { id, userId: user.id } });
  updateTag(CACHE_TAGS.gym);
  await invalidateAiContextSnapshot(user.id);
}
