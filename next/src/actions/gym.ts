// Re-export everything from the gym/ directory for backward compatibility
export {
  // workouts
  getWorkouts, getWorkout, createWorkout, completeWorkout, updateWorkout, deleteWorkout,
  // workout-exercises
  addExerciseToWorkout, removeExerciseFromWorkout, addSet, updateSet, deleteSet, getLastSetsForExercise,
  // exercises
  createExercise, updateExercise, deleteExercise, getCustomExercises, getExerciseUsageStats, getExercises, getExercise, getDefaultExercises, addDefaultExercise, DEFAULT_EXERCISES,
  // programs
  getPrograms, getProgram, createProgram, updateProgram, deleteProgram, addProgramDay, deleteProgramDay, addExerciseToProgram, addExerciseToProgramDay, updateProgramExercise, removeProgramExercise,
  // templates
  startWorkoutFromTemplate,
  // stats
  getGymStats, getMuscleRecovery,
  // performance
  getExercisePRs, checkSetPR,
  // favorites
  getFavoriteExerciseIds, toggleFavoriteExercise,
  // garmin
  getRecentGarminActivities, linkGarminActivity, unlinkGarminActivity, getWorkoutCalendar,
} from "./gym/index";

export type { ExercisePR, CalendarWorkoutDay, CalendarDayData } from "./gym/index";
