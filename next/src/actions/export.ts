"use server";

import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/current-user";
import { dateToString } from "@/lib/date-utils";

// ── Transactions CSV ──

export async function exportTransactions(): Promise<string> {
  const user = await requireUser();
  const rows = await prisma.transaction.findMany({
    where: { userId: user.id },
    orderBy: { date: "desc" },
    take: 10000,
  });

  const header =
    "id,date,year,month,type,sub_type,account,category,amount_original,currency_original,amount_eur,nbu_rate_eur_used,description,owner,source,created_at";
  const lines = rows.map((r) =>
    [
      r.id,
      dateToString(r.date),
      r.year ?? "",
      r.month ?? "",
      r.type ?? "",
      r.subType ?? "",
      csvEscape(r.account ?? ""),
      csvEscape(r.category ?? ""),
      r.amountOriginal ?? "",
      r.currencyOriginal ?? "",
      r.amountEur ?? "",
      r.nbuRateEurUsed ?? "",
      csvEscape(r.description ?? ""),
      csvEscape(r.owner ?? ""),
      r.source ?? "",
      r.createdAt ?? "",
    ].join(",")
  );

  return [header, ...lines].join("\n");
}

// ── Daily Logs CSV ──

export async function exportDailyLogs(): Promise<string> {
  const user = await requireUser();
  const rows = await prisma.dailyLog.findMany({
    where: { userId: user.id },
    orderBy: { date: "desc" },
    take: 10000,
  });

  const header =
    "id,date,level,mood_delta,sex_count,sex_note,bj_count,bj_note,kids_hours,kids_note,general_note,energy_level,stress_level,focus_quality,alcohol,caffeine,created_at";
  const lines = rows.map((r) =>
    [
      r.id,
      dateToString(r.date),
      r.level ?? "",
      r.moodDelta ?? "",
      r.sexCount ?? "",
      csvEscape(r.sexNote ?? ""),
      r.bjCount ?? "",
      csvEscape(r.bjNote ?? ""),
      r.kidsHours ?? "",
      csvEscape(r.kidsNote ?? ""),
      csvEscape(r.generalNote ?? ""),
      r.energyLevel ?? "",
      r.stressLevel ?? "",
      r.focusQuality ?? "",
      r.alcohol ?? "",
      r.caffeine ?? "",
      r.createdAt ?? "",
    ].join(",")
  );

  return [header, ...lines].join("\n");
}

// ── Food Logs CSV ──

export async function exportFoodLogs(): Promise<string> {
  const user = await requireUser();
  const rows = await prisma.foodLog.findMany({
    where: { userId: user.id },
    orderBy: { date: "desc" },
    take: 10000,
  });

  const header =
    "id,date,time,description,weight_g,calories,protein_g,fat_g,carbs_g,source,confirmed,created_at";
  const lines = rows.map((r) =>
    [
      r.id,
      dateToString(r.date),
      r.time ?? "",
      csvEscape(r.description ?? ""),
      r.weightG ?? "",
      r.calories ?? "",
      r.proteinG ?? "",
      r.fatG ?? "",
      r.carbsG ?? "",
      r.source ?? "",
      r.confirmed ? 1 : 0,
      r.createdAt ?? "",
    ].join(",")
  );

  return [header, ...lines].join("\n");
}

// ── Workouts CSV ──

export async function exportWorkouts(): Promise<string> {
  const user = await requireUser();
  const workouts = await prisma.gymWorkout.findMany({
    where: { userId: user.id },
    orderBy: { date: "desc" },
    take: 10000,
    include: {
      exercises: {
        include: {
          exercise: true,
          sets: { orderBy: { setNum: "asc" } },
        },
        orderBy: { orderNum: "asc" },
      },
    },
  });

  const header =
    "workout_id,date,start_time,end_time,program_type,workout_name,notes,duration_minutes,exercise_name,muscle_group,set_num,weight_kg,reps,is_warmup,is_failure,rpe,set_notes";
  const lines: string[] = [];

  for (const w of workouts) {
    if (w.exercises.length === 0) {
      // Workout with no exercises — single row
      lines.push(
        [
          w.id,
          w.date,
          w.startTime ?? "",
          w.endTime ?? "",
          csvEscape(w.programType ?? ""),
          csvEscape(w.workoutName ?? ""),
          csvEscape(w.notes ?? ""),
          w.durationMinutes ?? "",
          "",
          "",
          "",
          "",
          "",
          "",
          "",
          "",
          "",
        ].join(",")
      );
    }

    for (const ex of w.exercises) {
      if (ex.sets.length === 0) {
        lines.push(
          [
            w.id,
            dateToString(w.date),
            w.startTime ?? "",
            w.endTime ?? "",
            csvEscape(w.programType ?? ""),
            csvEscape(w.workoutName ?? ""),
            csvEscape(w.notes ?? ""),
            w.durationMinutes ?? "",
            csvEscape(ex.exercise.name),
            csvEscape(ex.exercise.muscleGroup ?? ""),
            "",
            "",
            "",
            "",
            "",
            "",
            "",
          ].join(",")
        );
      }
      for (const s of ex.sets) {
        lines.push(
          [
            w.id,
            dateToString(w.date),
            w.startTime ?? "",
            w.endTime ?? "",
            csvEscape(w.programType ?? ""),
            csvEscape(w.workoutName ?? ""),
            csvEscape(w.notes ?? ""),
            w.durationMinutes ?? "",
            csvEscape(ex.exercise.name),
            csvEscape(ex.exercise.muscleGroup ?? ""),
            s.setNum,
            s.weightKg ?? "",
            s.reps ?? "",
            s.isWarmup ? 1 : 0,
            s.isFailure ? 1 : 0,
            s.rpe ?? "",
            csvEscape(s.notes ?? ""),
          ].join(",")
        );
      }
    }
  }

  return [header, ...lines].join("\n");
}

// ── Helpers ──

function csvEscape(value: string): string {
  if (value.includes(",") || value.includes('"') || value.includes("\n")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}
