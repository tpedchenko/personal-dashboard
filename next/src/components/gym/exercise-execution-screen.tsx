"use client";

import { useTranslations } from "next-intl";
import {
  ArrowLeftIcon,
  InfoIcon,
  FlagIcon,
  PlusIcon,
  MoreVerticalIcon,
  Trash2Icon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { getIntensityColor } from "./gym-constants";

export interface ExerciseExecutionScreenProps {
  exerciseName: string;
  currentSets: Array<{
    id: number;
    setNum: number;
    weightKg: number | null;
    reps: number | null;
    intensity: string | null;
  }>;
  previousSets: Array<{
    setNum: number;
    weightKg: number | null;
    reps: number | null;
    intensity: string | null;
  }> | null;
  previousDate: string | null;
  onBack: () => void;
  onAddSet: () => void;
  onDeleteSet: (setId: number) => void;
}

export function ExerciseExecutionScreen({
  exerciseName,
  currentSets,
  previousSets,
  previousDate,
  onBack,
  onAddSet,
  onDeleteSet,
}: ExerciseExecutionScreenProps) {
  const t = useTranslations("gym");

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background text-foreground">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b">
        <Button variant="ghost" size="icon" onClick={onBack} className="size-9">
          <ArrowLeftIcon className="size-5" />
        </Button>
        <h1 className="text-base font-semibold truncate mx-2 flex-1 text-center">
          {exerciseName}
        </h1>
        <Button variant="ghost" size="icon" className="size-9">
          <InfoIcon className="size-5" />
        </Button>
      </div>

      {/* Top bar icons */}
      <div className="flex items-center justify-end gap-1 px-4 py-2 border-b">
        <Button variant="ghost" size="icon" className="size-8">
          <FlagIcon className="size-4" />
        </Button>
        <Button variant="ghost" size="icon" className="size-8">
          <PlusIcon className="size-4" />
        </Button>
        <Button variant="ghost" size="icon" className="size-8">
          <MoreVerticalIcon className="size-4" />
        </Button>
      </div>

      {/* Set table area */}
      <div className="flex-1 overflow-y-auto px-4 py-3">
        {/* Table header */}
        <div className="grid grid-cols-[2.5rem_1fr_1fr_2rem] gap-2 text-xs text-muted-foreground font-medium mb-2 px-2">
          <span>{t("set")}</span>
          <span className="text-center">{t("weight")} ({t("kg")})</span>
          <span className="text-center">{t("reps")}</span>
          <span />
        </div>

        {/* Previous workout sets (muted reference) */}
        {previousSets && previousSets.length > 0 && (
          <div className="mb-3 opacity-40">
            {previousSets.map((ps, idx) => (
              <div
                key={`prev-${idx}`}
                className="grid grid-cols-[2.5rem_1fr_1fr_2rem] gap-2 items-center py-1.5 px-2 text-sm"
              >
                <div className="flex items-center gap-1.5">
                  <div
                    className="w-1 h-6 rounded-full shrink-0"
                    style={{ backgroundColor: getIntensityColor(ps.intensity) }}
                  />
                  <span className="text-muted-foreground text-xs">
                    {ps.intensity === "warmup" ? "W" : ps.setNum}
                  </span>
                </div>
                <span className="text-center text-muted-foreground">
                  {ps.weightKg ?? "\u2014"}
                </span>
                <span className="text-center text-muted-foreground">
                  {ps.reps ?? "\u2014"}
                </span>
                <span />
              </div>
            ))}
          </div>
        )}

        {/* Current workout sets */}
        {currentSets.length > 0 && (
          <div className="space-y-0.5">
            {currentSets.map((s) => (
              <div
                key={s.id}
                className="grid grid-cols-[2.5rem_1fr_1fr_2rem] gap-2 items-center py-2 px-2 rounded-lg bg-card"
              >
                <div className="flex items-center gap-1.5">
                  <div
                    className="w-1 h-7 rounded-full shrink-0"
                    style={{ backgroundColor: getIntensityColor(s.intensity) }}
                  />
                  <span className="font-medium text-sm">
                    {s.intensity === "warmup" ? "W" : s.setNum}
                  </span>
                </div>
                <span className="text-center font-medium text-sm">
                  {s.weightKg ?? "\u2014"}
                </span>
                <span className="text-center font-medium text-sm">
                  {s.reps ?? "\u2014"}
                </span>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-7"
                  onClick={() => onDeleteSet(s.id)}
                >
                  <Trash2Icon className="size-3.5 text-destructive" />
                </Button>
              </div>
            ))}
          </div>
        )}

        {/* Last workout link */}
        {previousDate && (
          <button className="mt-4 text-xs text-muted-foreground hover:text-foreground transition-colors">
            {t("last_workout_was")} {previousDate} &gt;
          </button>
        )}
      </div>

      {/* FAB - Add set */}
      <div className="flex justify-center pb-8 pt-3">
        <Button
          onClick={onAddSet}
          size="icon"
          className="size-14 rounded-full shadow-lg"
        >
          <PlusIcon className="size-7" />
        </Button>
      </div>
    </div>
  );
}
