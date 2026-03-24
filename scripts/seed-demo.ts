/**
 * Seed script: creates a demo user and generates realistic demo data.
 *
 * Run:  cd pd/next && npx tsx ../scripts/seed-demo.ts
 *
 * Re-run safe: uses upsert for user, deletes+recreates all owned data.
 * Requires DATABASE_URL env var.
 */

import { PrismaClient } from "../next/src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const DEMO_EMAIL = "demo@example.com";
const DEMO_NAME = "Alex Demo";

/** 3-month window ending yesterday */
const TODAY = new Date();
const END_DATE = new Date(TODAY.getFullYear(), TODAY.getMonth(), TODAY.getDate() - 1);
const START_DATE = new Date(END_DATE.getFullYear(), END_DATE.getMonth() - 3, END_DATE.getDate());

// ---------------------------------------------------------------------------
// Prisma setup
// ---------------------------------------------------------------------------

function createPrisma() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set. Example: DATABASE_URL=postgresql://pd:...@localhost:5432/pd_dev");
  }
  const adapter = new PrismaPg({ connectionString, max: 3 });
  return new PrismaClient({ adapter });
}

const prisma = createPrisma();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function toDateOnly(s: string): Date {
  return new Date(s + "T00:00:00.000Z");
}

function fmtDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Deterministic pseudo-random based on seed */
function seededRandom(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) & 0x7fffffff;
    return s / 0x7fffffff;
  };
}

/** Generate array of dates between start and end (inclusive), one per day */
function dateRange(start: Date, end: Date): string[] {
  const dates: string[] = [];
  const d = new Date(start);
  while (d <= end) {
    dates.push(fmtDate(d));
    d.setDate(d.getDate() + 1);
  }
  return dates;
}

function pick<T>(arr: T[], rand: () => number): T {
  return arr[Math.floor(rand() * arr.length)];
}

function randInt(min: number, max: number, rand: () => number): number {
  return Math.floor(rand() * (max - min + 1)) + min;
}

function randFloat(min: number, max: number, rand: () => number): number {
  return round2(min + rand() * (max - min));
}

// ---------------------------------------------------------------------------
// 1. Transactions (~50)
// ---------------------------------------------------------------------------

interface TxTemplate {
  category: string;
  type: string;
  description: string;
  minAmount: number;
  maxAmount: number;
  account: string;
  frequency: "monthly" | "weekly" | "biweekly" | "occasional";
}

const TX_TEMPLATES: TxTemplate[] = [
  // Monthly fixed
  { category: "Housing", type: "EXPENSE", description: "Rent payment", minAmount: -950, maxAmount: -950, account: "Main Bank", frequency: "monthly" },
  { category: "Utilities", type: "EXPENSE", description: "Electricity bill", minAmount: -45, maxAmount: -85, account: "Main Bank", frequency: "monthly" },
  { category: "Utilities", type: "EXPENSE", description: "Internet & phone", minAmount: -55, maxAmount: -55, account: "Main Bank", frequency: "monthly" },
  { category: "Insurance", type: "EXPENSE", description: "Health insurance", minAmount: -120, maxAmount: -120, account: "Main Bank", frequency: "monthly" },
  { category: "Subscriptions", type: "EXPENSE", description: "Spotify Premium", minAmount: -10.99, maxAmount: -10.99, account: "Credit Card", frequency: "monthly" },
  { category: "Subscriptions", type: "EXPENSE", description: "Netflix", minAmount: -15.49, maxAmount: -15.49, account: "Credit Card", frequency: "monthly" },
  { category: "Subscriptions", type: "EXPENSE", description: "Gym membership", minAmount: -45, maxAmount: -45, account: "Main Bank", frequency: "monthly" },
  // Salary
  { category: "Salary", type: "INCOME", description: "Monthly salary", minAmount: 3200, maxAmount: 3400, account: "Main Bank", frequency: "monthly" },
  // Weekly
  { category: "Groceries", type: "EXPENSE", description: "Supermarket", minAmount: -35, maxAmount: -95, account: "Credit Card", frequency: "weekly" },
  // Biweekly
  { category: "Dining", type: "EXPENSE", description: "Restaurant dinner", minAmount: -25, maxAmount: -65, account: "Credit Card", frequency: "biweekly" },
  { category: "Transport", type: "EXPENSE", description: "Metro pass top-up", minAmount: -20, maxAmount: -40, account: "Main Bank", frequency: "biweekly" },
  // Occasional
  { category: "Shopping", type: "EXPENSE", description: "Amazon purchase", minAmount: -15, maxAmount: -120, account: "Credit Card", frequency: "occasional" },
  { category: "Healthcare", type: "EXPENSE", description: "Pharmacy", minAmount: -8, maxAmount: -35, account: "Credit Card", frequency: "occasional" },
  { category: "Entertainment", type: "EXPENSE", description: "Cinema tickets", minAmount: -12, maxAmount: -24, account: "Credit Card", frequency: "occasional" },
  { category: "Clothing", type: "EXPENSE", description: "Clothing store", minAmount: -30, maxAmount: -90, account: "Credit Card", frequency: "occasional" },
  { category: "Education", type: "EXPENSE", description: "Online course", minAmount: -15, maxAmount: -50, account: "Credit Card", frequency: "occasional" },
  { category: "Gifts", type: "EXPENSE", description: "Birthday gift", minAmount: -20, maxAmount: -60, account: "Credit Card", frequency: "occasional" },
  { category: "Transfer", type: "EXPENSE", description: "Transfer to savings", minAmount: -200, maxAmount: -500, account: "Main Bank", frequency: "monthly" },
];

