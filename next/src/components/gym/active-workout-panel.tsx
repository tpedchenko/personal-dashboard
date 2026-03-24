"use client";

import { useTranslations } from "next-intl";
import {
  PlusIcon,
  Trash2Icon,
  ClockIcon,
  CheckCircleIcon,
  PlayIcon,
  PauseIcon,
  SquareIcon,
  TrophyIcon,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ExercisePickerDialog } from "./exercise-picker-dialog";
import type { GymSet, GymExercise, GymWorkoutExercise, GymWorkout } from "@/types/gym";
import { INTENSITY_OPTIONS, INTENSITY_COLORS } from "./gym-constants";

// Inline ExercisePRInfo since it's only used here
import { useState, useCallback } from "react";
import { Separator } from "@/components/ui/separator";
import { getExercisePRs } from "@/actions/gym";
import type { ExercisePR } from "@/actions/gym";

function ExercisePRInfo({
  exerciseId,
  exerciseName,
}: {
  exerciseId: number;
  exerciseName: string;
}) {
  const t = useTranslations("gym");
  const [prData, setPrData] = useState<ExercisePR | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [loading, setLoading] = useState(false);

  const loadPRs = useCallback(async () => {
    if (prData) {
      setShowHistory(!showHistory);
      return;
    }
    setLoading(true);
    try {
      const data = await getExercisePRs(exerciseId);
      setPrData(data);
      setShowHistory(true);
    } finally {
      setLoading(false);
    }
  }, [exerciseId, prData, showHistory]);

  return (
    <div>
      <Button
        variant="ghost"
        size="xs"
        onClick={loadPRs}
        disabled={loading}
        className="text-xs text-muted-foreground"
      >
        <TrophyIcon className="size-3 mr-0.5" />
        {t("personal_records")}
      </Button>

      {showHistory && prData && (
        <div className="mt-2 p-2 bg-muted/50 rounded-md text-xs space-y-1.5">
          {prData.maxWeight !== null && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">{t("max_weight")}:</span>
              <span className="font-medium">
                {prData.maxWeight} {t("kg")} x {prData.maxWeightReps}
              </span>
            </div>
          )}
          {prData.maxVolume !== null && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">{t("best_volume")}:</span>
              <span className="font-medium">
                {prData.maxVolumeWeight} {t("kg")} x {prData.maxVolumeReps} = {prData.maxVolume} {t("kg")}
              </span>
            </div>
          )}
          {prData.recentSets.length > 0 && (
            <>
              <Separator className="my-1" />
              <p className="text-muted-foreground font-medium">{t("recent_history")}:</p>
              {prData.recentSets.map((s, i) => (
                <div key={i} className="flex justify-between text-muted-foreground">
                  <span>{s.date}</span>
                  <span>
                    {s.weightKg ?? "\u2014"} {t("kg")} x {s.reps ?? "\u2014"}
                  </span>
                </div>
              ))}
            </>
          )}
          {prData.recentSets.length === 0 && prData.maxWeight === null && (
            <p className="text-muted-foreground">{t("no_history")}</p>
          )}
        </div>
      )}
    </div>
  );
}

export interface ActiveWorkoutPanelProps {
  activeWorkout: GymWorkout;
  exercises: GymExercise[];
  favoriteIds: number[];
  isPending: boolean;
  // Timer
  timer: {
    display: string;
    isRunning: boolean;
    elapsedSeconds: number;
    start: () => void;
    pause: () => void;
    stop: () => void;
  };
  // Exercise picker
  exercisePickerOpen: boolean;
  onExercisePickerOpenChange: (open: boolean) => void;
  exerciseSearch: string;
  onExerciseSearchChange: (value: string) => void;
  exerciseMuscleFilter: string;
  onExerciseMuscleFilterChange: (value: string) => void;
  // Set editing
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
  // PR data
  newPRs: Record<number, { weight: boolean; volume: boolean }>;
  // Actions
  onCompleteWorkout: () => void;
  onAddExercise: (exerciseId: number) => void;
  onAddDefaultExercise?: (exerciseName: string) => void;
  onRemoveExercise: (workoutExerciseId: number) => void;
  onAddSet: (workoutExerciseId: number, existingSetsCount: number) => void;
  onLoadPrevious: (workoutExerciseId: number, exerciseId: number) => void;
}

