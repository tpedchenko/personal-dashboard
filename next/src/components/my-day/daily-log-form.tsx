"use client";

import { useTranslations } from "next-intl";
import { SaveIcon } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Slider } from "@/components/ui/slider";
import { ErrorBoundary } from "@/components/shared/error-boundary";

interface DailyLogFormProps {
  moodDelta: number;
  onMoodDeltaChange: (v: number) => void;
  energy: number;
  onEnergyChange: (v: number) => void;
  stress: number;
  onStressChange: (v: number) => void;
  focus: number;
  onFocusChange: (v: number) => void;
  sexCount: number;
  onSexCountChange: (v: number) => void;
  bjCount: number;
  onBjCountChange: (v: number) => void;
  alcohol: number;
  onAlcoholChange: (v: number) => void;
  caffeine: number;
  onCaffeineChange: (v: number) => void;
  kidsMinutes: number;
  onKidsMinutesChange: (v: number) => void;
  generalNote: string;
  onGeneralNoteChange: (v: string) => void;
  onSave: () => void;
  isPending: boolean;
  saved: boolean;
}

export function DailyLogForm({
  moodDelta,
  onMoodDeltaChange,
  energy,
  onEnergyChange,
  stress,
  onStressChange,
  focus,
  onFocusChange,
  sexCount,
  onSexCountChange,
  bjCount,
  onBjCountChange,
  alcohol,
  onAlcoholChange,
  caffeine,
  onCaffeineChange,
  kidsMinutes,
  onKidsMinutesChange,
  generalNote,
  onGeneralNoteChange,
  onSave,
  isPending,
  saved,
}: DailyLogFormProps) {
  const t = useTranslations("my_day");
  const tc = useTranslations("common");

  const energyLabels: Record<number, string> = {
    1: t("energy_levels.1"),
    2: t("energy_levels.2"),
    3: t("energy_levels.3"),
    4: t("energy_levels.4"),
    5: t("energy_levels.5"),
  };

  const stressLabels: Record<number, string> = {
    1: t("stress_levels.1"),
    2: t("stress_levels.2"),
    3: t("stress_levels.3"),
    4: t("stress_levels.4"),
    5: t("stress_levels.5"),
  };

  return (
    <ErrorBoundary moduleName="Daily Diary">
      <Card>
        <CardHeader>
          <CardTitle>{t("daily_diary")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Mood delta (-10 to +10, affects level by -1 to +1) */}
          <div className="space-y-2">
            <div className="flex justify-between">
              <Label>{t("mood_change")}</Label>
              <span className="text-sm font-medium" style={{ color: moodDelta > 0 ? "#22c55e" : moodDelta < 0 ? "#ef4444" : "#64748b" }}>
                {moodDelta >= 0 ? "+" : ""}{moodDelta} ({moodDelta >= 0 ? "+" : ""}{(moodDelta / 10).toFixed(1)} lvl)
              </span>
            </div>
            <div className="flex justify-between text-xs text-muted-foreground mb-1">
              <span>{"\u{1F624}"} -10</span>
              <span>{"\u{1F614}"} -5</span>
              <span>{"\u{1F610}"} 0</span>
              <span>{"\u{1F642}"} +5</span>
              <span>{"\u{1F604}"} +10</span>
            </div>
            <div className="relative">
              <div className="absolute inset-0 h-2 top-[9px] rounded-full" style={{
                background: "linear-gradient(to right, #ef4444 0%, #ef4444 25%, #f97316 35%, #94a3b8 45%, #94a3b8 55%, #22c55e 65%, #22c55e 75%, #16a34a 100%)"
              }} />
              <Slider
                min={-10}
                max={10}
                value={[moodDelta]}
                onValueChange={(v) => { const arr = Array.isArray(v) ? v : [v]; onMoodDeltaChange(arr[0]); }}
                className="relative"
              />
            </div>
          </div>

          {/* Energy */}
          <div className="space-y-2">
            <div className="flex justify-between">
              <Label>{t("energy")}</Label>
              <span className="text-sm text-muted-foreground">
                {energy} &mdash; {energyLabels[energy]}
              </span>
            </div>
            <Slider
              min={1}
              max={5}
              value={[energy]}
              onValueChange={(v) => { const arr = Array.isArray(v) ? v : [v]; onEnergyChange(arr[0]); }}
              className={
                energy >= 4 ? "[&_[data-slot=slider-range]]:bg-green-500 [&_[data-slot=slider-thumb]]:border-green-500"
                : energy >= 3 ? "[&_[data-slot=slider-range]]:bg-yellow-500 [&_[data-slot=slider-thumb]]:border-yellow-500"
                : "[&_[data-slot=slider-range]]:bg-red-500 [&_[data-slot=slider-thumb]]:border-red-500"
              }
            />
          </div>

          {/* Stress */}
          <div className="space-y-2">
            <div className="flex justify-between">
              <Label>{t("stress")}</Label>
              <span className="text-sm text-muted-foreground">
                {stress} &mdash; {stressLabels[stress]}
              </span>
            </div>
            <Slider
              min={1}
              max={5}
              value={[stress]}
              onValueChange={(v) => { const arr = Array.isArray(v) ? v : [v]; onStressChange(arr[0]); }}
              className={
                stress <= 2 ? "[&_[data-slot=slider-range]]:bg-green-500 [&_[data-slot=slider-thumb]]:border-green-500"
                : stress <= 3 ? "[&_[data-slot=slider-range]]:bg-yellow-500 [&_[data-slot=slider-thumb]]:border-yellow-500"
                : "[&_[data-slot=slider-range]]:bg-red-500 [&_[data-slot=slider-thumb]]:border-red-500"
              }
            />
          </div>

          {/* Focus */}
          <div className="space-y-2">
            <div className="flex justify-between">
              <Label>{t("focus")}</Label>
              <span className="text-sm text-muted-foreground">{focus} / 5</span>
            </div>
            <Slider
              min={1}
              max={5}
              value={[focus]}
              onValueChange={(v) => { const arr = Array.isArray(v) ? v : [v]; onFocusChange(arr[0]); }}
              className={
                focus >= 4 ? "[&_[data-slot=slider-range]]:bg-blue-500 [&_[data-slot=slider-thumb]]:border-blue-500"
                : focus >= 3 ? "[&_[data-slot=slider-range]]:bg-cyan-500 [&_[data-slot=slider-thumb]]:border-cyan-500"
                : "[&_[data-slot=slider-range]]:bg-orange-500 [&_[data-slot=slider-thumb]]:border-orange-500"
              }
            />
          </div>

          {/* Counters: Sex, BJ, Alcohol, Caffeine — compact number inputs */}
          <div className="grid grid-cols-4 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">{"\u{1F525}"} {t("sex")}</Label>
              <Input
                type="number"
                min={0}
                max={10}
                value={sexCount}
                onChange={(e) => onSexCountChange(Math.max(0, Math.min(10, Number(e.target.value) || 0)))}
                className="h-9 text-center"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">{"\u{1F48B}"} BJ</Label>
              <Input
                type="number"
                min={0}
                max={10}
                value={bjCount}
                onChange={(e) => onBjCountChange(Math.max(0, Math.min(10, Number(e.target.value) || 0)))}
                className="h-9 text-center"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">{"\u{1F377}"}</Label>
              <Input
                type="number"
                min={0}
                max={20}
                value={alcohol}
                onChange={(e) => onAlcoholChange(Math.max(0, Math.min(20, Number(e.target.value) || 0)))}
                className="h-9 text-center"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">{"\u2615"} {t("coffees")}</Label>
              <Input
                type="number"
                min={0}
                max={20}
                value={caffeine}
                onChange={(e) => onCaffeineChange(Math.max(0, Math.min(20, Number(e.target.value) || 0)))}
                className="h-9 text-center"
              />
            </div>
          </div>

          {/* Kids section */}
          <div className="space-y-3 p-4 border rounded-lg">
            <div className="flex items-center justify-between">
              <Label className="text-base font-semibold">{t("kids")}</Label>
              <span className="text-sm text-muted-foreground">
                {kidsMinutes >= 60
                  ? `${Math.floor(kidsMinutes / 60)}h${kidsMinutes % 60 > 0 ? ` ${kidsMinutes % 60}m` : ""}`
                  : `${kidsMinutes} ${t("kids_minutes_label")}`}
              </span>
            </div>
            <div className="flex items-center gap-3">
              <Input
                type="number"
                min={0}
                max={600}
                value={kidsMinutes}
                onChange={(e) => {
                  const v = Math.max(0, Math.min(600, Number(e.target.value) || 0));
                  onKidsMinutesChange(v);
                }}
                className="w-24"
              />
              <span className="text-sm text-muted-foreground">{t("kids_minutes_label")}</span>
              <span className="text-xs text-muted-foreground">({t("kids_target")})</span>
            </div>
            {/* Slider + colored progress bar toward 180 min */}
            <div className="space-y-1">
              <Slider
                min={0}
                max={600}
                step={5}
                value={[kidsMinutes]}
                onValueChange={(v) => { const arr = Array.isArray(v) ? v : [v]; onKidsMinutesChange(arr[0]); }}
                className={
                  kidsMinutes >= 180
                    ? "[&_[data-slot=slider-range]]:bg-green-500 [&_[data-slot=slider-thumb]]:border-green-500"
                    : kidsMinutes >= 60
                      ? "[&_[data-slot=slider-range]]:bg-yellow-500 [&_[data-slot=slider-thumb]]:border-yellow-500"
                      : "[&_[data-slot=slider-range]]:bg-red-500 [&_[data-slot=slider-thumb]]:border-red-500"
                }
              />
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>0</span>
                <span>2h</span>
                <span>4h</span>
                <span>6h</span>
                <span>8h</span>
                <span>10h</span>
              </div>
            </div>
          </div>

          {/* General note */}
          <div className="space-y-2">
            <Label>{t("grateful")}</Label>
            <Textarea
              value={generalNote}
              onChange={(e) => onGeneralNoteChange(e.target.value)}
              placeholder={t("grateful_placeholder")}
              rows={3}
            />
          </div>

          {/* Save button */}
          <div className="flex items-center gap-3">
            <Button onClick={onSave} disabled={isPending} className="gap-2">
              <SaveIcon className="size-4" />
              {t("save_day")}
            </Button>
            {saved && (
              <span className="text-sm text-green-600 dark:text-green-400">
                {tc("success")}
              </span>
            )}
          </div>
        </CardContent>
      </Card>
    </ErrorBoundary>
  );
}
