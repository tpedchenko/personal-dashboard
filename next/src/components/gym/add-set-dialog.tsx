"use client";

import { useState, useCallback } from "react";
import { useTranslations } from "next-intl";
import { MinusIcon, PlusIcon } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { INTENSITY_OPTIONS, INTENSITY_STYLES } from "./gym-constants";

// Stepper logic extracted for testability
export const WEIGHT_STEP = 2.5;
export const WEIGHT_MIN = 0;
export const REPS_MIN = 1;

export function decrementWeight(current: number): number {
  return Math.max(WEIGHT_MIN, current - WEIGHT_STEP);
}

export function incrementWeight(current: number): number {
  return current + WEIGHT_STEP;
}

export function decrementReps(current: number): number {
  return Math.max(REPS_MIN, current - 1);
}

export function incrementReps(current: number): number {
  return current + 1;
}

interface AddSetDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultWeight?: number;
  defaultReps?: number;
  defaultIntensity?: string;
  onAdd: (data: { weightKg: number; reps: number; intensity: string }) => void;
}

export function AddSetDialog({
  open,
  onOpenChange,
  defaultWeight = 20,
  defaultReps = 10,
  defaultIntensity = "normal",
  onAdd,
}: AddSetDialogProps) {
  const t = useTranslations("gym");

  const [weight, setWeight] = useState(defaultWeight);
  const [reps, setReps] = useState(defaultReps);
  const [intensity, setIntensity] = useState<string>(defaultIntensity);

  // Reset state when dialog opens with new defaults
  const handleOpenChange = useCallback(
    (nextOpen: boolean) => {
      if (nextOpen) {
        setWeight(defaultWeight);
        setReps(defaultReps);
        setIntensity(defaultIntensity);
      }
      onOpenChange(nextOpen);
    },
    [defaultWeight, defaultReps, defaultIntensity, onOpenChange]
  );

  const handleAdd = useCallback(() => {
    onAdd({ weightKg: weight, reps, intensity });
    onOpenChange(false);
  }, [weight, reps, intensity, onAdd, onOpenChange]);

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="sm:max-w-sm"
      >
        <DialogTitle className="text-center text-lg font-semibold">
          {t("addSet")}
        </DialogTitle>

        {/* Weight stepper */}
        <div className="flex flex-col items-center gap-2">
          <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            {t("weight")} (kg)
          </span>
          <div className="flex w-full items-center justify-center gap-4">
            <button
              type="button"
              onClick={() => setWeight(decrementWeight)}
              className="flex size-14 shrink-0 items-center justify-center rounded-xl bg-muted text-xl font-bold transition-colors active:bg-muted/70"
            >
              <MinusIcon className="size-6" />
            </button>
            <span className="min-w-[5rem] text-center text-5xl font-bold tabular-nums">
              {weight % 1 === 0 ? weight : weight.toFixed(1)}
            </span>
            <button
              type="button"
              onClick={() => setWeight(incrementWeight)}
              className="flex size-14 shrink-0 items-center justify-center rounded-xl bg-muted text-xl font-bold transition-colors active:bg-muted/70"
            >
              <PlusIcon className="size-6" />
            </button>
          </div>
        </div>

        {/* Reps stepper */}
        <div className="flex flex-col items-center gap-2">
          <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            {t("reps")}
          </span>
          <div className="flex w-full items-center justify-center gap-4">
            <button
              type="button"
              onClick={() => setReps(decrementReps)}
              className="flex size-14 shrink-0 items-center justify-center rounded-xl bg-muted text-xl font-bold transition-colors active:bg-muted/70"
            >
              <MinusIcon className="size-6" />
            </button>
            <span className="min-w-[5rem] text-center text-5xl font-bold tabular-nums">
              {reps}
            </span>
            <button
              type="button"
              onClick={() => setReps(incrementReps)}
              className="flex size-14 shrink-0 items-center justify-center rounded-xl bg-muted text-xl font-bold transition-colors active:bg-muted/70"
            >
              <PlusIcon className="size-6" />
            </button>
          </div>
        </div>

        {/* Intensity segmented control */}
        <div className="flex flex-col items-center gap-2">
          <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            {t("intensity")}
          </span>
          <div className="flex w-full overflow-hidden rounded-lg border border-border">
            {INTENSITY_OPTIONS.map((option) => {
              const isActive = intensity === option;
              const styles = INTENSITY_STYLES[option];
              return (
                <button
                  key={option}
                  type="button"
                  onClick={() => setIntensity(option)}
                  className={`flex-1 px-1 py-2.5 text-xs font-semibold capitalize transition-colors ${
                    isActive ? styles.active : styles.inactive
                  }`}
                >
                  {t(`intensity_${option}`)}
                </button>
              );
            })}
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex gap-3 pt-2">
          <Button
            variant="outline"
            className="h-12 flex-1 text-base"
            onClick={() => onOpenChange(false)}
          >
            {t("cancel")}
          </Button>
          <Button
            className="h-12 flex-1 text-base"
            onClick={handleAdd}
          >
            {t("add")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
