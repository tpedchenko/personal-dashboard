import { z } from "zod";
import { ALL_INTENSITY_VALUES } from "@/components/gym/gym-constants";

export const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
export const positiveNumber = z.number().positive();
export const currencyCode = z.enum(["EUR", "UAH", "USD", "PLN", "GBP", "CZK"]);
export const transactionType = z.enum(["INCOME", "EXPENSE"]);

export const addTransactionSchema = z.object({
  date: dateSchema,
  type: transactionType,
  account: z.string().min(1),
  category: z.string().min(1),
  amountOriginal: positiveNumber,
  currencyOriginal: currencyCode.optional(),
  amountEur: positiveNumber,
  nbuRateEurUsed: z.number().optional(),
  description: z.string().max(500).optional(),
  owner: z.string().max(100).optional(),
});

export const updateTransactionSchema = z.object({
  date: dateSchema.optional(),
  type: z.string().min(1).optional(),
  account: z.string().min(1).optional(),
  category: z.string().min(1).optional(),
  amountOriginal: positiveNumber.optional(),
  currencyOriginal: currencyCode.optional(),
  amountEur: positiveNumber.optional(),
  description: z.string().max(500).optional(),
  owner: z.string().max(100).optional(),
});

export const periodSchema = z.object({
  dateFrom: dateSchema.optional(),
  dateTo: dateSchema.optional(),
});

export const saveDailyLogSchema = z.object({
  date: dateSchema,
  level: z.number().min(-5).max(5).optional(),
  moodDelta: z.number().min(-10).max(10).optional(),
  energyLevel: z.number().min(1).max(10).optional(),
  stressLevel: z.number().min(1).max(10).optional(),
  focusQuality: z.number().min(1).max(10).optional(),
  alcohol: z.number().min(0).optional(),
  caffeine: z.number().min(0).optional(),
  kidsHours: z.number().min(0).max(24).optional(),
  kidsNote: z.string().max(500).optional(),
  generalNote: z.string().max(2000).optional(),
  sexCount: z.number().min(0).optional(),
  bjCount: z.number().min(0).optional(),
});

export const userPreferenceSchema = z.object({
  key: z.string().min(1).max(100),
  value: z.string().max(5000),
});

export const importTransactionItemSchema = z.object({
  date: z.string().min(1),
  type: z.string().min(1),
  amount: z.number(),
  currency: z.string().optional(),
  category: z.string().optional(),
  description: z.string().optional(),
  account: z.string().optional(),
});

export const importTransactionsSchema = z.object({
  transactions: z.array(importTransactionItemSchema).min(1).max(10000),
  defaultAccount: z.string().optional(),
});

export const addTransferSchema = z.object({
  date: dateSchema,
  fromAccount: z.string().min(1),
  toAccount: z.string().min(1),
  fromAmount: positiveNumber,
  toAmount: positiveNumber,
  fromCurrency: currencyCode,
  toCurrency: currencyCode,
  fromEur: positiveNumber,
  toEur: positiveNumber,
  nbuRate: z.number().optional(),
  description: z.string().max(500).optional(),
});

export const getTransactionsSchema = z.object({
  dateFrom: dateSchema.optional(),
  dateTo: dateSchema.optional(),
  type: z.string().optional(),
  account: z.string().optional(),
  category: z.string().optional(),
  search: z.string().max(200).optional(),
  limit: z.number().int().min(1).max(500).optional(),
  offset: z.number().int().min(0).optional(),
});

// --- Gym ---

export const getWorkoutsSchema = z.object({
  limit: z.number().int().min(1).max(200).optional(),
  dateFrom: dateSchema.optional(),
  dateTo: dateSchema.optional(),
});

export const createWorkoutSchema = z.object({
  date: dateSchema,
  workoutName: z.string().max(200).optional(),
  programType: z.string().max(100).optional(),
});

export const completeWorkoutSchema = z.object({
  id: z.number().int().positive(),
  durationMinutes: z.number().int().min(0).max(600),
});

export const updateWorkoutSchema = z.object({
  id: z.number().int().positive(),
  data: z.object({
    workoutName: z.string().max(200).optional(),
    date: dateSchema.optional(),
  }),
});

export const addExerciseToWorkoutSchema = z.object({
  workoutId: z.number().int().positive(),
  exerciseId: z.number().int().positive(),
  orderNum: z.number().int().min(0),
});

export const addSetSchema = z.object({
  workoutExerciseId: z.number().int().positive(),
  data: z.object({
    setNum: z.number().int().min(1),
    weightKg: z.number().min(0).optional(),
    reps: z.number().int().min(0).optional(),
    rpe: z.number().min(0).max(10).optional(),
    isWarmup: z.boolean().optional(),
    intensity: z.enum(ALL_INTENSITY_VALUES).optional(),
  }),
});

export const updateSetSchema = z.object({
  setId: z.number().int().positive(),
  data: z.object({
    weightKg: z.number().min(0).nullable().optional(),
    reps: z.number().int().min(0).nullable().optional(),
    rpe: z.number().min(0).max(10).nullable().optional(),
    isWarmup: z.boolean().optional(),
    isFailure: z.boolean().optional(),
    intensity: z.enum(ALL_INTENSITY_VALUES).nullable().optional(),
  }),
});

export const createExerciseSchema = z.object({
  name: z.string().min(1).max(200),
  muscleGroup: z.string().min(1).max(100),
  equipment: z.string().min(1).max(100),
  secondaryMuscles: z.string().max(200).optional(),
  recoveryHours: z.number().int().min(0).max(336).optional(),
});

export const updateExerciseSchema = z.object({
  id: z.number().int().positive(),
  data: z.object({
    name: z.string().min(1).max(200).optional(),
    muscleGroup: z.string().min(1).max(100).optional(),
    equipment: z.string().min(1).max(100).optional(),
    secondaryMuscles: z.string().max(200).optional(),
    recoveryHours: z.number().int().min(0).max(336).optional(),
  }),
});

export const exerciseFilterSchema = z.object({
  muscleGroup: z.string().max(100).optional(),
  search: z.string().max(200).optional(),
});

// --- Food ---

export const addFoodEntrySchema = z.object({
  date: dateSchema,
  time: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  description: z.string().min(1).max(500),
  calories: z.number().min(0).optional(),
  proteinG: z.number().min(0).optional(),
  fatG: z.number().min(0).optional(),
  carbsG: z.number().min(0).optional(),
});

// --- Shopping ---

export const addQuickExpenseSchema = z.object({
  account: z.string().min(1).max(200),
  amount: positiveNumber,
  date: dateSchema,
  items: z.array(z.string().min(1).max(200)).min(1).max(100),
});

export const addShoppingItemSchema = z.object({
  itemName: z.string().min(1).max(500),
  quantity: z.string().max(50).optional(),
});

export const shoppingStatsSchema = z.object({
  from: dateSchema,
  to: dateSchema,
});
