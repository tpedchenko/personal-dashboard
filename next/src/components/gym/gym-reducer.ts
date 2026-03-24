import type { ExercisePR } from "@/actions/gym";
import type { PeriodPreset } from "@/components/ui/period-selector";
import type { GarminActivityItem, GymProgram, GymStats, GymSet, GymExercise, GymWorkout } from "@/types/gym";

// =========================================================================
// State
// =========================================================================

export type GymState = {
  // Core data
  workouts: GymWorkout[];
  exercises: GymExercise[];
  stats: GymStats;
  programs: GymProgram[];

  // Active workout
  activeWorkout: GymWorkout | null;
  activeTab: string;

  // Period selector
  periodPreset: PeriodPreset;
  customFrom: string;
  customTo: string;

  // History
  expandedWorkoutId: number | null;
  historyOpen: boolean;

  // Exercise picker (active workout)
  exercisePickerOpen: boolean;
  exerciseSearch: string;
  exerciseMuscleFilter: string;

  // Exercise library filters
  libSearch: string;
  libMuscleFilter: string;
  libShowFavoritesOnly: boolean;

  // Favorites
  favoriteIds: number[];

  // Garmin linking
  garminActivities: GarminActivityItem[];
  showGarminLink: boolean;
  justCompletedWorkoutId: number | null;

  // Programs
  expandedProgramId: number | null;

  // Set editing
  editingSetId: number | null;
  editWeight: string;
  editReps: string;
  editIntensity: string;

  // Workout editing
  editingWorkoutId: number | null;
  editWorkoutName: string;
  editWorkoutDate: string;

  // PR tracking
  prCache: Record<number, ExercisePR>;
  newPRs: Record<number, { weight: boolean; volume: boolean }>;

  // Start dialog
  startDialogOpen: boolean;
};

// =========================================================================
// Actions
// =========================================================================

export type GymAction =
  // Core data
  | { type: "SET_WORKOUTS"; workouts: GymWorkout[] }
  | { type: "SET_EXERCISES"; exercises: GymExercise[] }
  | { type: "SET_STATS"; stats: GymStats }
  | { type: "SET_PROGRAMS"; programs: GymProgram[] }

  // Active workout
  | { type: "SET_ACTIVE_WORKOUT"; workout: GymWorkout | null }
  | { type: "SET_ACTIVE_TAB"; tab: string }
  | { type: "UPDATE_ACTIVE_WORKOUT"; updater: (w: GymWorkout) => GymWorkout }
  | { type: "UPDATE_WORKOUT_BY_ID"; workoutId: number; updater: (w: GymWorkout) => GymWorkout }
  | { type: "UPDATE_ALL_WORKOUTS"; updater: (w: GymWorkout) => GymWorkout }

  // Period selector
  | { type: "SET_PERIOD_PRESET"; preset: PeriodPreset }
  | { type: "SET_CUSTOM_RANGE"; from: string; to: string }

  // History
  | { type: "SET_EXPANDED_WORKOUT_ID"; id: number | null }
  | { type: "TOGGLE_HISTORY_OPEN" }

  // Exercise picker
  | { type: "SET_EXERCISE_PICKER_OPEN"; open: boolean }
  | { type: "SET_EXERCISE_SEARCH"; search: string }
  | { type: "SET_EXERCISE_MUSCLE_FILTER"; filter: string }
  | { type: "CLOSE_EXERCISE_PICKER" }

  // Library filters
  | { type: "SET_LIB_SEARCH"; search: string }
  | { type: "SET_LIB_MUSCLE_FILTER"; filter: string }
  | { type: "SET_LIB_SHOW_FAVORITES_ONLY"; show: boolean }

  // Favorites
  | { type: "ADD_FAVORITE"; exerciseId: number }
  | { type: "REMOVE_FAVORITE"; exerciseId: number }

  // Garmin
  | { type: "SET_GARMIN_ACTIVITIES"; activities: GarminActivityItem[] }
  | { type: "SET_SHOW_GARMIN_LINK"; show: boolean }
  | { type: "SET_JUST_COMPLETED_WORKOUT_ID"; id: number | null }
  | { type: "CLOSE_GARMIN_LINK" }

  // Programs
  | { type: "SET_EXPANDED_PROGRAM_ID"; id: number | null }

  // Set editing
  | { type: "START_EDIT_SET"; set: GymSet }
  | { type: "SET_EDIT_WEIGHT"; weight: string }
  | { type: "SET_EDIT_REPS"; reps: string }
  | { type: "SET_EDIT_INTENSITY"; intensity: string }
  | { type: "CANCEL_EDIT_SET" }
  | { type: "FINISH_EDIT_SET" }

  // Workout editing
  | { type: "START_EDIT_WORKOUT"; workout: GymWorkout }
  | { type: "SET_EDIT_WORKOUT_NAME"; name: string }
  | { type: "SET_EDIT_WORKOUT_DATE"; date: string }
  | { type: "CANCEL_EDIT_WORKOUT" }
  | { type: "FINISH_EDIT_WORKOUT" }

  // PR tracking
  | { type: "SET_PR_CACHE"; exerciseId: number; pr: ExercisePR }
  | { type: "UPDATE_PR_CACHE"; exerciseId: number; updater: (pr: ExercisePR) => ExercisePR }
  | { type: "SET_NEW_PR"; setId: number; prs: { weight: boolean; volume: boolean } }
  | { type: "CLEAR_PRS" }

  // Start dialog
  | { type: "SET_START_DIALOG_OPEN"; open: boolean }

  // Batch: complete workout resets
  | { type: "COMPLETE_WORKOUT"; completedId: number }

  // Batch: start workout with active
  | { type: "START_WORKOUT"; workouts: GymWorkout[]; activeWorkout: GymWorkout }

  // Batch: refresh active workout from server
  | { type: "REFRESH_WORKOUTS"; workouts: GymWorkout[] };