export function ActiveWorkoutPanel({
  activeWorkout,
  exercises,
  favoriteIds,
  isPending,
  timer,
  exercisePickerOpen,
  onExercisePickerOpenChange,
  exerciseSearch,
  onExerciseSearchChange,
  exerciseMuscleFilter,
  onExerciseMuscleFilterChange,
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
  newPRs,
  onCompleteWorkout,
  onAddExercise,
  onAddDefaultExercise,
  onRemoveExercise,
  onAddSet,
  onLoadPrevious,
}: ActiveWorkoutPanelProps) {
  const t = useTranslations("gym");
  const tc = useTranslations("common");

  return (
    <div className="space-y-4">
      {/* Workout header with Timer */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>
                {activeWorkout.workoutName ?? t("active_workout")}
              </CardTitle>
              <p className="text-sm text-muted-foreground">
                {activeWorkout.date} | {activeWorkout.startTime}
              </p>
            </div>
            <Button
              onClick={onCompleteWorkout}
              disabled={isPending}
              data-testid="finish-workout-btn"
            >
              <CheckCircleIcon className="size-4 mr-1" />
              {t("finish_workout")}
            </Button>
          </div>

          {/* Session Timer */}
          <div className="flex items-center gap-3 mt-3 pt-3 border-t">
            <ClockIcon className="size-4 text-muted-foreground" />
            <span className="text-2xl font-mono font-bold tabular-nums">
              {timer.display}
            </span>
            <div className="flex gap-1.5 ml-auto">
              {!timer.isRunning ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={timer.start}
                >
                  <PlayIcon className="size-3.5 mr-1" />
                  {timer.elapsedSeconds > 0
                    ? t("resume_timer")
                    : t("start_timer")}
                </Button>
              ) : (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={timer.pause}
                >
                  <PauseIcon className="size-3.5 mr-1" />
                  {t("pause_timer")}
                </Button>
              )}
              {timer.elapsedSeconds > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={timer.stop}
                >
                  <SquareIcon className="size-3.5 mr-1" />
                  {t("stop_timer")}
                </Button>
              )}
            </div>
          </div>
        </CardHeader>
      </Card>

      {/* Exercises */}
      <div data-testid="exercise-list">
      {activeWorkout.exercises.map((we) => (
        <Card key={we.id}>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base">
                  {we.exercise.nameUa || we.exercise.name}
                </CardTitle>
                {we.exercise.muscleGroup && (
                  <Badge variant="secondary" className="mt-1">
                    {t(`muscle_groups.${we.exercise.muscleGroup}`) || we.exercise.muscleGroup}
                  </Badge>
                )}
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onRemoveExercise(we.id)}
                disabled={isPending}
              >
                <Trash2Icon className="size-3.5 text-destructive" />
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {we.sets.length > 0 && (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12">{t("set")}</TableHead>
                    <TableHead className="text-right">
                      {t("weight")} ({t("kg")})
                    </TableHead>
                    <TableHead className="text-right">
                      {t("reps")}
                    </TableHead>
                    <TableHead>{t("intensity")}</TableHead>
                    <TableHead className="w-20"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {we.sets.map((s) => (
                    <TableRow key={s.id}>
                      <TableCell>
                        {(s.intensity === "warmup" || s.isWarmup) ? "W" : s.setNum}
                      </TableCell>
                      {editingSetId === s.id ? (
                        <>
                          <TableCell className="text-right">
                            <Input
                              type="number"
                              value={editWeight}
                              onChange={(e) =>
                                onEditWeightChange(e.target.value)
                              }
                              className="w-16 ml-auto text-right"
                              placeholder={t("kg")}
                            />
                          </TableCell>
                          <TableCell className="text-right">
                            <Input
                              type="number"
                              value={editReps}
                              onChange={(e) =>
                                onEditRepsChange(e.target.value)
                              }
                              className="w-16 ml-auto text-right"
                              placeholder={t("reps")}
                            />
                          </TableCell>
                          <TableCell>
                            <Select value={editIntensity} onValueChange={(v) => v && onEditIntensityChange(v)}>
                              <SelectTrigger className="w-28 h-7 text-xs">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {INTENSITY_OPTIONS.map((opt) => (
                                  <SelectItem key={opt} value={opt}>
                                    <span className={INTENSITY_COLORS[opt]}>{opt}</span>
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </TableCell>
                          <TableCell>
                            <div className="flex gap-1">
                              <Button
                                size="xs"
                                onClick={() =>
                                  onSaveSet(s.id, we.exerciseId)
                                }
                                disabled={isPending}
                              >
                                {tc("save")}
                              </Button>
                              <Button
                                variant="ghost"
                                size="xs"
                                onClick={onCancelEditSet}
                              >
                                {tc("cancel")}
                              </Button>
                            </div>
                          </TableCell>
                        </>
                      ) : (
                        <>
                          <TableCell
                            className="text-right cursor-pointer"
                            onClick={() => onEditSet(s)}
                          >
                            {s.weightKg ?? "\u2014"}
                          </TableCell>
                          <TableCell
                            className="text-right cursor-pointer"
                            onClick={() => onEditSet(s)}
                          >
                            {s.reps ?? "\u2014"}
                            {newPRs[s.id] && (
                              <Badge
                                variant="default"
                                className="bg-yellow-500 text-black text-[10px] ml-1 animate-pulse"
                              >
                                <TrophyIcon className="size-3 mr-0.5" />
                                {newPRs[s.id].weight
                                  ? t("weight_pr")
                                  : t("volume_pr")}
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell
                            className={`cursor-pointer text-xs ${INTENSITY_COLORS[s.intensity || "normal"] || ""}`}
                            onClick={() => onEditSet(s)}
                          >
                            {s.intensity || "normal"}
                          </TableCell>
                          <TableCell>
                            <Button
                              variant="ghost"
                              size="xs"
                              onClick={() => onDeleteSet(s.id)}
                              disabled={isPending}
                            >
                              <Trash2Icon className="size-3 text-destructive" />
                            </Button>
                          </TableCell>
                        </>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
            <div className="flex items-center gap-2 mt-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => onAddSet(we.id, we.sets.length)}
                disabled={isPending}
              >
                <PlusIcon className="size-3.5 mr-1" />
                {t("add_set")}
              </Button>
              {we.sets.length === 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => onLoadPrevious(we.id, we.exerciseId)}
                  disabled={isPending}
                >
                  <ClockIcon className="size-3.5 mr-1" />
                  {t("load_previous")}
                </Button>
              )}
            </div>

            {/* Exercise PR info */}
            <div className="mt-2">
              <ExercisePRInfo
                exerciseId={we.exerciseId}
                exerciseName={we.exercise.nameUa || we.exercise.name}
              />
            </div>
          </CardContent>
        </Card>
      ))}
      </div>

      {/* Add exercise button */}
      <ExercisePickerDialog
        open={exercisePickerOpen}
        onOpenChange={onExercisePickerOpenChange}
        exercises={exercises}
        favoriteIds={favoriteIds}
        exerciseSearch={exerciseSearch}
        onExerciseSearchChange={onExerciseSearchChange}
        exerciseMuscleFilter={exerciseMuscleFilter}
        onExerciseMuscleFilterChange={onExerciseMuscleFilterChange}
        isPending={isPending}
        onSelectExercise={onAddExercise}
        onSelectDefaultExercise={onAddDefaultExercise}
      />
    </div>
  );
}
