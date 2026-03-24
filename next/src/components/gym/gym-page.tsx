"use client";

import { useReducer, useTransition, useCallback, useEffect, useMemo } from "react";
import { useTranslations } from "next-intl";
import { ChevronDownIcon } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { todayString } from "@/lib/date-utils";
import {
  getWorkouts,
  createWorkout,
  completeWorkout,
  deleteWorkout,
  addExerciseToWorkout,
  removeExerciseFromWorkout,
  addSet,
  updateSet,
  deleteSet,
  getExercises,
  getGymStats,
  getExercisePRs,
  toggleFavoriteExercise,
  getRecentGarminActivities,
  linkGarminActivity,
  unlinkGarminActivity,
  getLastSetsForExercise,
  startWorkoutFromTemplate,
  updateWorkout,
  addDefaultExercise,
} from "@/actions/gym";
import type { CalendarDayData } from "@/actions/gym";
import { RecoveryChips, type MuscleRecoveryItem } from "./recovery-chips";
import { PeriodSelector, type PeriodPreset } from "@/components/ui/period-selector";
import { WorkoutRecommendation } from "./workout-recommendation";
import { WorkoutCalendar } from "./workout-calendar";
import { GarminActivityLinker } from "./garmin-activity-linker";
import { ErrorBoundary } from "@/components/shared/error-boundary";
import { StartWorkoutDialog } from "./start-workout-dialog";
import { WorkoutHistory } from "./workout-history";
import { ActiveWorkoutPanel } from "./active-workout-panel";
import { usePageShortcuts } from "@/hooks/use-keyboard-shortcuts";
import { useSessionTimer } from "./use-session-timer";
import { getWorkoutRecommendation } from "./gym-types";
import type { GarminActivityItem, GymProgram, GymStats, GymSet, GymExercise, GymWorkoutExercise, GymWorkout } from "@/types/gym";
import { gymReducer, createInitialState } from "./gym-reducer";

// =========================================================================
// Main GymPage Component
// =========================================================================