function generateTransactions(rand: () => number): Array<{
  date: string; category: string; type: string; description: string; amountEur: number; account: string;
}> {
  const allDates = dateRange(START_DATE, END_DATE);
  const txs: Array<{ date: string; category: string; type: string; description: string; amountEur: number; account: string }> = [];

  for (const tmpl of TX_TEMPLATES) {
    if (tmpl.frequency === "monthly") {
      // One per month — pick a day in the first half
      const months = new Set(allDates.map(d => d.slice(0, 7)));
      for (const month of months) {
        const day = tmpl.category === "Salary" ? "01" : String(randInt(1, 15, rand)).padStart(2, "0");
        const date = `${month}-${day}`;
        if (date >= fmtDate(START_DATE) && date <= fmtDate(END_DATE)) {
          const amount = tmpl.minAmount === tmpl.maxAmount ? tmpl.minAmount : randFloat(tmpl.minAmount, tmpl.maxAmount, rand);
          txs.push({ date, category: tmpl.category, type: tmpl.type, description: tmpl.description, amountEur: amount, account: tmpl.account });
        }
      }
    } else if (tmpl.frequency === "weekly") {
      // ~1 per week
      for (let i = 0; i < allDates.length; i += randInt(5, 9, rand)) {
        const date = allDates[Math.min(i, allDates.length - 1)];
        const amount = randFloat(tmpl.minAmount, tmpl.maxAmount, rand);
        txs.push({ date, category: tmpl.category, type: tmpl.type, description: tmpl.description, amountEur: amount, account: tmpl.account });
      }
    } else if (tmpl.frequency === "biweekly") {
      for (let i = 0; i < allDates.length; i += randInt(10, 18, rand)) {
        const date = allDates[Math.min(i, allDates.length - 1)];
        const amount = randFloat(tmpl.minAmount, tmpl.maxAmount, rand);
        txs.push({ date, category: tmpl.category, type: tmpl.type, description: tmpl.description, amountEur: amount, account: tmpl.account });
      }
    } else {
      // occasional: 1-3 times over 3 months
      const count = randInt(1, 3, rand);
      for (let j = 0; j < count; j++) {
        const date = pick(allDates, rand);
        const amount = randFloat(tmpl.minAmount, tmpl.maxAmount, rand);
        txs.push({ date, category: tmpl.category, type: tmpl.type, description: tmpl.description, amountEur: amount, account: tmpl.account });
      }
    }
  }

  return txs.sort((a, b) => a.date.localeCompare(b.date));
}

async function seedTransactions(userId: number) {
  const rand = seededRandom(42);
  const txs = generateTransactions(rand);
  console.log(`  Seeding ${txs.length} transactions...`);

  for (const tx of txs) {
    const d = toDateOnly(tx.date);
    await prisma.transaction.create({
      data: {
        date: d,
        year: d.getUTCFullYear(),
        month: d.getUTCMonth() + 1,
        type: tx.type,
        category: tx.category,
        amountEur: tx.amountEur,
        amountOriginal: tx.amountEur,
        currencyOriginal: "EUR",
        description: tx.description,
        account: tx.account,
        owner: DEMO_NAME,
        source: "demo-seed",
        userId,
      },
    });
  }
  console.log(`    -> ${txs.length} transactions created`);
}