// =========================================================================
// Reducer
// =========================================================================

export function gymReducer(state: GymState, action: GymAction): GymState {
  switch (action.type) {
    // Core data
    case "SET_WORKOUTS":
      return { ...state, workouts: action.workouts };
    case "SET_EXERCISES":
      return { ...state, exercises: action.exercises };
    case "SET_STATS":
      return { ...state, stats: action.stats };
    case "SET_PROGRAMS":
      return { ...state, programs: action.programs };

    // Active workout
    case "SET_ACTIVE_WORKOUT":
      return { ...state, activeWorkout: action.workout };
    case "SET_ACTIVE_TAB":
      return { ...state, activeTab: action.tab };
    case "UPDATE_ACTIVE_WORKOUT": {
      const activeWorkout = state.activeWorkout ? action.updater(state.activeWorkout) : null;
      const workouts = state.workouts.map((w) => (!w.endTime ? action.updater(w) : w));
      return { ...state, activeWorkout, workouts };
    }
    case "UPDATE_WORKOUT_BY_ID":
      return {
        ...state,
        workouts: state.workouts.map((w) =>
          w.id === action.workoutId ? action.updater(w) : w
        ),
      };
    case "UPDATE_ALL_WORKOUTS":
      return {
        ...state,
        workouts: state.workouts.map((w) => action.updater(w)),
      };

    // Period selector
    case "SET_PERIOD_PRESET":
      return { ...state, periodPreset: action.preset };
    case "SET_CUSTOM_RANGE":
      return { ...state, customFrom: action.from, customTo: action.to };

    // History
    case "SET_EXPANDED_WORKOUT_ID":
      return { ...state, expandedWorkoutId: action.id };
    case "TOGGLE_HISTORY_OPEN":
      return { ...state, historyOpen: !state.historyOpen };

    // Exercise picker
    case "SET_EXERCISE_PICKER_OPEN":
      return { ...state, exercisePickerOpen: action.open };
    case "SET_EXERCISE_SEARCH":
      return { ...state, exerciseSearch: action.search };
    case "SET_EXERCISE_MUSCLE_FILTER":
      return { ...state, exerciseMuscleFilter: action.filter };
    case "CLOSE_EXERCISE_PICKER":
      return {
        ...state,
        exercisePickerOpen: false,
        exerciseSearch: "",
        exerciseMuscleFilter: "",
      };

    // Library filters
    case "SET_LIB_SEARCH":
      return { ...state, libSearch: action.search };
    case "SET_LIB_MUSCLE_FILTER":
      return { ...state, libMuscleFilter: action.filter };
    case "SET_LIB_SHOW_FAVORITES_ONLY":
      return { ...state, libShowFavoritesOnly: action.show };

    // Favorites
    case "ADD_FAVORITE":
      return { ...state, favoriteIds: [...state.favoriteIds, action.exerciseId] };
    case "REMOVE_FAVORITE":
      return {
        ...state,
        favoriteIds: state.favoriteIds.filter((id) => id !== action.exerciseId),
      };

    // Garmin
    case "SET_GARMIN_ACTIVITIES":
      return { ...state, garminActivities: action.activities };
    case "SET_SHOW_GARMIN_LINK":
      return { ...state, showGarminLink: action.show };
    case "SET_JUST_COMPLETED_WORKOUT_ID":
      return { ...state, justCompletedWorkoutId: action.id };
    case "CLOSE_GARMIN_LINK":
      return { ...state, showGarminLink: false, justCompletedWorkoutId: null };

    // Programs
    case "SET_EXPANDED_PROGRAM_ID":
      return { ...state, expandedProgramId: action.id };

    // Set editing
    case "START_EDIT_SET":
      return {
        ...state,
        editingSetId: action.set.id,
        editWeight: action.set.weightKg?.toString() ?? "",
        editReps: action.set.reps?.toString() ?? "",
        editIntensity: action.set.intensity || "normal",
      };
    case "SET_EDIT_WEIGHT":
      return { ...state, editWeight: action.weight };
    case "SET_EDIT_REPS":
      return { ...state, editReps: action.reps };
    case "SET_EDIT_INTENSITY":
      return { ...state, editIntensity: action.intensity };
    case "CANCEL_EDIT_SET":
    case "FINISH_EDIT_SET":
      return { ...state, editingSetId: null };

    // Workout editing
    case "START_EDIT_WORKOUT":
      return {
        ...state,
        editingWorkoutId: action.workout.id,
        editWorkoutName: action.workout.workoutName ?? "",
        editWorkoutDate: action.workout.date,
      };
    case "SET_EDIT_WORKOUT_NAME":
      return { ...state, editWorkoutName: action.name };
    case "SET_EDIT_WORKOUT_DATE":
      return { ...state, editWorkoutDate: action.date };
    case "CANCEL_EDIT_WORKOUT":
    case "FINISH_EDIT_WORKOUT":
      return { ...state, editingWorkoutId: null };

    // PR tracking
    case "SET_PR_CACHE":
      return {
        ...state,
        prCache: { ...state.prCache, [action.exerciseId]: action.pr },
      };
    case "UPDATE_PR_CACHE":
      return {
        ...state,
        prCache: {
          ...state.prCache,
          [action.exerciseId]: action.updater(state.prCache[action.exerciseId]),
        },
      };
    case "SET_NEW_PR":
      return {
        ...state,
        newPRs: { ...state.newPRs, [action.setId]: action.prs },
      };
    case "CLEAR_PRS":
      return { ...state, newPRs: {}, prCache: {} };

    // Start dialog
    case "SET_START_DIALOG_OPEN":
      return { ...state, startDialogOpen: action.open };

    // Batch: complete workout
    case "COMPLETE_WORKOUT":
      return {
        ...state,
        activeWorkout: null,
        newPRs: {},
        prCache: {},
        justCompletedWorkoutId: action.completedId,
        showGarminLink: true,
        activeTab: "workouts",
      };

    // Batch: start workout
    case "START_WORKOUT":
      return {
        ...state,
        workouts: action.workouts,
        activeWorkout: action.activeWorkout,
        activeTab: "active",
      };

    // Batch: refresh workouts and derive active
    case "REFRESH_WORKOUTS": {
      const inProgress = action.workouts.find((w) => !w.endTime) ?? null;
      return {
        ...state,
        workouts: action.workouts,
        activeWorkout: inProgress,
        ...(inProgress ? { activeTab: "active" as const } : {}),
      };
    }

    default:
      return state;
  }
}

