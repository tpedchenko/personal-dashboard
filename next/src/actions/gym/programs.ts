"use server";

import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/current-user";

export async function getPrograms() {
  const user = await requireUser();
  return prisma.gymProgram.findMany({
    where: { userId: user.id },
    orderBy: { name: "asc" },
    include: {
      days: {
        orderBy: { dayNum: "asc" },
        include: {
          exercises: {
            orderBy: { orderNum: "asc" },
            include: { exercise: true },
          },
        },
      },
    },
  });
}

export async function getProgram(id: number) {
  const user = await requireUser();
  return prisma.gymProgram.findUnique({
    where: { id, userId: user.id },
    include: {
      days: {
        orderBy: { dayNum: "asc" },
        include: {
          exercises: {
            orderBy: { orderNum: "asc" },
            include: { exercise: true },
          },
        },
      },
    },
  });
}

export async function createProgram(data: {
  name: string;
  description?: string;
  programType?: string;
  daysPerWeek?: number;
}) {
  const user = await requireUser();
  return prisma.gymProgram.create({
    data: {
      userId: user.id,
      name: data.name,
      description: data.description ?? null,
      programType: data.programType ?? null,
      daysPerWeek: data.daysPerWeek ?? 3,
    },
  });
}

export async function updateProgram(id: number, data: {
  name?: string;
  description?: string;
  programType?: string;
  daysPerWeek?: number;
}) {
  const user = await requireUser();
  await prisma.gymProgram.update({
    where: { id, userId: user.id },
    data,
  });
}

export async function deleteProgram(id: number) {
  const user = await requireUser();
  await prisma.gymProgram.delete({
    where: { id, userId: user.id },
  });
}

export async function addProgramDay(programId: number, dayName: string, focus?: string) {
  const user = await requireUser();
  const maxDay = await prisma.gymProgramDay.findFirst({
    where: { programId, userId: user.id },
    orderBy: { dayNum: "desc" },
  });
  return prisma.gymProgramDay.create({
    data: {
      userId: user.id,
      programId,
      dayNum: (maxDay?.dayNum ?? 0) + 1,
      dayName,
      focus: focus ?? null,
    },
  });
}

export async function deleteProgramDay(dayId: number) {
  const user = await requireUser();
  await prisma.gymProgramDay.delete({
    where: { id: dayId, userId: user.id },
  });
}

export async function addExerciseToProgram(programId: number, exerciseId: number, targetSets?: number, targetReps?: string) {
  const user = await requireUser();
  // Find or create a default day for this program
  let day = await prisma.gymProgramDay.findFirst({
    where: { programId, userId: user.id },
    orderBy: { dayNum: "asc" },
  });
  if (!day) {
    day = await prisma.gymProgramDay.create({
      data: { userId: user.id, programId, dayNum: 1, dayName: "Workout", focus: "" },
    });
  }
  return addExerciseToProgramDay(day.id, exerciseId, targetSets, targetReps);
}

export async function addExerciseToProgramDay(dayId: number, exerciseId: number, targetSets?: number, targetReps?: string) {
  const user = await requireUser();
  const maxOrder = await prisma.gymProgramExercise.findFirst({
    where: { programDayId: dayId, userId: user.id },
    orderBy: { orderNum: "desc" },
  });
  return prisma.gymProgramExercise.create({
    data: {
      userId: user.id,
      programDayId: dayId,
      exerciseId,
      orderNum: (maxOrder?.orderNum ?? 0) + 1,
      targetSets: targetSets ?? 3,
      targetReps: targetReps ?? "8-12",
    },
  });
}

export async function updateProgramExercise(id: number, data: { targetSets?: number; targetReps?: string }) {
  const user = await requireUser();
  await prisma.gymProgramExercise.update({
    where: { id, userId: user.id },
    data,
  });
}

export async function removeProgramExercise(id: number) {
  const user = await requireUser();
  await prisma.gymProgramExercise.delete({
    where: { id, userId: user.id },
  });
}
