"use server";

import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/current-user";
import { updateTag } from "next/cache";
import { CACHE_TAGS } from "@/lib/cache-tags";
import { z } from "zod";
import { addExerciseToWorkoutSchema, addSetSchema, updateSetSchema } from "@/lib/validations";

export async function addExerciseToWorkout(
  workoutId: number,
  exerciseId: number,
  orderNum: number
) {
  const validated = addExerciseToWorkoutSchema.parse({ workoutId, exerciseId, orderNum });
  const user = await requireUser();

  // Auto-mark exercise as custom if user uses it
  await prisma.gymExercise.updateMany({
    where: { id: validated.exerciseId, userId: user.id, isCustom: false },
    data: { isCustom: true },
  });

  const we = await prisma.gymWorkoutExercise.create({
    data: { userId: user.id, workoutId: validated.workoutId, exerciseId: validated.exerciseId, orderNum: validated.orderNum },
    include: { exercise: true, sets: true },
  });
  updateTag(CACHE_TAGS.gym);
  return we;
}

export async function removeExerciseFromWorkout(workoutExerciseId: number) {
  z.number().int().positive().parse(workoutExerciseId);
  const user = await requireUser();
  await prisma.gymWorkoutExercise.delete({
    where: { id: workoutExerciseId, userId: user.id },
  });
  updateTag(CACHE_TAGS.gym);
}

export async function addSet(
  workoutExerciseId: number,
  data: {
    setNum: number;
    weightKg?: number;
    reps?: number;
    rpe?: number;
    isWarmup?: boolean;
    intensity?: string;
  }
) {
  const validated = addSetSchema.parse({ workoutExerciseId, data });
  const user = await requireUser();
  const intensity = validated.data.intensity || "normal";
  const set = await prisma.gymSet.create({
    data: {
      userId: user.id,
      workoutExerciseId: validated.workoutExerciseId,
      setNum: validated.data.setNum,
      weightKg: validated.data.weightKg ?? null,
      reps: validated.data.reps ?? null,
      rpe: validated.data.rpe ?? null,
      isWarmup: intensity === "warmup" ? true : (validated.data.isWarmup ? true : false),
      isFailure: (intensity === "tech-fail" || intensity === "full-fail") ? true : false,
      intensity,
    },
  });
  updateTag(CACHE_TAGS.gym);
  return set;
}

export async function updateSet(
  setId: number,
  data: Partial<{
    weightKg: number | null;
    reps: number | null;
    rpe: number | null;
    isWarmup: boolean;
    isFailure: boolean;
    intensity: string | null;
  }>
) {
  const validated = updateSetSchema.parse({ setId, data });
  const user = await requireUser();
  // Auto-set isWarmup/isFailure based on intensity
  const updateData: Record<string, unknown> = { ...validated.data };
  if (validated.data.intensity !== undefined) {
    updateData.isWarmup = validated.data.intensity === "warmup";
    updateData.isFailure = (validated.data.intensity === "tech-fail" || validated.data.intensity === "full-fail");
  }
  const set = await prisma.gymSet.update({
    where: { id: validated.setId, userId: user.id },
    data: updateData,
  });
  updateTag(CACHE_TAGS.gym);
  return set;
}

export async function deleteSet(setId: number) {
  z.number().int().positive().parse(setId);
  const user = await requireUser();
  await prisma.gymSet.delete({ where: { id: setId, userId: user.id } });
  updateTag(CACHE_TAGS.gym);
}

// Load previous sets for an exercise (from most recent workout that had this exercise)
export async function getLastSetsForExercise(exerciseId: number, currentWorkoutId?: number) {
  z.number().int().positive().parse(exerciseId);
  const user = await requireUser();
  const lastWe = await prisma.gymWorkoutExercise.findFirst({
    where: {
      userId: user.id,
      exerciseId,
      ...(currentWorkoutId ? { workoutId: { not: currentWorkoutId } } : {}),
    },
    orderBy: { id: "desc" },
    include: {
      sets: { orderBy: { setNum: "asc" } },
    },
  });
  if (!lastWe) return [];
  return lastWe.sets.map((s) => ({
    setNum: s.setNum,
    weightKg: s.weightKg,
    reps: s.reps,
    rpe: s.rpe,
  }));
}