// ---------------------------------------------------------------------------
// 2. Daily Log (~30 entries)
// ---------------------------------------------------------------------------

async function seedDailyLogs(userId: number) {
  const rand = seededRandom(101);
  const allDates = dateRange(START_DATE, END_DATE);
  // Pick ~30 dates spread across the range
  const selectedDates: string[] = [];
  for (const d of allDates) {
    if (rand() < 0.33) selectedDates.push(d); // ~1/3 of days
  }
  // Cap at ~30
  const dates = selectedDates.slice(0, 35);
  console.log(`  Seeding ${dates.length} daily_log entries...`);

  for (const dateStr of dates) {
    const dayOfWeek = new Date(dateStr).getDay();
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

    await prisma.dailyLog.upsert({
      where: { userId_date: { userId, date: toDateOnly(dateStr) } },
      update: {},
      create: {
        userId,
        date: toDateOnly(dateStr),
        level: randFloat(5, 9, rand),
        moodDelta: randInt(-2, 3, rand),
        energyLevel: randInt(3, 9, rand),
        stressLevel: isWeekend ? randInt(1, 4, rand) : randInt(3, 7, rand),
        focusQuality: randInt(4, 9, rand),
        alcohol: isWeekend && rand() > 0.5 ? randInt(1, 3, rand) : 0,
        caffeine: randInt(1, 4, rand),
        kidsHours: isWeekend ? randFloat(2, 6, rand) : randFloat(0.5, 2, rand),
        generalNote: pick([
          "Good productive day",
          "Felt tired in the afternoon",
          "Great workout in the morning",
          "Stressful meeting at work",
          "Relaxing evening with family",
          "Slept poorly, low energy",
          "Very focused, deep work session",
          "Nice walk in the park",
          null,
          null,
        ], rand),
      },
    });
  }
  console.log(`    -> ${dates.length} daily_log entries created`);
}

// ---------------------------------------------------------------------------
// 3. Gym Workouts (~20 with exercises and sets)
// ---------------------------------------------------------------------------

const EXERCISE_CATALOG = [
  { name: "Bench Press", muscleGroup: "Chest", equipment: "Barbell", exerciseType: "compound" },
  { name: "Squat", muscleGroup: "Quadriceps", equipment: "Barbell", exerciseType: "compound" },
  { name: "Deadlift", muscleGroup: "Back", equipment: "Barbell", exerciseType: "compound" },
  { name: "Overhead Press", muscleGroup: "Shoulders", equipment: "Barbell", exerciseType: "compound" },
  { name: "Barbell Row", muscleGroup: "Back", equipment: "Barbell", exerciseType: "compound" },
  { name: "Pull-ups", muscleGroup: "Back", equipment: "Bodyweight", exerciseType: "compound" },
  { name: "Dumbbell Curl", muscleGroup: "Biceps", equipment: "Dumbbell", exerciseType: "isolation" },
  { name: "Tricep Pushdown", muscleGroup: "Triceps", equipment: "Cable", exerciseType: "isolation" },
  { name: "Lateral Raise", muscleGroup: "Shoulders", equipment: "Dumbbell", exerciseType: "isolation" },
  { name: "Leg Press", muscleGroup: "Quadriceps", equipment: "Machine", exerciseType: "compound" },
  { name: "Romanian Deadlift", muscleGroup: "Hamstrings", equipment: "Barbell", exerciseType: "compound" },
  { name: "Cable Fly", muscleGroup: "Chest", equipment: "Cable", exerciseType: "isolation" },
  { name: "Leg Curl", muscleGroup: "Hamstrings", equipment: "Machine", exerciseType: "isolation" },
  { name: "Face Pull", muscleGroup: "Shoulders", equipment: "Cable", exerciseType: "isolation" },
  { name: "Plank", muscleGroup: "Core", equipment: "Bodyweight", exerciseType: "isometric" },
];

const WORKOUT_TEMPLATES = [
  { name: "Push Day", exercises: ["Bench Press", "Overhead Press", "Cable Fly", "Lateral Raise", "Tricep Pushdown"] },
  { name: "Pull Day", exercises: ["Deadlift", "Barbell Row", "Pull-ups", "Dumbbell Curl", "Face Pull"] },
  { name: "Leg Day", exercises: ["Squat", "Leg Press", "Romanian Deadlift", "Leg Curl", "Plank"] },
  { name: "Upper Body", exercises: ["Bench Press", "Barbell Row", "Overhead Press", "Dumbbell Curl", "Tricep Pushdown"] },
];

