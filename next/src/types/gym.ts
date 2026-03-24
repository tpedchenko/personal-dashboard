// Shared Gym types — single source of truth
// Derived from Prisma models: GymSet, GymExercise, GymWorkoutExercise, GymWorkout

export type GymSet = {
  id: number;
  workoutExerciseId: number;
  setNum: number;
  weightKg: number | null;
  reps: number | null;
  isWarmup: boolean | null;
  isFailure: boolean | null;
  rpe: number | null;
  notes: string | null;
  intensity: string | null;
};

export type GymExercise = {
  id: number;
  name: string;
  nameUa: string | null;
  muscleGroup: string | null;
  equipment: string | null;
  exerciseType?: string | null;
  level?: string | null;
  description?: string | null;
  isCustom?: boolean | null;
  secondaryMuscles: string | null;
  forceType?: string | null;
  recoveryHours?: number | null;
  isFavourite?: number | boolean | null;
};

export type GymWorkoutExercise = {
  id: number;
  workoutId: number;
  exerciseId: number;
  orderNum: number | null;
  notes: string | null;
  supersetGroup: number | null;
  exercise: GymExercise;
  sets: GymSet[];
};

export type GymWorkout = {
  id: number;
  date: string;
  startTime: string | null;
  endTime: string | null;
  programType: string | null;
  workoutName: string | null;
  notes: string | null;
  durationMinutes: number | null;
  garminActivityId: number | null;
  exercises: GymWorkoutExercise[];
};

export type GarminActivityItem = {
  activityId: number;
  date: string;
  activityType: string | null;
  activityName: string | null;
  durationSeconds: number | null;
  calories: number | null;
  avgHr: number | null;
};

export type GymProgramExercise = {
  id: number;
  orderNum: number | null;
  targetSets: number | null;
  targetReps: string | null;
  exercise: GymExercise;
};

export type GymProgramDay = {
  id: number;
  dayNum: number;
  dayName: string;
  focus: string | null;
  exercises: GymProgramExercise[];
};

export type GymProgram = {
  id: number;
  name: string;
  description: string | null;
  programType: string | null;
  daysPerWeek: number | null;
  days: GymProgramDay[];
};

export type GymStats = {
  totalWorkouts: number;
  totalVolume: number;
  sessionsPerWeek: number;
  muscleGroupDistribution: { group: string; volume: number }[];
};

export type SplitRecommendation = {
  name: string;
  nameKey: string;
  muscles: string[];
};
