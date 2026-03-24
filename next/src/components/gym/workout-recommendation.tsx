"use client";

import { useTranslations } from "next-intl";
import { LightbulbIcon, PlayIcon, MoreHorizontalIcon } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export interface WorkoutRecommendationProps {
  recommendation: {
    split: { name: string; nameKey: string; muscles: string[] };
    recoveredMuscles: string[];
  } | null;
  /** ID of the recommended program day (best match) */
  recommendedDayId?: number | null;
  /** Name of the recommended program day */
  recommendedDayName?: string | null;
  /** Focus muscles of the recommended day */
  recommendedDayFocus?: string | null;
  /** Program name */
  recommendedProgramName?: string | null;
  isPending?: boolean;
  /** Start the recommended day directly */
  onStartRecommended?: () => void;
  /** Open the full start workout dialog */
  onOpenDialog?: () => void;
}

export function WorkoutRecommendation({
  recommendation,
  recommendedDayId,
  recommendedDayName,
  recommendedDayFocus,
  recommendedProgramName,
  isPending,
  onStartRecommended,
  onOpenDialog,
}: WorkoutRecommendationProps) {
  const t = useTranslations("gym");

  if (!recommendation) return null;

  const hasRecommendedDay = recommendedDayId != null;

  return (
    <Card size="sm" className="border-green-500/30 bg-green-500/5">
      <CardContent className="py-3">
        <div className="flex items-start gap-2">
          <LightbulbIcon className="size-4 text-green-500 mt-0.5 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium">
              {t("recommended")}:
            </p>
            {hasRecommendedDay ? (
              <p className="text-sm text-muted-foreground mt-0.5">
                {recommendedProgramName && (
                  <span className="text-foreground font-medium">{recommendedProgramName}</span>
                )}
                {recommendedProgramName && " → "}
                <span className="text-foreground font-medium">{recommendedDayName}</span>
                {recommendedDayFocus && (
                  <span className="text-muted-foreground"> ({recommendedDayFocus})</span>
                )}
              </p>
            ) : (
              <p className="text-sm text-muted-foreground mt-0.5">
                {t(recommendation.split.nameKey)} ({recommendation.recoveredMuscles.map((m: string) => t(`muscle_groups.${m}`) || m).join(", ")} — {t("fully_recovered")})
              </p>
            )}
            <div className="flex items-center gap-2 mt-2">
              {hasRecommendedDay && onStartRecommended && (
                <Button
                  size="sm"
                  className="gap-1.5"
                  onClick={onStartRecommended}
                  disabled={isPending}
                >
                  <PlayIcon className="size-3.5" />
                  {t("start_training")}
                </Button>
              )}
              {onOpenDialog && (
                <Button
                  size="sm"
                  variant={hasRecommendedDay ? "outline" : "default"}
                  className="gap-1.5"
                  onClick={onOpenDialog}
                  disabled={isPending}
                >
                  {hasRecommendedDay ? (
                    <>
                      <MoreHorizontalIcon className="size-3.5" />
                      {t("other_options")}
                    </>
                  ) : (
                    <>
                      <PlayIcon className="size-3.5" />
                      {t("start_training")}
                    </>
                  )}
                </Button>
              )}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