async function seedGymWorkouts(userId: number) {
  const rand = seededRandom(202);

  // First, create exercises
  console.log(`  Seeding ${EXERCISE_CATALOG.length} gym exercises...`);
  const exerciseIdMap: Record<string, number> = {};

  for (const ex of EXERCISE_CATALOG) {
    const result = await prisma.gymExercise.upsert({
      where: { userId_name: { userId, name: ex.name } },
      update: {},
      create: {
        userId,
        name: ex.name,
        muscleGroup: ex.muscleGroup,
        equipment: ex.equipment,
        exerciseType: ex.exerciseType,
        level: "intermediate",
        isCustom: false,
      },
    });
    exerciseIdMap[ex.name] = result.id;
  }

  // Generate ~20 workouts spread across 3 months (~2 per week)
  const allDates = dateRange(START_DATE, END_DATE);
  const workoutDates: string[] = [];
  let skipCount = 0;
  for (const d of allDates) {
    if (skipCount > 0) { skipCount--; continue; }
    const dow = new Date(d).getDay();
    // Workout on Mon(1), Wed(3), Fri(5), sometimes Sat(6)
    if (dow === 1 || dow === 3 || dow === 5 || (dow === 6 && rand() > 0.6)) {
      workoutDates.push(d);
      skipCount = 1; // at least 1 rest day
    }
  }
  const finalDates = workoutDates.slice(0, 22); // cap at ~20-22

  console.log(`  Seeding ${finalDates.length} gym workouts...`);

  for (let i = 0; i < finalDates.length; i++) {
    const dateStr = finalDates[i];
    const template = WORKOUT_TEMPLATES[i % WORKOUT_TEMPLATES.length];
    const startHour = randInt(7, 18, rand);
    const durationMin = randInt(45, 75, rand);
    const endHour = startHour + Math.floor(durationMin / 60);
    const endMin = durationMin % 60;

    const workout = await prisma.gymWorkout.create({
      data: {
        userId,
        date: toDateOnly(dateStr),
        startTime: `${String(startHour).padStart(2, "0")}:00`,
        endTime: `${String(endHour).padStart(2, "0")}:${String(endMin).padStart(2, "0")}`,
        workoutName: template.name,
        programType: "PPL",
        durationMinutes: durationMin,
        calories: randInt(250, 500, rand),
        avgHr: randInt(110, 145, rand),
      },
    });

    // Add exercises with sets
    for (let exIdx = 0; exIdx < template.exercises.length; exIdx++) {
      const exName = template.exercises[exIdx];
      const exerciseId = exerciseIdMap[exName];
      if (!exerciseId) continue;

      const workoutExercise = await prisma.gymWorkoutExercise.create({
        data: {
          userId,
          workoutId: workout.id,
          exerciseId,
          orderNum: exIdx + 1,
        },
      });

      // 3-4 sets per exercise
      const numSets = randInt(3, 4, rand);
      const isBodyweight = EXERCISE_CATALOG.find(e => e.name === exName)?.equipment === "Bodyweight";
      const isIsometric = EXERCISE_CATALOG.find(e => e.name === exName)?.exerciseType === "isometric";

      for (let setIdx = 0; setIdx < numSets; setIdx++) {
        const isWarmup = setIdx === 0 && exIdx < 2; // first set of first 2 exercises is warmup
        let weightKg: number | null;
        let reps: number | null;

        if (isIsometric) {
          weightKg = null;
          reps = randInt(30, 60, rand); // seconds for plank
        } else if (isBodyweight) {
          weightKg = null;
          reps = randInt(6, 15, rand);
        } else {
          weightKg = isWarmup
            ? randFloat(20, 40, rand)
            : randFloat(40, 100, rand);
          reps = isWarmup
            ? randInt(10, 15, rand)
            : randInt(6, 12, rand);
        }

        await prisma.gymSet.create({
          data: {
            userId,
            workoutExerciseId: workoutExercise.id,
            setNum: setIdx + 1,
            weightKg,
            reps,
            isWarmup,
            isFailure: !isWarmup && setIdx === numSets - 1 && rand() > 0.6,
            restSeconds: isWarmup ? 60 : randInt(60, 180, rand),
            rpe: isWarmup ? null : randFloat(6, 9.5, rand),
            intensity: isWarmup ? "warmup" : pick(["normal", "normal", "hard"], rand),
          },
        });
      }
    }
  }
  console.log(`    -> ${finalDates.length} workouts with exercises and sets created`);
}

