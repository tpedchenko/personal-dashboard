"use client";

import { useTranslations } from "next-intl";
import {
  ArrowLeftIcon,
  FlagIcon,
  PlusIcon,
  Trash2Icon,
  ClockIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { GymWorkout } from "@/types/gym";

export type WorkoutScreen =
  | { type: "list" }
  | { type: "muscle-picker" }
  | { type: "muscle-exercises"; group: string }
  | { type: "exercise"; workoutExerciseId: number; exerciseId: number };

interface ActiveWorkoutScreenProps {
  activeWorkout: GymWorkout;
  timer: {
    display: string;
    isRunning: boolean;
    elapsedSeconds: number;
    start: () => void;
    pause: () => void;
    stop: () => void;
  };
  isPending: boolean;
  screen: WorkoutScreen;
  onScreenChange: (screen: WorkoutScreen) => void;
  onCompleteWorkout: () => void;
  onRemoveExercise: (workoutExerciseId: number) => void;
  onClose: () => void;
  // Slots for sub-screens rendered by parent
  children?: React.ReactNode;
}

export function ActiveWorkoutScreen({
  activeWorkout,
  timer,
  isPending,
  screen,
  onScreenChange,
  onCompleteWorkout,
  onRemoveExercise,
  onClose,
  children,
}: ActiveWorkoutScreenProps) {
  const t = useTranslations("gym");

  // Sub-screens (muscle-picker, muscle-exercises, exercise) are rendered via children
  if (screen.type !== "list") {
    return (
      <div className="fixed inset-0 z-50 bg-background flex flex-col overflow-hidden">
        {/* Top bar for sub-screens */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-background">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => onScreenChange({ type: "list" })}
          >
            <ArrowLeftIcon className="size-5" />
          </Button>
          <span className="font-mono text-lg font-semibold tabular-nums">
            {timer.display}
          </span>
          <div className="size-10" /> {/* Spacer for alignment */}
        </div>
        <div className="flex-1 overflow-y-auto">
          {children}
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 bg-background flex flex-col overflow-hidden">
      {/* Top bar */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-background">
        <Button
          variant="ghost"
          size="icon"
          onClick={onClose}
        >
          <ArrowLeftIcon className="size-5" />
        </Button>

        <div className="flex items-center gap-2">
          <ClockIcon className="size-4 text-muted-foreground" />
          <span className="font-mono text-lg font-semibold tabular-nums">
            {timer.display}
          </span>
        </div>

        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => onScreenChange({ type: "muscle-picker" })}
          >
            <PlusIcon className="size-5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={onCompleteWorkout}
            disabled={isPending}
          >
            <FlagIcon className="size-5" />
          </Button>
        </div>
      </div>

      {/* Workout name */}
      <div className="px-4 py-2 border-b border-border/50">
        <h2 className="text-base font-semibold">
          {activeWorkout.workoutName ?? t("active_workout")}
        </h2>
        <p className="text-xs text-muted-foreground">
          {activeWorkout.date} | {activeWorkout.startTime}
        </p>
      </div>

      {/* Exercise list */}
      <div className="flex-1 overflow-y-auto">
        {activeWorkout.exercises.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-3 px-4">
            <p className="text-sm">{t("no_exercises_yet")}</p>
            <Button
              variant="outline"
              onClick={() => onScreenChange({ type: "muscle-picker" })}
            >
              <PlusIcon className="size-4 mr-2" />
              {t("add_exercise")}
            </Button>
          </div>
        )}

        <div className="divide-y divide-border">
          {activeWorkout.exercises.map((we) => {
            const hasSets = we.sets.length > 0;
            const setsSummary = we.sets
              .map((s) => {
                const w = s.weightKg != null ? s.weightKg : "—";
                const r = s.reps != null ? s.reps : "—";
                return `${w}x${r}`;
              })
              .join(", ");

            return (
              <button
                key={we.id}
                className="w-full px-4 py-3 flex items-center gap-3 text-left active:bg-muted/50 transition-colors"
                onClick={() =>
                  onScreenChange({
                    type: "exercise",
                    workoutExerciseId: we.id,
                    exerciseId: we.exerciseId,
                  })
                }
              >
                <div className="flex-1 min-w-0">
                  <p className={`text-sm font-medium truncate ${hasSets ? "text-muted-foreground" : ""}`}>
                    {we.exercise.nameUa || we.exercise.name}
                  </p>
                  {we.exercise.muscleGroup && (
                    <Badge variant="secondary" className="mt-0.5 text-[10px]">
                      {t(`muscle_groups.${we.exercise.muscleGroup}`) || we.exercise.muscleGroup}
                    </Badge>
                  )}
                  {hasSets && (
                    <p className="text-xs text-muted-foreground mt-1 truncate">
                      {setsSummary}
                    </p>
                  )}
                  {!hasSets && (
                    <p className="text-xs text-primary mt-1">
                      {t("tap_to_start")}
                    </p>
                  )}
                </div>

                <div className="flex items-center gap-1 shrink-0">
                  {hasSets && (
                    <Badge variant="outline" className="text-xs tabular-nums">
                      {we.sets.length}
                    </Badge>
                  )}
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-8"
                    onClick={(e) => {
                      e.stopPropagation();
                      onRemoveExercise(we.id);
                    }}
                    disabled={isPending}
                  >
                    <Trash2Icon className="size-3.5 text-destructive" />
                  </Button>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Bottom: add exercise button */}
      {activeWorkout.exercises.length > 0 && (
        <div className="px-4 py-3 border-t border-border bg-background">
          <Button
            variant="outline"
            className="w-full"
            onClick={() => onScreenChange({ type: "muscle-picker" })}
          >
            <PlusIcon className="size-4 mr-2" />
            {t("add_exercise")}
          </Button>
        </div>
      )}
    </div>
  );
}
