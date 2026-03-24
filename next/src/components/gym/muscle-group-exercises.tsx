"use client";

import { useMemo } from "react";
import { useTranslations } from "next-intl";
import { ArrowLeftIcon, StarIcon, DumbbellIcon } from "lucide-react";
import { MuscleSvg } from "./muscle-svg";

export type MuscleGroupExercise = {
  id: number;
  name: string;
  equipment: string | null;
  isFavourite: boolean | null;
};

export type MuscleGroupExercisesProps = {
  muscleGroup: string;
  exercises: MuscleGroupExercise[];
  onSelectExercise: (exerciseId: number) => void;
  onBack: () => void;
};

function EquipmentBadge({ equipment }: { equipment: string | null }) {
  if (!equipment) return null;
  return (
    <span className="inline-flex items-center rounded-md bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
      {equipment}
    </span>
  );
}

export function MuscleGroupExercises({
  muscleGroup,
  exercises,
  onSelectExercise,
  onBack,
}: MuscleGroupExercisesProps) {
  const t = useTranslations("gym");
  const sorted = useMemo(() => {
    return [...exercises].sort((a, b) => {
      const aFav = a.isFavourite ? 0 : 1;
      const bFav = b.isFavourite ? 0 : 1;
      if (aFav !== bFav) return aFav - bFav;
      return a.name.localeCompare(b.name);
    });
  }, [exercises]);

  return (
    <div className="fixed inset-0 z-50 bg-background overflow-y-auto">
      {/* Header */}
      <div className="sticky top-0 z-10 flex items-center gap-3 bg-background/95 backdrop-blur-sm border-b border-border px-4 py-3">
        <button
          type="button"
          onClick={onBack}
          className="shrink-0 rounded-lg p-1.5 -ml-1.5 hover:bg-muted active:bg-muted/80 transition-colors"
          aria-label={t("back_to_workout")}
        >
          <ArrowLeftIcon className="h-5 w-5 text-foreground" />
        </button>
        <div className="flex items-center gap-2 min-w-0">
          <MuscleSvg highlight={muscleGroup} size={32} />
          <h2 className="text-lg font-semibold text-foreground truncate">{t(`muscle_groups.${muscleGroup}`)}</h2>
        </div>
      </div>

      {/* Exercise list */}
      {sorted.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
          <DumbbellIcon className="h-10 w-10 mb-3 opacity-40" />
          <p className="text-sm">{t("no_exercises_found", { group: t(`muscle_groups.${muscleGroup}`) })}</p>
        </div>
      ) : (
        <div className="divide-y divide-border">
          {sorted.map((exercise) => (
            <button
              key={exercise.id}
              type="button"
              onClick={() => onSelectExercise(exercise.id)}
              className="flex w-full items-center gap-3 px-4 py-3 hover:bg-muted/50 active:bg-muted transition-colors"
            >
              {exercise.isFavourite && (
                <StarIcon className="h-4 w-4 shrink-0 fill-yellow-400 text-yellow-400" />
              )}
              <span className="text-sm font-medium text-foreground text-left flex-1 min-w-0 truncate">
                {exercise.name}
              </span>
              <EquipmentBadge equipment={exercise.equipment} />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
