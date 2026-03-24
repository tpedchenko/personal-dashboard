"use server";

import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/current-user";
import { updateTag } from "next/cache";
import { CACHE_TAGS } from "@/lib/cache-tags";
import { DEFAULT_EXERCISES } from "./utils";
import { z } from "zod";
import { createExerciseSchema, updateExerciseSchema, exerciseFilterSchema } from "@/lib/validations";

// Create custom exercise
export async function createExercise(data: {
  name: string;
  muscleGroup: string;
  equipment: string;
  secondaryMuscles?: string;
  recoveryHours?: number;
}) {
  const validated = createExerciseSchema.parse(data);
  const user = await requireUser();
  const existing = await prisma.gymExercise.findFirst({
    where: { userId: user.id, name: validated.name },
  });
  if (existing) {
    throw new Error("Exercise with this name already exists");
  }
  const exercise = await prisma.gymExercise.create({
    data: {
      userId: user.id,
      name: validated.name,
      muscleGroup: validated.muscleGroup,
      equipment: validated.equipment,
      secondaryMuscles: validated.secondaryMuscles ?? null,
      recoveryHours: validated.recoveryHours ?? 72,
      isCustom: true,
    },
  });
  updateTag(CACHE_TAGS.gym);
  return exercise;
}

// Update exercise
export async function updateExercise(id: number, data: {
  name?: string;
  muscleGroup?: string;
  equipment?: string;
  secondaryMuscles?: string;
  recoveryHours?: number;
}) {
  const validated = updateExerciseSchema.parse({ id, data });
  const user = await requireUser();
  await prisma.gymExercise.update({
    where: { id: validated.id, userId: user.id },
    data: validated.data,
  });
  updateTag(CACHE_TAGS.gym);
}

// Delete custom exercise
export async function deleteExercise(id: number) {
  z.number().int().positive().parse(id);
  const user = await requireUser();
  await prisma.gymExercise.delete({
    where: { id, userId: user.id },
  });
  updateTag(CACHE_TAGS.gym);
}

// Get custom exercises
export async function getCustomExercises() {
  const user = await requireUser();
  return prisma.gymExercise.findMany({
    where: { userId: user.id, isCustom: true },
    orderBy: { name: "asc" },
  });
}

// Exercise usage stats
export async function getExerciseUsageStats() {
  const user = await requireUser();
  // Get usage count + last used date for each exercise
  const stats = await prisma.$queryRaw<
    { exercise_id: number; count: bigint; last_used: string | null; recent_count: bigint }[]
  >`
    SELECT
      we.exercise_id,
      COUNT(*)::bigint as count,
      MAX(w.date)::text as last_used,
      COUNT(*) FILTER (WHERE w.date >= (NOW() - INTERVAL '12 months')::date)::bigint as recent_count
    FROM gym_workout_exercises we
    JOIN gym_workouts w ON w.id = we.workout_id
    WHERE we.user_id = ${user.id}
    GROUP BY we.exercise_id
  `;
  return stats.map(s => ({
    exerciseId: s.exercise_id,
    count: Number(s.count),
    lastUsed: s.last_used,
    recentCount: Number(s.recent_count),
  }));
}

// Exercise library
export async function getExercises(filter?: {
  muscleGroup?: string;
  search?: string;
}) {
  if (filter) exerciseFilterSchema.parse(filter);
  const user = await requireUser();
  return prisma.gymExercise.findMany({
    where: {
      userId: user.id,
      ...(filter?.muscleGroup ? { muscleGroup: filter.muscleGroup } : {}),
      ...(filter?.search
        ? { name: { contains: filter.search, mode: "insensitive" as const } }
        : {}),
    },
    select: {
      id: true,
      name: true,
      nameUa: true,
      muscleGroup: true,
      equipment: true,
      secondaryMuscles: true,
      recoveryHours: true,
      isCustom: true,
      isFavourite: true,
    },
    orderBy: { name: "asc" },
  });
}

export async function getExercise(id: number) {
  z.number().int().positive().parse(id);
  const user = await requireUser();
  return prisma.gymExercise.findUnique({ where: { id, userId: user.id } });
}

export async function getDefaultExercises() {
  const user = await requireUser();
  // Get existing exercise names for this user
  const existing = await prisma.gymExercise.findMany({
    where: { userId: user.id },
    select: { name: true },
  });
  const existingNames = new Set(existing.map(e => e.name));
  // Return only defaults that user doesn't already have
  return DEFAULT_EXERCISES.filter(e => !existingNames.has(e.name));
}

export async function addDefaultExercise(exerciseName: string) {
  z.string().min(1).max(200).parse(exerciseName);
  const user = await requireUser();
  const def = DEFAULT_EXERCISES.find(e => e.name === exerciseName);
  if (!def) throw new Error("Unknown default exercise");

  const existing = await prisma.gymExercise.findFirst({
    where: { userId: user.id, name: def.name },
  });
  if (existing) throw new Error("Exercise already exists");

  await prisma.gymExercise.create({
    data: {
      userId: user.id,
      name: def.name,
      nameUa: def.nameUa,
      muscleGroup: def.muscleGroup,
      equipment: def.equipment,
      secondaryMuscles: def.secondaryMuscles || null,
      isCustom: true,
    },
  });
  updateTag(CACHE_TAGS.gym);
}