// =========================================================================
// Initial state factory
// =========================================================================

export function createInitialState(props: {
  initialWorkouts: GymWorkout[];
  initialExercises: GymExercise[];
  initialStats: GymStats;
  initialPrograms: GymProgram[];
  initialFavoriteIds: number[];
  initialGarminActivities: GarminActivityItem[];
}): GymState {
  const inProgress = props.initialWorkouts.find((w) => !w.endTime) ?? null;
  return {
    workouts: props.initialWorkouts,
    exercises: props.initialExercises,
    stats: props.initialStats,
    programs: props.initialPrograms,
    activeWorkout: inProgress,
    activeTab: inProgress ? "active" : "workouts",
    periodPreset: "this_month",
    customFrom: "",
    customTo: "",
    expandedWorkoutId: null,
    historyOpen: false,
    exercisePickerOpen: false,
    exerciseSearch: "",
    exerciseMuscleFilter: "",
    libSearch: "",
    libMuscleFilter: "",
    libShowFavoritesOnly: false,
    favoriteIds: props.initialFavoriteIds,
    garminActivities: props.initialGarminActivities,
    showGarminLink: false,
    justCompletedWorkoutId: null,
    expandedProgramId: null,
    editingSetId: null,
    editWeight: "",
    editReps: "",
    editIntensity: "normal",
    editingWorkoutId: null,
    editWorkoutName: "",
    editWorkoutDate: "",
    prCache: {},
    newPRs: {},
    startDialogOpen: false,
  };
}
