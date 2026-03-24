"use client";

import { useTranslations } from "next-intl";
import { PlusIcon, DumbbellIcon, PlayIcon, LightbulbIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Fab } from "@/components/ui/fab";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogClose,
} from "@/components/ui/dialog";
import type { GymProgram, SplitRecommendation } from "@/types/gym";

type Recommendation = {
  split: SplitRecommendation;
  recoveredMuscles: string[];
} | null;

interface StartWorkoutDialogProps {
  programs: GymProgram[];
  recommendation: Recommendation;
  isPending: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  onStartFreeWorkout: () => void;
  onStartFromTemplate: (programDayId: number) => void;
}

export function StartWorkoutDialog({
  programs,
  recommendation,
  isPending,
  open,
  onOpenChange,
  onStartFreeWorkout,
  onStartFromTemplate,
}: StartWorkoutDialogProps) {
  const t = useTranslations("gym");

  // Find program days matching the recommendation
  const recommendedDayIds = new Set<number>();
  if (recommendation) {
    const recMuscles = new Set(recommendation.split.muscles.map((m) => m.toLowerCase()));
    for (const prog of programs) {
      for (const day of prog.days) {
        if (day.focus) {
          const dayMuscles = day.focus.split(",").map((s) => s.trim().toLowerCase());
          const overlap = dayMuscles.some((m) => recMuscles.has(m));
          if (overlap) recommendedDayIds.add(day.id);
        }
      }
    }
  }

  const dialogContent = (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>{t("start_workout")}</DialogTitle>
      </DialogHeader>
      <div className="max-h-[70vh] overflow-y-auto -mx-1 px-1">
        {/* Recommendation badge */}
        {recommendation && (
          <div className="flex items-start gap-2 rounded-lg border border-green-500/30 bg-green-500/5 p-3 mb-3">
            <LightbulbIcon className="size-4 text-green-500 mt-0.5 shrink-0" />
            <p className="text-sm font-medium">
              {t("recommended")}: {t(recommendation.split.nameKey)}
              <span className="text-muted-foreground font-normal">
                {" "}({recommendation.recoveredMuscles.map((m) => t(`muscle_groups.${m}`) || m).join(", ")} — {t("fully_recovered")})
              </span>
            </p>
          </div>
        )}

        {/* Programs with days expanded */}
        {programs.length > 0 && (
          <div className="space-y-4">
            {programs.map((prog) => (
              <div key={prog.id}>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
                  {prog.name}
                  {prog.daysPerWeek && (
                    <span className="font-normal ml-1">({prog.daysPerWeek} {t("days_per_week")})</span>
                  )}
                </p>
                <div className="space-y-1">
                  {prog.days.map((day) => {
                    const isRecommended = recommendedDayIds.has(day.id);
                    return (
                      <DialogClose
                        key={day.id}
                        render={
                          <button
                            type="button"
                            className={`w-full flex items-center gap-2 rounded-lg border px-3 py-2.5 text-left transition-colors
                              ${isRecommended
                                ? "border-green-500/40 bg-green-500/5 hover:bg-green-500/10"
                                : "border-border hover:bg-accent"
                              }
                              ${isPending ? "opacity-50 pointer-events-none" : ""}
                            `}
                            onClick={() => onStartFromTemplate(day.id)}
                            disabled={isPending}
                          />
                        }
                      >
                        <PlayIcon className={`size-4 shrink-0 ${isRecommended ? "text-green-500" : "text-muted-foreground"}`} />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">
                            {day.dayName}
                            {isRecommended && (
                              <span className="ml-1.5 text-xs text-green-600 dark:text-green-400 font-normal">
                                {t("recommended")}
                              </span>
                            )}
                          </p>
                          {day.focus && (
                            <p className="text-xs text-muted-foreground truncate">{day.focus}</p>
                          )}
                        </div>
                        <span className="text-xs text-muted-foreground whitespace-nowrap">
                          {day.exercises.length} {t("exercises_count")}
                        </span>
                      </DialogClose>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Separator + Free workout at the bottom */}
        {programs.length > 0 && <Separator className="my-3" />}
        <DialogClose
          render={
            <Button
              className="w-full justify-start"
              variant="outline"
              onClick={onStartFreeWorkout}
              disabled={isPending}
              data-testid="free-workout-btn"
            />
          }
        >
          <PlusIcon className="size-4 mr-2" />
          {t("free_workout")}
        </DialogClose>
      </div>
    </DialogContent>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger
        render={
          <Fab aria-label="Start workout" className="sm:bottom-6 sm:block" />
        }
      >
        <DumbbellIcon className="size-6" />
      </DialogTrigger>
      {dialogContent}
    </Dialog>
  );
}
