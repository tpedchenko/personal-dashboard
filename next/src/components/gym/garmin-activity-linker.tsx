"use client";

import { useTranslations } from "next-intl";
import { LinkIcon } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import type { GarminActivityItem } from "@/types/gym";

export interface GarminActivityLinkerProps {
  garminActivities: GarminActivityItem[];
  justCompletedWorkoutId: number;
  isPending: boolean;
  onLinkGarmin: (workoutId: number, garminActivityId: number) => void;
  onClose: () => void;
}

export function GarminActivityLinker({
  garminActivities,
  justCompletedWorkoutId,
  isPending,
  onLinkGarmin,
  onClose,
}: GarminActivityLinkerProps) {
  const t = useTranslations("gym");
  const tc = useTranslations("common");

  // Only show strength_training activities for linking to gym workouts
  const strengthActivities = garminActivities.filter(
    (ga) => ga.activityType === "strength_training"
  );

  return (
    <Card size="sm" className="border-blue-500/30 bg-blue-500/5">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm flex items-center gap-1.5">
            <LinkIcon className="size-4" />
            {t("link_garmin_activity")}
          </CardTitle>
          <Button
            variant="ghost"
            size="xs"
            onClick={onClose}
          >
            {tc("close")}
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {strengthActivities.length === 0 ? (
          <p className="text-xs text-muted-foreground">{t("no_garmin_activities")}</p>
        ) : (
          <div className="space-y-1.5">
            {strengthActivities.map((ga) => (
              <button
                key={ga.activityId}
                className="w-full text-left px-3 py-2 rounded-md hover:bg-muted transition-colors text-sm"
                onClick={() => onLinkGarmin(justCompletedWorkoutId, ga.activityId)}
                disabled={isPending}
              >
                <div className="flex items-center justify-between">
                  <span className="font-medium">{ga.activityName ?? ga.activityType ?? "Activity"}</span>
                  <span className="text-xs text-muted-foreground">{ga.date}</span>
                </div>
                <div className="flex gap-3 text-xs text-muted-foreground mt-0.5">
                  {ga.durationSeconds && (
                    <span>{Math.round(ga.durationSeconds / 60)} {t("min")}</span>
                  )}
                  {ga.calories && <span>{ga.calories} kcal</span>}
                  {ga.avgHr && <span>{ga.avgHr} bpm</span>}
                </div>
              </button>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