export function GymPage({
  initialWorkouts,
  initialExercises,
  initialStats,
  initialPrograms,
  initialMuscleRecovery,
  initialCalendarData,
  initialCalendarYear,
  initialCalendarMonth,
  initialFavoriteIds,
  initialGarminActivities,
}: {
  initialWorkouts: GymWorkout[];
  initialExercises: GymExercise[];
  initialStats: GymStats;
  initialPrograms: GymProgram[];
  initialMuscleRecovery: MuscleRecoveryItem[];
  initialCalendarData: CalendarDayData[];
  initialCalendarYear: number;
  initialCalendarMonth: number;
  initialFavoriteIds: number[];
  initialGarminActivities: GarminActivityItem[];
}) {
  const t = useTranslations("gym");
  const tc = useTranslations("common");

  const [state, dispatch] = useReducer(
    gymReducer,
    {
      initialWorkouts,
      initialExercises,
      initialStats,
      initialPrograms,
      initialFavoriteIds,
      initialGarminActivities,
    },
    createInitialState,
  );

  const [isPending, startTransition] = useTransition();

  const {
    workouts,
    exercises,
    stats,
    programs,
    activeWorkout,
    periodPreset,
    customFrom,
    customTo,
    expandedWorkoutId,
    historyOpen,
    exercisePickerOpen,
    exerciseSearch,
    exerciseMuscleFilter,
    favoriteIds,
    garminActivities,
    showGarminLink,
    justCompletedWorkoutId,
    editingSetId,
    editWeight,
    editReps,
    editIntensity,
    editingWorkoutId,
    editWorkoutName,
    editWorkoutDate,
    prCache,
    newPRs,
    startDialogOpen,
  } = state;

  // P3.1 — Session Timer
  const timer = useSessionTimer();

  // Auto-start timer when active workout exists
  useEffect(() => {
    if (activeWorkout && !timer.isRunning && timer.elapsedSeconds === 0) {
      timer.start();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeWorkout]);

  const handlePeriodChange = useCallback((preset: PeriodPreset, range: { dateFrom: string; dateTo: string }) => {
    dispatch({ type: "SET_PERIOD_PRESET", preset });
    startTransition(async () => {
      const s = await getGymStats({ from: range.dateFrom, to: range.dateTo });
      dispatch({ type: "SET_STATS", stats: s });
      const ws = await getWorkouts(20, range.dateFrom, range.dateTo);
      dispatch({ type: "SET_WORKOUTS", workouts: ws as GymWorkout[] });
    });
  }, []);

  const reloadWorkouts = useCallback(() => {
    startTransition(async () => {
      const ws = await getWorkouts(20);
      dispatch({ type: "REFRESH_WORKOUTS", workouts: ws as GymWorkout[] });
    });
  }, []);

  const reloadStats = useCallback(() => {
    startTransition(async () => {
      const s = await getGymStats({
        from: todayString().slice(0, 8) + "01",
        to: todayString(),
      });
      dispatch({ type: "SET_STATS", stats: s });
    });
  }, []);

  // P3.4 — Toggle favorite
  const handleToggleFavorite = (exerciseId: number) => {
    startTransition(async () => {
      const newState = await toggleFavoriteExercise(exerciseId);
      dispatch(
        newState
          ? { type: "ADD_FAVORITE", exerciseId }
          : { type: "REMOVE_FAVORITE", exerciseId }
      );
    });
  };

  // P3.5 — Garmin link handlers
  const handleLinkGarmin = (workoutId: number, garminActivityId: number) => {
    startTransition(async () => {
      await linkGarminActivity(workoutId, garminActivityId);
      dispatch({ type: "CLOSE_GARMIN_LINK" });
      reloadWorkouts();
    });
  };

  const handleUnlinkGarmin = (workoutId: number) => {
    startTransition(async () => {
      await unlinkGarminActivity(workoutId);
      reloadWorkouts();
    });
  };

  const handleRefreshGarminActivities = () => {
    startTransition(async () => {
      const activities = await getRecentGarminActivities();
      dispatch({ type: "SET_GARMIN_ACTIVITIES", activities: activities as GarminActivityItem[] });
    });
  };

  // Refresh active workout data from server (only for create/complete/delete)
  const refreshActiveWorkout = async () => {
    const full = await getWorkouts(20);
    dispatch({ type: "REFRESH_WORKOUTS", workouts: full as GymWorkout[] });
  };

  // Start a new workout
  const handleStartWorkout = () => {
    startTransition(async () => {
      const w = await createWorkout({ date: todayString() });
      const full = await getWorkouts(20);
      const active = (full as GymWorkout[]).find((wk) => wk.id === w.id);
      const fallback = (full as GymWorkout[]).find((wk) => !wk.endTime);
      dispatch({
        type: "START_WORKOUT",
        workouts: full as GymWorkout[],
        activeWorkout: (active ?? fallback) as GymWorkout,
      });
      timer.reset();
      timer.start();
    });
  };

  // Complete workout — uses timer duration
  const handleCompleteWorkout = () => {
    if (!activeWorkout) return;
    const duration = timer.durationMinutes;
    const completedId = activeWorkout.id;
    startTransition(async () => {
      await completeWorkout(completedId, duration);
      timer.stop();
      dispatch({ type: "COMPLETE_WORKOUT", completedId });
      handleRefreshGarminActivities();
      reloadWorkouts();
      reloadStats();
    });
  };

  // Delete workout
  const handleDeleteWorkout = (id: number) => {
    startTransition(async () => {
      await deleteWorkout(id);
      if (activeWorkout?.id === id) {
        dispatch({ type: "SET_ACTIVE_WORKOUT", workout: null });
        timer.stop();
        dispatch({ type: "SET_ACTIVE_TAB", tab: "workouts" });
      }
      reloadWorkouts();
      reloadStats();
    });
  };

  // Add exercise to active workout
  const handleAddExerciseToWorkout = (exerciseId: number) => {
    if (!activeWorkout) return;
    const orderNum = activeWorkout.exercises.length;
    startTransition(async () => {
      const we = await addExerciseToWorkout(activeWorkout.id, exerciseId, orderNum);
      const newExercise: GymWorkoutExercise = {
        id: we.id,
        workoutId: activeWorkout.id,
        exerciseId: we.exerciseId,
        orderNum: we.orderNum,
        notes: null,
        supersetGroup: null,
        exercise: we.exercise as GymExercise,
        sets: [],
      };
      dispatch({
        type: "UPDATE_ACTIVE_WORKOUT",
        updater: (w) => ({ ...w, exercises: [...w.exercises, newExercise] }),
      });
      dispatch({ type: "CLOSE_EXERCISE_PICKER" });

      // Preload PR data for this exercise
      try {
        const pr = await getExercisePRs(exerciseId);
        dispatch({ type: "SET_PR_CACHE", exerciseId, pr });
      } catch {
        // ignore
      }
    });
  };

  // Remove exercise from workout
  const handleRemoveExercise = (workoutExerciseId: number) => {
    startTransition(async () => {
      await removeExerciseFromWorkout(workoutExerciseId);
      dispatch({
        type: "UPDATE_ACTIVE_WORKOUT",
        updater: (w) => ({
          ...w,
          exercises: w.exercises.filter((e) => e.id !== workoutExerciseId),
        }),
      });
    });
  };

  // Add set
  const handleAddSet = (workoutExerciseId: number, existingSetsCount: number) => {
    startTransition(async () => {
      const newSet = await addSet(workoutExerciseId, {
        setNum: existingSetsCount + 1,
      });
      const gymSet: GymSet = {
        id: newSet.id,
        workoutExerciseId: newSet.workoutExerciseId,
        setNum: newSet.setNum,
        weightKg: newSet.weightKg as number | null,
        reps: newSet.reps as number | null,
        isWarmup: newSet.isWarmup,
        isFailure: newSet.isFailure,
        rpe: newSet.rpe as number | null,
        notes: null,
        intensity: newSet.intensity,
      };
      dispatch({
        type: "UPDATE_ACTIVE_WORKOUT",
        updater: (w) => ({
          ...w,
          exercises: w.exercises.map((e) =>
            e.id === workoutExerciseId
              ? { ...e, sets: [...e.sets, gymSet] }
              : e
          ),
        }),
      });
    });
  };

  // Start editing a set
  const handleEditSet = (set: GymSet) => {
    dispatch({ type: "START_EDIT_SET", set });
  };

  // Save set edit — with PR detection
  const handleSaveSet = (setId: number, exerciseId: number) => {
    startTransition(async () => {
      const weightVal = editWeight ? parseFloat(editWeight) : null;
      const repsVal = editReps ? parseInt(editReps) : null;

      await updateSet(setId, {
        weightKg: weightVal,
        reps: repsVal,
        intensity: editIntensity || "normal",
      });
      dispatch({ type: "FINISH_EDIT_SET" });

      // Check for PR
      if (weightVal && repsVal && prCache[exerciseId]) {
        const pr = prCache[exerciseId];
        const isWeightPR = pr.maxWeight !== null && weightVal > pr.maxWeight;
        const volume = weightVal * repsVal;
        const isVolumePR = pr.maxVolume !== null && volume > pr.maxVolume;
        if (isWeightPR || isVolumePR) {
          dispatch({
            type: "SET_NEW_PR",
            setId,
            prs: { weight: isWeightPR, volume: isVolumePR },
          });
          dispatch({
            type: "UPDATE_PR_CACHE",
            exerciseId,
            updater: (prev) => ({
              ...prev,
              maxWeight: isWeightPR ? weightVal : prev.maxWeight,
              maxWeightReps: isWeightPR ? repsVal : prev.maxWeightReps,
              maxVolume: isVolumePR ? volume : prev.maxVolume,
              maxVolumeWeight: isVolumePR ? weightVal : prev.maxVolumeWeight,
              maxVolumeReps: isVolumePR ? repsVal : prev.maxVolumeReps,
            }),
          });
        }
      }

      // Update set locally in both activeWorkout and workouts
      const updater = (w: GymWorkout) => ({
        ...w,
        exercises: w.exercises.map((e) => ({
          ...e,
          sets: e.sets.map((s) =>
            s.id === setId
              ? {
                  ...s,
                  weightKg: weightVal,
                  reps: repsVal,
                  intensity: editIntensity || "normal",
                  isWarmup: editIntensity === "warmup",
                  isFailure: editIntensity === "tech-fail" || editIntensity === "full-fail",
                }
              : s
          ),
        })),
      });
      if (activeWorkout) {
        dispatch({ type: "UPDATE_ACTIVE_WORKOUT", updater });
      } else {
        dispatch({ type: "UPDATE_ALL_WORKOUTS", updater });
      }
    });
  };

  // Delete set
  const handleDeleteSet = (setId: number) => {
    startTransition(async () => {
      await deleteSet(setId);
      const updater = (w: GymWorkout) => ({
        ...w,
        exercises: w.exercises.map((e) => ({
          ...e,
          sets: e.sets.filter((s) => s.id !== setId),
        })),
      });
      if (activeWorkout?.exercises.some((e) => e.sets.some((s) => s.id === setId))) {
        dispatch({ type: "UPDATE_ACTIVE_WORKOUT", updater });
      } else {
        dispatch({ type: "UPDATE_ALL_WORKOUTS", updater });
      }
    });
  };

  // Edit workout name/date
  const handleStartEditWorkout = (workout: GymWorkout) => {
    dispatch({ type: "START_EDIT_WORKOUT", workout });
  };

  const handleSaveWorkout = (workoutId: number) => {
    startTransition(async () => {
      await updateWorkout(workoutId, {
        workoutName: editWorkoutName || undefined,
        date: editWorkoutDate || undefined,
      });
      dispatch({ type: "FINISH_EDIT_WORKOUT" });
      dispatch({
        type: "UPDATE_WORKOUT_BY_ID",
        workoutId,
        updater: (w) => ({
          ...w,
          workoutName: editWorkoutName || w.workoutName,
          date: editWorkoutDate || w.date,
        }),
      });
    });
  };

  // Add exercise to completed workout
  const handleAddExerciseToHistoryWorkout = (workoutId: number, exerciseId: number, currentCount: number) => {
    startTransition(async () => {
      const we = await addExerciseToWorkout(workoutId, exerciseId, currentCount);
      const newExercise: GymWorkoutExercise = {
        id: we.id,
        workoutId,
        exerciseId: we.exerciseId,
        orderNum: we.orderNum,
        notes: null,
        supersetGroup: null,
        exercise: we.exercise as GymExercise,
        sets: [],
      };
      dispatch({
        type: "UPDATE_WORKOUT_BY_ID",
        workoutId,
        updater: (w) => ({ ...w, exercises: [...w.exercises, newExercise] }),
      });
    });
  };

  // Add default exercise to user's library, then add to active workout
  const handleAddDefaultExerciseToActive = (exerciseName: string) => {
    if (!activeWorkout) return;
    const orderNum = activeWorkout.exercises.length;
    startTransition(async () => {
      await addDefaultExercise(exerciseName);
      const ex = await getExercises();
      dispatch({ type: "SET_EXERCISES", exercises: ex as GymExercise[] });
      const added = (ex as GymExercise[]).find((e) => e.name === exerciseName);
      if (added) {
        const we = await addExerciseToWorkout(activeWorkout.id, added.id, orderNum);
        const newExercise: GymWorkoutExercise = {
          id: we.id,
          workoutId: activeWorkout.id,
          exerciseId: we.exerciseId,
          orderNum: we.orderNum,
          notes: null,
          supersetGroup: null,
          exercise: we.exercise as GymExercise,
          sets: [],
        };
        dispatch({
          type: "UPDATE_ACTIVE_WORKOUT",
          updater: (w) => ({ ...w, exercises: [...w.exercises, newExercise] }),
        });
      }
      dispatch({ type: "CLOSE_EXERCISE_PICKER" });
    });
  };

  // Add default exercise to user's library, then add to history workout
  const handleAddDefaultExerciseToHistory = (workoutId: number, exerciseCount: number, exerciseName: string) => {
    startTransition(async () => {
      await addDefaultExercise(exerciseName);
      const ex = await getExercises();
      dispatch({ type: "SET_EXERCISES", exercises: ex as GymExercise[] });
      const added = (ex as GymExercise[]).find((e) => e.name === exerciseName);
      if (added) {
        const we = await addExerciseToWorkout(workoutId, added.id, exerciseCount);
        const newExercise: GymWorkoutExercise = {
          id: we.id,
          workoutId,
          exerciseId: we.exerciseId,
          orderNum: we.orderNum,
          notes: null,
          supersetGroup: null,
          exercise: we.exercise as GymExercise,
          sets: [],
        };
        dispatch({
          type: "UPDATE_WORKOUT_BY_ID",
          workoutId,
          updater: (w) => ({ ...w, exercises: [...w.exercises, newExercise] }),
        });
      }
    });
  };

  // Remove exercise from completed workout
  const handleRemoveExerciseFromHistory = (workoutExerciseId: number) => {
    startTransition(async () => {
      await removeExerciseFromWorkout(workoutExerciseId);
      dispatch({
        type: "UPDATE_ALL_WORKOUTS",
        updater: (w) => ({
          ...w,
          exercises: w.exercises.filter((e) => e.id !== workoutExerciseId),
        }),
      });
    });
  };

  // Add set to completed workout exercise
  const handleAddSetToHistory = (workoutExerciseId: number, currentSetCount: number) => {
    startTransition(async () => {
      const newSet = await addSet(workoutExerciseId, { setNum: currentSetCount + 1 });
      const gymSet: GymSet = {
        id: newSet.id,
        workoutExerciseId: newSet.workoutExerciseId,
        setNum: newSet.setNum,
        weightKg: newSet.weightKg as number | null,
        reps: newSet.reps as number | null,
        isWarmup: newSet.isWarmup,
        isFailure: newSet.isFailure,
        rpe: newSet.rpe as number | null,
        notes: null,
        intensity: newSet.intensity,
      };
      dispatch({
        type: "UPDATE_ALL_WORKOUTS",
        updater: (w) => ({
          ...w,
          exercises: w.exercises.map((e) =>
            e.id === workoutExerciseId
              ? { ...e, sets: [...e.sets, gymSet] }
              : e
          ),
        }),
      });
    });
  };

  // Load previous sets for exercise
  const handleLoadPrevious = (workoutExerciseId: number, exerciseId: number) => {
    startTransition(async () => {
      const prevSets = await getLastSetsForExercise(exerciseId, activeWorkout?.id);
      if (prevSets.length === 0) return;
      const createdSets: GymSet[] = [];
      for (const ps of prevSets) {
        const newSet = await addSet(workoutExerciseId, {
          setNum: ps.setNum,
          weightKg: ps.weightKg ?? undefined,
          reps: ps.reps ?? undefined,
          rpe: ps.rpe ?? undefined,
        });
        createdSets.push({
          id: newSet.id,
          workoutExerciseId: newSet.workoutExerciseId,
          setNum: newSet.setNum,
          weightKg: newSet.weightKg as number | null,
          reps: newSet.reps as number | null,
          isWarmup: newSet.isWarmup,
          isFailure: newSet.isFailure,
          rpe: newSet.rpe as number | null,
          notes: null,
          intensity: newSet.intensity,
        });
      }
      dispatch({
        type: "UPDATE_ACTIVE_WORKOUT",
        updater: (w) => ({
          ...w,
          exercises: w.exercises.map((e) =>
            e.id === workoutExerciseId
              ? { ...e, sets: [...e.sets, ...createdSets] }
              : e
          ),
        }),
      });
    });
  };

  // Keyboard shortcuts: n → start new workout, Escape → close exercise picker
  usePageShortcuts(
    useMemo(
      () => ({
        n: () => {
          if (!activeWorkout) handleStartWorkout();
        },
        Escape: () => {
          if (exercisePickerOpen) dispatch({ type: "SET_EXERCISE_PICKER_OPEN", open: false });
          else if (showGarminLink) {
            dispatch({ type: "CLOSE_GARMIN_LINK" });
          }
        },
      }),
      // eslint-disable-next-line react-hooks/exhaustive-deps
      [activeWorkout, exercisePickerOpen, showGarminLink],
    ),
  );

  // Compute recommendation
  const recommendation = getWorkoutRecommendation(initialMuscleRecovery);

  // Find the best matching program day for the recommendation
  const recommendedDay = useMemo(() => {
    if (!recommendation || programs.length === 0) return null;
    const recMuscles = new Set(recommendation.split.muscles.map((m) => m.toLowerCase()));
    let bestDay: { dayId: number; dayName: string; focus: string | null; programName: string; overlap: number } | null = null;
    for (const prog of programs) {
      for (const day of prog.days) {
        if (day.focus) {
          const dayMuscles = day.focus.split(",").map((s) => s.trim().toLowerCase());
          const overlap = dayMuscles.filter((m) => recMuscles.has(m)).length;
          if (overlap > 0 && (!bestDay || overlap > bestDay.overlap)) {
            bestDay = { dayId: day.id, dayName: day.dayName, focus: day.focus, programName: prog.name, overlap };
          }
        }
      }
    }
    return bestDay;
  }, [recommendation, programs]);

  return (
    <div className="space-y-4">
      <h1 className="text-xl sm:text-2xl font-bold">{t("title")}</h1>

      <PeriodSelector
        value={periodPreset}
        onChange={handlePeriodChange}
        customFrom={customFrom}
        customTo={customTo}
        onCustomChange={(from, to) => {
          dispatch({ type: "SET_CUSTOM_RANGE", from, to });
        }}
      />

      {/* Muscle Recovery — always visible at top */}
      <ErrorBoundary moduleName="Muscle Recovery">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">{t("muscle_recovery")}</CardTitle>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
            <span className="flex items-center gap-1"><span className="inline-block w-2 h-2 rounded-full bg-red-500" /> {t("recovery_training")}</span>
            <span className="flex items-center gap-1"><span className="inline-block w-2 h-2 rounded-full bg-yellow-500" /> {t("recovery_recovering")}</span>
            <span className="flex items-center gap-1"><span className="inline-block w-2 h-2 rounded-full bg-green-400" /> {t("recovery_almost_ready")}</span>
            <span className="flex items-center gap-1"><span className="inline-block w-2 h-2 rounded-full bg-green-500" /> {t("recovery_recovered")}</span>
          </div>
        </CardHeader>
        <CardContent>
          <RecoveryChips muscleGroups={initialMuscleRecovery} />
        </CardContent>
      </Card>
      </ErrorBoundary>

          <div className="space-y-4">
            {/* P3.7 — Workout Recommendation with start buttons */}
            {!activeWorkout && (
            <ErrorBoundary moduleName="Workout Recommendation">
            <WorkoutRecommendation
              recommendation={recommendation}
              recommendedDayId={recommendedDay?.dayId ?? null}
              recommendedDayName={recommendedDay?.dayName ?? null}
              recommendedDayFocus={recommendedDay?.focus ?? null}
              recommendedProgramName={recommendedDay?.programName ?? null}
              isPending={isPending}
              onStartRecommended={recommendedDay ? () => {
                startTransition(async () => {
                  await startWorkoutFromTemplate(recommendedDay.dayId, todayString());
                  await refreshActiveWorkout();
                  timer.reset();
                  timer.start();
                });
              } : undefined}
              onOpenDialog={() => dispatch({ type: "SET_START_DIALOG_OPEN", open: true })}
            />
            </ErrorBoundary>
            )}

            {/* Workout Calendar under recommendation */}
            <ErrorBoundary moduleName="Workout Calendar">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">{t("calendar")}</CardTitle>
              </CardHeader>
              <CardContent>
                <WorkoutCalendar
                  initialData={initialCalendarData}
                  initialYear={initialCalendarYear}
                  initialMonth={initialCalendarMonth}
                />
              </CardContent>
            </Card>
            </ErrorBoundary>

            {/* P3.5 — Garmin Activity Link after completing workout */}
            {showGarminLink && justCompletedWorkoutId && (
              <GarminActivityLinker
                garminActivities={garminActivities}
                justCompletedWorkoutId={justCompletedWorkoutId}
                isPending={isPending}
                onLinkGarmin={handleLinkGarmin}
                onClose={() => dispatch({ type: "CLOSE_GARMIN_LINK" })}
              />
            )}

            <ErrorBoundary moduleName="Workout History">
            <Card>
              <CardHeader
                className="cursor-pointer select-none"
                onClick={() => dispatch({ type: "TOGGLE_HISTORY_OPEN" })}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <ChevronDownIcon className={`size-4 transition-transform ${historyOpen ? "rotate-180" : ""}`} />
                    <CardTitle className="text-sm">{t("workout_history")}</CardTitle>
                  </div>
                  <Badge variant="secondary">{workouts.length}</Badge>
                </div>
              </CardHeader>
              {historyOpen && <CardContent className="pt-0">
            <WorkoutHistory
              workouts={workouts}
              exercises={exercises}
              favoriteIds={favoriteIds}
              expandedWorkoutId={expandedWorkoutId}
              onToggleExpand={(id) => dispatch({ type: "SET_EXPANDED_WORKOUT_ID", id: expandedWorkoutId === id ? null : id })}
              isPending={isPending}
              editingWorkoutId={editingWorkoutId}
              editWorkoutName={editWorkoutName}
              editWorkoutDate={editWorkoutDate}
              onStartEditWorkout={handleStartEditWorkout}
              onEditWorkoutNameChange={(name) => dispatch({ type: "SET_EDIT_WORKOUT_NAME", name })}
              onEditWorkoutDateChange={(date) => dispatch({ type: "SET_EDIT_WORKOUT_DATE", date })}
              onSaveWorkout={handleSaveWorkout}
              onCancelEditWorkout={() => dispatch({ type: "CANCEL_EDIT_WORKOUT" })}
              editingSetId={editingSetId}
              editWeight={editWeight}
              editReps={editReps}
              editIntensity={editIntensity}
              onEditSet={handleEditSet}
              onEditWeightChange={(weight) => dispatch({ type: "SET_EDIT_WEIGHT", weight })}
              onEditRepsChange={(reps) => dispatch({ type: "SET_EDIT_REPS", reps })}
              onEditIntensityChange={(intensity) => dispatch({ type: "SET_EDIT_INTENSITY", intensity })}
              onSaveSet={handleSaveSet}
              onCancelEditSet={() => dispatch({ type: "CANCEL_EDIT_SET" })}
              onDeleteSet={handleDeleteSet}
              onRemoveExercise={handleRemoveExerciseFromHistory}
              onAddExerciseToWorkout={handleAddExerciseToHistoryWorkout}
              onAddDefaultExerciseToWorkout={handleAddDefaultExerciseToHistory}
              onAddSetToHistory={handleAddSetToHistory}
              onDeleteWorkout={handleDeleteWorkout}
            />
            </CardContent>}
            </Card>
            </ErrorBoundary>
          </div>
          {activeWorkout ? (
            <ErrorBoundary moduleName="Active Workout">
            <ActiveWorkoutPanel
              activeWorkout={activeWorkout}
              exercises={exercises}
              favoriteIds={favoriteIds}
              isPending={isPending}
              timer={timer}
              exercisePickerOpen={exercisePickerOpen}
              onExercisePickerOpenChange={(open: boolean) => dispatch({ type: "SET_EXERCISE_PICKER_OPEN", open })}
              exerciseSearch={exerciseSearch}
              onExerciseSearchChange={(search: string) => dispatch({ type: "SET_EXERCISE_SEARCH", search })}
              exerciseMuscleFilter={exerciseMuscleFilter}
              onExerciseMuscleFilterChange={(filter: string) => dispatch({ type: "SET_EXERCISE_MUSCLE_FILTER", filter })}
              editingSetId={editingSetId}
              editWeight={editWeight}
              editReps={editReps}
              editIntensity={editIntensity}
              onEditSet={handleEditSet}
              onEditWeightChange={(weight: string) => dispatch({ type: "SET_EDIT_WEIGHT", weight })}
              onEditRepsChange={(reps: string) => dispatch({ type: "SET_EDIT_REPS", reps })}
              onEditIntensityChange={(intensity: string) => dispatch({ type: "SET_EDIT_INTENSITY", intensity })}
              onSaveSet={handleSaveSet}
              onCancelEditSet={() => dispatch({ type: "CANCEL_EDIT_SET" })}
              onDeleteSet={handleDeleteSet}
              newPRs={newPRs}
              onCompleteWorkout={handleCompleteWorkout}
              onAddExercise={handleAddExerciseToWorkout}
              onAddDefaultExercise={handleAddDefaultExerciseToActive}
              onRemoveExercise={handleRemoveExercise}
              onAddSet={handleAddSet}
              onLoadPrevious={handleLoadPrevious}
            />
            </ErrorBoundary>
          ) : null}

      {/* FAB + Start Workout Dialog */}
      {!activeWorkout && (
        <StartWorkoutDialog
          programs={programs}
          recommendation={recommendation}
          isPending={isPending}
          open={startDialogOpen}
          onOpenChange={(open: boolean) => dispatch({ type: "SET_START_DIALOG_OPEN", open })}
          onStartFreeWorkout={() => {
            startTransition(async () => {
              await createWorkout({ date: todayString() });
              await refreshActiveWorkout();
              timer.reset();
              timer.start();
            });
          }}
          onStartFromTemplate={(dayId) => {
            startTransition(async () => {
              await startWorkoutFromTemplate(dayId, todayString());
              await refreshActiveWorkout();
              timer.reset();
              timer.start();
            });
          }}
        />
      )}
    </div>
  );
}
