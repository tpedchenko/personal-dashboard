"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import {
  PlusIcon,
  Trash2Icon,
  ClockIcon,
  ChevronDownIcon,
  PencilIcon,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ExercisePickerDialog } from "./exercise-picker-dialog";
import { SetEditFormMobile, SetEditFormDesktopCells } from "./set-edit-form";
import { INTENSITY_COLORS } from "./gym-constants";

import type { GymSet, GymExercise, GymWorkout } from "@/types/gym";

export interface WorkoutCardProps {
  workout: GymWorkout;
  exercises: GymExercise[];
  favoriteIds: number[];
  isExpanded: boolean;
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

function getSetLabel(s: { intensity: string | null; isWarmup: boolean | null; setNum: number }): string {
  return (s.intensity === "warmup" || s.isWarmup) ? "W" : `#${s.setNum}`;
}

export function WorkoutCard({
  workout,
  exercises,
  favoriteIds,
  isExpanded,
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
}: WorkoutCardProps) {
  const t = useTranslations("gym");
  const tc = useTranslations("common");

  // Exercise picker state
  const [pickerOpen, setPickerOpen] = useState(false);
  const [exerciseSearch, setExerciseSearch] = useState("");
  const [muscleFilter, setMuscleFilter] = useState("");

  const resetPicker = () => {
    setPickerOpen(false);
    setExerciseSearch("");
    setMuscleFilter("");
  };

  return (
    <Card>
      <CardHeader
        className="cursor-pointer select-none"
        onClick={() => onToggleExpand(workout.id)}
      >
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-3 min-w-0">
            <div className="min-w-0">
              <CardTitle className="text-base truncate">
                {workout.workoutName ?? workout.programType ?? workout.date}
              </CardTitle>
              <p className="text-xs text-muted-foreground mt-0.5">
                {workout.date}
                {workout.startTime && ` | ${workout.startTime}`}
                {workout.endTime && ` - ${workout.endTime}`}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            {workout.durationMinutes && (
              <Badge variant="secondary" className="tabular-nums">
                <ClockIcon className="size-3 mr-0.5" />
                {workout.durationMinutes}{t("min")}
              </Badge>
            )}
            <Badge variant="outline" className="tabular-nums">
              {workout.exercises.length} {t("exercises").toLowerCase()}
            </Badge>
            {!workout.endTime && (
              <Badge variant="default" className="bg-green-500/90 text-white">
                {t("active_workout")}
              </Badge>
            )}
            <ChevronDownIcon className={`size-4 text-muted-foreground transition-transform duration-200 ${isExpanded ? "rotate-180" : ""}`} />
          </div>
        </div>
      </CardHeader>

      {isExpanded && (
        <CardContent>
          <Separator className="mb-4" />

          {/* Edit workout name/date */}
          {editingWorkoutId === workout.id ? (
            <div className="flex flex-wrap gap-2 mb-4 items-end">
              <div>
                <label className="text-xs text-muted-foreground">{tc("name")}</label>
                <Input
                  value={editWorkoutName}
                  onChange={(e) => onEditWorkoutNameChange(e.target.value)}
                  className="w-40 h-8"
                  placeholder={t("workout_name")}
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">{tc("date")}</label>
                <Input
                  type="date"
                  value={editWorkoutDate}
                  onChange={(e) => onEditWorkoutDateChange(e.target.value)}
                  className="w-36 h-8"
                />
              </div>
              <Button size="xs" onClick={() => onSaveWorkout(workout.id)} disabled={isPending}>
                {tc("save")}
              </Button>
              <Button variant="ghost" size="xs" onClick={onCancelEditWorkout}>
                {tc("cancel")}
              </Button>
            </div>
          ) : (
            <div className="mb-4">
              <Button
                variant="ghost"
                size="xs"
                onClick={() => onStartEditWorkout(workout)}
              >
                <PencilIcon className="size-3 mr-1" />
                {t("edit_workout")}
              </Button>
            </div>
          )}

          {workout.exercises.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              {tc("no_data")}
            </p>
          ) : (
            <div className="space-y-4">
              {workout.exercises.map((we) => (
                <div key={we.id}>
                  <div className="flex items-center justify-between mb-2">
                    <div>
                      <span className="font-medium">
                        {we.exercise.nameUa || we.exercise.name}
                      </span>
                      {we.exercise.muscleGroup && (
                        <Badge
                          variant="secondary"
                          className="ml-2"
                        >
                          {t(`muscle_groups.${we.exercise.muscleGroup}`) || we.exercise.muscleGroup}
                        </Badge>
                      )}
                    </div>
                    <Button
                      variant="ghost"
                      size="xs"
                      onClick={() => onRemoveExercise(we.id)}
                      disabled={isPending}
                    >
                      <Trash2Icon className="size-3 text-destructive" />
                    </Button>
                  </div>

                  {/* Mobile card view for sets */}
                  <div className="sm:hidden space-y-1.5">
                    {we.sets.map((s) => {
                      const label = getSetLabel(s);
                      return editingSetId === s.id ? (
                        <SetEditFormMobile
                          key={s.id}
                          setLabel={label}
                          editWeight={editWeight}
                          editReps={editReps}
                          editIntensity={editIntensity}
                          onEditWeightChange={onEditWeightChange}
                          onEditRepsChange={onEditRepsChange}
                          onEditIntensityChange={onEditIntensityChange}
                          onSave={() => onSaveSet(s.id, we.exerciseId)}
                          onCancel={onCancelEditSet}
                          isPending={isPending}
                        />
                      ) : (
                        <div key={s.id} className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm">
                          <span className="text-muted-foreground w-6 text-center">
                            {label}
                          </span>
                          <div className="flex-1 flex items-center gap-3">
                            <span className="font-medium tabular-nums">{s.weightKg ?? "\u2014"} kg</span>
                            <span className="text-muted-foreground">{"\u00d7"}</span>
                            <span className="font-medium tabular-nums">{s.reps ?? "\u2014"}</span>
                          </div>
                          {s.intensity && (
                            <span className={`text-xs ${INTENSITY_COLORS[s.intensity] ?? ""}`}>
                              {s.intensity}
                            </span>
                          )}
                          <div className="flex gap-0.5">
                            <Button
                              variant="ghost"
                              size="xs"
                              onClick={() => onEditSet(s)}
                            >
                              <PencilIcon className="size-3" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="xs"
                              onClick={() => onDeleteSet(s.id)}
                              disabled={isPending}
                            >
                              <Trash2Icon className="size-3 text-destructive" />
                            </Button>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Desktop table view for sets */}
                  <div className="hidden sm:block">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-12">
                            {t("set")}
                          </TableHead>
                          <TableHead className="text-right">
                            {t("weight")} ({t("kg")})
                          </TableHead>
                          <TableHead className="text-right">
                            {t("reps")}
                          </TableHead>
                          <TableHead>
                            {t("intensity")}
                          </TableHead>
                          <TableHead className="w-16"></TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {we.sets.map((s) => (
                          <TableRow key={s.id}>
                            <TableCell>
                              {(s.intensity === "warmup" || s.isWarmup) ? "W" : s.setNum}
                            </TableCell>
                            {editingSetId === s.id ? (
                              <SetEditFormDesktopCells
                                editWeight={editWeight}
                                editReps={editReps}
                                editIntensity={editIntensity}
                                onEditWeightChange={onEditWeightChange}
                                onEditRepsChange={onEditRepsChange}
                                onEditIntensityChange={onEditIntensityChange}
                                onSave={() => onSaveSet(s.id, we.exerciseId)}
                                onCancel={onCancelEditSet}
                                isPending={isPending}
                              />
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
                  </div>

                  <Button
                    variant="ghost"
                    size="xs"
                    className="mt-1"
                    onClick={() => onAddSetToHistory(we.id, we.sets.length)}
                    disabled={isPending}
                  >
                    <PlusIcon className="size-3 mr-1" />
                    {t("add_set")}
                  </Button>
                </div>
              ))}
            </div>
          )}

          {/* Add exercise to completed workout */}
          <div className="mt-4 flex flex-wrap gap-2 items-center justify-between">
            <ExercisePickerDialog
              open={pickerOpen}
              onOpenChange={(open) => {
                setPickerOpen(open);
                if (!open) {
                  resetPicker();
                }
              }}
              exercises={exercises}
              favoriteIds={favoriteIds}
              exerciseSearch={exerciseSearch}
              onExerciseSearchChange={setExerciseSearch}
              exerciseMuscleFilter={muscleFilter}
              onExerciseMuscleFilterChange={setMuscleFilter}
              isPending={isPending}
              onSelectExercise={(exerciseId) => {
                onAddExerciseToWorkout(workout.id, exerciseId, workout.exercises.length);
                resetPicker();
              }}
              onSelectDefaultExercise={onAddDefaultExerciseToWorkout ? (exerciseName) => {
                onAddDefaultExerciseToWorkout(workout.id, workout.exercises.length, exerciseName);
                resetPicker();
              } : undefined}
            />
            <Button
              variant="destructive"
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                onDeleteWorkout(workout.id);
              }}
              disabled={isPending}
            >
              <Trash2Icon className="size-3.5 mr-1" />
              {tc("delete")}
            </Button>
          </div>
        </CardContent>
      )}
    </Card>
  );
}
