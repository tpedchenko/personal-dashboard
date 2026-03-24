"use client";

import { useTranslations } from "next-intl";
import { Card, CardContent } from "@/components/ui/card";
import { WorkoutCard } from "./workout-card";

import type { GymSet, GymExercise, GymWorkout } from "@/types/gym";

export interface WorkoutHistoryProps {
  workouts: GymWorkout[];
  exercises: GymExercise[];
  favoriteIds: number[];
  expandedWorkoutId: number | null;
  onToggleExpand: (workoutId: number) => void;
  isPending: boolean;
  // Edit workout
  editingWorkoutId: number | null;
  editWorkoutName: string;
  editWorkoutDate: string;
  onStartEditWorkout: (workout: GymWorkout) => void;
  onEditWorkoutNameChange: (value: string) => void;
  onEditWorkoutDateChange: (value: string) => void;
  onSaveWorkout: (workoutId: number) => void;
  onCancelEditWorkout: () => void;
  // Edit set
  editingSetId: number | null;
  editWeight: string;
  editReps: string;
  editIntensity: string;
  onEditSet: (set: GymSet) => void;
  onEditWeightChange: (value: string) => void;
  onEditRepsChange: (value: string) => void;
  onEditIntensityChange: (value: string) => void;
  onSaveSet: (setId: number, exerciseId: number) => void;
  onCancelEditSet: () => void;
  onDeleteSet: (setId: number) => void;
  // Exercise operations
  onRemoveExercise: (workoutExerciseId: number) => void;
  onAddExerciseToWorkout: (workoutId: number, exerciseId: number, currentCount: number) => void;
  onAddDefaultExerciseToWorkout?: (workoutId: number, exerciseCount: number, exerciseName: string) => void;
  onAddSetToHistory: (workoutExerciseId: number, currentSetCount: number) => void;
  onDeleteWorkout: (workoutId: number) => void;
}

export function WorkoutHistory({
  workouts,
  exercises,
  favoriteIds,
  expandedWorkoutId,
  onToggleExpand,
  isPending,
  editingWorkoutId,
  editWorkoutName,
  editWorkoutDate,
  onStartEditWorkout,
  onEditWorkoutNameChange,
  onEditWorkoutDateChange,
  onSaveWorkout,
  onCancelEditWorkout,
  editingSetId,
  editWeight,
  editReps,
  editIntensity,
  onEditSet,
  onEditWeightChange,
  onEditRepsChange,
  onEditIntensityChange,
  onSaveSet,
  onCancelEditSet,
  onDeleteSet,
  onRemoveExercise,
  onAddExerciseToWorkout,
  onAddDefaultExerciseToWorkout,
  onAddSetToHistory,
  onDeleteWorkout,
}: WorkoutHistoryProps) {
  const t = useTranslations("gym");

  if (workouts.length === 0) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-muted-foreground">
          {t("no_workouts")}
          <br />
          {t("start_session")}
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {workouts.map((workout) => (
        <WorkoutCard
          key={workout.id}
          workout={workout}
          exercises={exercises}
          favoriteIds={favoriteIds}
          isExpanded={expandedWorkoutId === workout.id}
          onToggleExpand={onToggleExpand}
          isPending={isPending}
          editingWorkoutId={editingWorkoutId}
          editWorkoutName={editWorkoutName}
          editWorkoutDate={editWorkoutDate}
          onStartEditWorkout={onStartEditWorkout}
          onEditWorkoutNameChange={onEditWorkoutNameChange}
          onEditWorkoutDateChange={onEditWorkoutDateChange}
          onSaveWorkout={onSaveWorkout}
          onCancelEditWorkout={onCancelEditWorkout}
          editingSetId={editingSetId}
          editWeight={editWeight}
          editReps={editReps}
          editIntensity={editIntensity}
          onEditSet={onEditSet}
          onEditWeightChange={onEditWeightChange}
          onEditRepsChange={onEditRepsChange}
          onEditIntensityChange={onEditIntensityChange}
          onSaveSet={onSaveSet}
          onCancelEditSet={onCancelEditSet}
          onDeleteSet={onDeleteSet}
          onRemoveExercise={onRemoveExercise}
          onAddExerciseToWorkout={onAddExerciseToWorkout}
          onAddDefaultExerciseToWorkout={onAddDefaultExerciseToWorkout}
          onAddSetToHistory={onAddSetToHistory}
          onDeleteWorkout={onDeleteWorkout}
        />
      ))}
    </div>
  );
}
