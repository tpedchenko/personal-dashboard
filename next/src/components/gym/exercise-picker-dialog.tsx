"use client";

import { useMemo } from "react";
import { useTranslations } from "next-intl";
import { SearchIcon, StarIcon, PlusIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";

import type { GymExercise } from "@/types/gym";
import { EmptyState } from "@/components/shared/empty-state";
import { DEFAULT_EXERCISES } from "@/actions/gym/utils";

const MUSCLE_GROUPS = [
  "Chest",
  "Back",
  "Shoulders",
  "Biceps",
  "Triceps",
  "Traps",
  "Quads",
  "Hamstrings",
  "Glutes",
  "Calves",
  "Core",
  "Forearms",
  "Cardio",
];

export interface ExercisePickerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  exercises: GymExercise[];
  favoriteIds: number[];
  exerciseSearch: string;
  onExerciseSearchChange: (value: string) => void;
  exerciseMuscleFilter: string;
  onExerciseMuscleFilterChange: (value: string) => void;
  isPending: boolean;
  onSelectExercise: (exerciseId: number) => void;
  onSelectDefaultExercise?: (exerciseName: string) => void;
}

export function ExercisePickerDialog({
  open,
  onOpenChange,
  exercises,
  favoriteIds,
  exerciseSearch,
  onExerciseSearchChange,
  exerciseMuscleFilter,
  onExerciseMuscleFilterChange,
  isPending,
  onSelectExercise,
  onSelectDefaultExercise,
}: ExercisePickerDialogProps) {
  const t = useTranslations("gym");
  const tc = useTranslations("common");

  const filteredExercises = exercises
    .filter((e) => {
      if (exerciseMuscleFilter && e.muscleGroup !== exerciseMuscleFilter) return false;
      if (exerciseSearch && !e.name.toLowerCase().includes(exerciseSearch.toLowerCase())
        && !(e.nameUa && e.nameUa.toLowerCase().includes(exerciseSearch.toLowerCase())))
        return false;
      return true;
    })
    .sort((a, b) => {
      const aFav = favoriteIds.includes(a.id) ? 0 : 1;
      const bFav = favoriteIds.includes(b.id) ? 0 : 1;
      return aFav - bFav;
    });

  // Default exercises not yet in user's library
  const existingNames = useMemo(() => new Set(exercises.map((e) => e.name)), [exercises]);
  const filteredDefaults = useMemo(() => {
    if (!onSelectDefaultExercise) return [];
    return DEFAULT_EXERCISES.filter((e) => {
      if (existingNames.has(e.name)) return false;
      if (exerciseMuscleFilter && e.muscleGroup !== exerciseMuscleFilter) return false;
      if (exerciseSearch && !e.name.toLowerCase().includes(exerciseSearch.toLowerCase())
        && !(e.nameUa && e.nameUa.toLowerCase().includes(exerciseSearch.toLowerCase())))
        return false;
      return true;
    });
  }, [onSelectDefaultExercise, existingNames, exerciseMuscleFilter, exerciseSearch]);

  const hasResults = filteredExercises.length > 0 || filteredDefaults.length > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger
        render={
          <Button variant="outline" className="w-full" data-testid="add-exercise-btn" />
        }
      >
        <PlusIcon className="size-4 mr-1" />
        {t("add_exercise")}
      </DialogTrigger>
      <DialogContent className="sm:max-w-md max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t("select_exercise")}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <SearchIcon className="absolute left-2.5 top-2 size-4 text-muted-foreground" />
              <Input
                placeholder={tc("search")}
                value={exerciseSearch}
                onChange={(e) => onExerciseSearchChange(e.target.value)}
                className="pl-8"
              />
            </div>
            <Select
              value={exerciseMuscleFilter}
              onValueChange={(v) => onExerciseMuscleFilterChange(String(v ?? ""))}
            >
              <SelectTrigger className="w-[140px]">
                <SelectValue placeholder={t("muscle_group")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">
                  {tc("all")}
                </SelectItem>
                {MUSCLE_GROUPS.map((mg) => (
                  <SelectItem key={mg} value={mg}>
                    {t(`muscle_groups.${mg}`) || mg}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1 max-h-[50vh] overflow-y-auto">
            {filteredExercises.map((ex) => (
              <div key={ex.id} className="flex items-center gap-1">
                <button
                  className="flex-1 text-left px-3 py-2 rounded-md hover:bg-muted transition-colors"
                  onClick={() => onSelectExercise(ex.id)}
                  disabled={isPending}
                >
                  <span className="font-medium text-sm">
                    {favoriteIds.includes(ex.id) && (
                      <StarIcon className="size-3 inline mr-1 text-yellow-500 fill-yellow-500" />
                    )}
                    {ex.nameUa || ex.name}
                  </span>
                  <div className="flex gap-2 mt-0.5">
                    {ex.muscleGroup && (
                      <span className="text-xs text-muted-foreground">
                        {t(`muscle_groups.${ex.muscleGroup}`) || ex.muscleGroup}
                      </span>
                    )}
                    {ex.equipment && (
                      <span className="text-xs text-muted-foreground">
                        {ex.equipment}
                      </span>
                    )}
                  </div>
                </button>
              </div>
            ))}
            {filteredDefaults.length > 0 && (
              <>
                {filteredExercises.length > 0 && <Separator className="my-2" />}
                <p className="text-xs text-muted-foreground px-3 py-1">
                  {t("other_exercises") || "Other exercises"}
                </p>
                {filteredDefaults.map((ex) => (
                  <div key={ex.name} className="flex items-center gap-1">
                    <button
                      className="flex-1 text-left px-3 py-2 rounded-md hover:bg-muted transition-colors"
                      onClick={() => onSelectDefaultExercise?.(ex.name)}
                      disabled={isPending}
                    >
                      <span className="font-medium text-sm">
                        {ex.nameUa || ex.name}
                      </span>
                      <div className="flex gap-2 mt-0.5">
                        <span className="text-xs text-muted-foreground">
                          {t(`muscle_groups.${ex.muscleGroup}`) || ex.muscleGroup}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {ex.equipment}
                        </span>
                      </div>
                    </button>
                  </div>
                ))}
              </>
            )}
            {!hasResults && (
              <EmptyState title={tc("no_data")} />
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
