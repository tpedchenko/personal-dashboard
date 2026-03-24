"use server";

import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/current-user";
import { updateTag } from "next/cache";
import { toDateOnly } from "@/lib/date-utils";
import { CACHE_TAGS } from "@/lib/cache-tags";

// Start a workout from a program day template
export async function startWorkoutFromTemplate(programDayId: number, date: string) {
  const user = await requireUser();
  const day = await prisma.gymProgramDay.findUnique({
    where: { id: programDayId },
    include: {
      exercises: {
        orderBy: { orderNum: "asc" },
        include: { exercise: true },
      },
      program: true,
    },
  });
  if (!day || day.program.userId !== user.id) throw new Error("Not found");

  const now = new Date();
  const startTime = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  const workout = await prisma.gymWorkout.create({
    data: {
      userId: user.id,
      date: toDateOnly(date),
      workoutName: `${day.program.name} — ${day.dayName}`,
      programType: day.focus || null,
      startTime,
    },
  });

  // Add all exercises from template in a single transaction
  await prisma.$transaction(async (tx) => {
    const createdExercises = await Promise.all(
      day.exercises.map((pe) =>
        tx.gymWorkoutExercise.create({
          data: {
            userId: user.id,
            workoutId: workout.id,
            exerciseId: pe.exerciseId,
            orderNum: pe.orderNum,
          },
        })
      )
    );

    // Batch-create all sets for all exercises
    const setsData: { userId: number; workoutExerciseId: number; setNum: number }[] = [];
    for (let idx = 0; idx < day.exercises.length; idx++) {
      const targetSets = day.exercises[idx].targetSets ?? 3;
      for (let i = 1; i <= targetSets; i++) {
        setsData.push({
          userId: user.id,
          workoutExerciseId: createdExercises[idx].id,
          setNum: i,
        });
      }
    }
    await tx.gymSet.createMany({ data: setsData });
  });

  updateTag(CACHE_TAGS.gym);
  return workout;
}
