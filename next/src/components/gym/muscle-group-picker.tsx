"use client";

import { useTranslations } from "next-intl";
import { ArrowLeftIcon } from "lucide-react";
import { MuscleSvg } from "./muscle-svg";

const MUSCLE_GROUPS = [
  "Chest",
  "Back",
  "Shoulders",
  "Biceps",
  "Triceps",
  "Traps",
  "Quadriceps",
  "Hamstrings",
  "Glutes",
  "Calves",
  "Core",
  "Forearms",
  "Lats",
  "Lower Back",
  "Adductors",
  "Abductors",
  "Neck",
  "Abdominals",
] as const;

export type MuscleGroupPickerProps = {
  onSelectGroup: (muscleGroup: string) => void;
  onBack: () => void;
};

export function MuscleGroupPicker({ onSelectGroup, onBack }: MuscleGroupPickerProps) {
  const t = useTranslations("gym");

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
        <h2 className="text-lg font-semibold text-foreground">{t("select_muscle_group")}</h2>
      </div>

      {/* Muscle group list */}
      <div className="divide-y divide-border">
        {MUSCLE_GROUPS.map((group) => (
          <button
            key={group}
            type="button"
            onClick={() => onSelectGroup(group)}
            className="flex w-full items-center justify-between px-4 py-3 hover:bg-muted/50 active:bg-muted transition-colors"
          >
            <span className="text-sm font-medium text-foreground">{t(`muscle_groups.${group}`)}</span>
            <MuscleSvg highlight={group} size={48} />
          </button>
        ))}
      </div>
    </div>
  );
}