// ---------------------------------------------------------------------------
// 4. Garmin Daily (~30 entries)
// ---------------------------------------------------------------------------

async function seedGarminDaily(userId: number) {
  const rand = seededRandom(303);
  const allDates = dateRange(START_DATE, END_DATE);

  // Pick ~30 dates — mostly consecutive with some gaps
  const dates: string[] = [];
  for (const d of allDates) {
    if (rand() < 0.35) dates.push(d);
  }
  const finalDates = dates.slice(0, 35);

  console.log(`  Seeding ${finalDates.length} garmin_daily entries...`);

  for (const dateStr of finalDates) {
    const dow = new Date(dateStr).getDay();
    const isWeekend = dow === 0 || dow === 6;
    const baseSteps = isWeekend ? randInt(4000, 12000, rand) : randInt(6000, 14000, rand);

    await prisma.garminDaily.upsert({
      where: { userId_date: { userId, date: toDateOnly(dateStr) } },
      update: {},
      create: {
        userId,
        date: toDateOnly(dateStr),
        steps: baseSteps,
        caloriesTotal: randInt(1800, 2800, rand),
        caloriesActive: randInt(200, 700, rand),
        distanceM: round2(baseSteps * 0.75),
        floorsUp: randInt(3, 20, rand),
        floorsDown: randInt(2, 15, rand),
        intensityMinutes: randInt(0, 60, rand),
        restingHr: randInt(52, 68, rand),
        avgHr: randInt(60, 80, rand),
        maxHr: randInt(100, 170, rand),
        avgStress: randInt(20, 50, rand),
        maxStress: randInt(50, 85, rand),
        bodyBatteryHigh: randInt(70, 100, rand),
        bodyBatteryLow: randInt(10, 40, rand),
        sleepSeconds: randInt(21600, 32400, rand), // 6-9 hours
        sleepScore: randInt(55, 95, rand),
        spo2Avg: randFloat(95, 99, rand),
        respirationAvg: randFloat(14, 18, rand),
        hrvWeeklyAvg: randInt(35, 65, rand),
        hrvLastNight: randInt(30, 70, rand),
        hrvStatus: pick(["BALANCED", "BALANCED", "LOW", "UNBALANCED"], rand),
        trainingReadinessScore: randInt(30, 90, rand),
        trainingStatus: pick(["PRODUCTIVE", "MAINTAINING", "RECOVERY", "UNPRODUCTIVE"], rand),
        trainingLoad: randFloat(100, 600, rand),
        fitnessAge: randInt(25, 38, rand),
      },
    });
  }
  console.log(`    -> ${finalDates.length} garmin_daily entries created`);
}

// ---------------------------------------------------------------------------
// Cleanup helper
// ---------------------------------------------------------------------------

async function cleanupDemoData(userId: number) {
  console.log("  Cleaning up existing demo data...");

  // Order matters: child tables first
  await prisma.gymSet.deleteMany({ where: { userId } });
  await prisma.gymWorkoutExercise.deleteMany({ where: { userId } });
  await prisma.gymWorkout.deleteMany({ where: { userId } });
  await prisma.gymExercise.deleteMany({ where: { userId } });
  await prisma.transaction.deleteMany({ where: { userId } });
  await prisma.dailyLog.deleteMany({ where: { userId } });
  await prisma.garminDaily.deleteMany({ where: { userId } });

  console.log("    -> Cleanup complete");
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log("=== Seed Demo Data ===\n");
  console.log(`Date range: ${fmtDate(START_DATE)} to ${fmtDate(END_DATE)}\n`);

  // Upsert demo user
  const user = await prisma.user.upsert({
    where: { email: DEMO_EMAIL },
    update: { name: DEMO_NAME },
    create: { email: DEMO_EMAIL, name: DEMO_NAME, role: "owner" },
  });
  const userId = user.id;
  console.log(`Demo user: id=${userId}, email=${user.email}\n`);

  // Clean old demo data
  await cleanupDemoData(userId);

  // Seed all modules
  await seedTransactions(userId);
  await seedDailyLogs(userId);
  await seedGymWorkouts(userId);
  await seedGarminDaily(userId);

  console.log("\n=== Done! All demo data seeded. ===");
}

main()
  .catch((e) => {
    console.error("Seed failed:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
