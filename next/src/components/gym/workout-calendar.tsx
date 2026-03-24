"use client";

import { useState, useCallback } from "react";
import { useTranslations } from "next-intl";
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { todayString } from "@/lib/date-utils";
import { getWorkoutCalendar } from "@/actions/gym";
import type { CalendarDayData } from "@/actions/gym";

export function WorkoutCalendar({
  initialData,
  initialYear,
  initialMonth,
}: {
  initialData: CalendarDayData[];
  initialYear: number;
  initialMonth: number;
}) {
  const t = useTranslations("gym");
  const tc = useTranslations("common");

  const [year, setYear] = useState(initialYear);
  const [month, setMonth] = useState(initialMonth);
  const [data, setData] = useState<CalendarDayData[]>(initialData);
  const [loading, setLoading] = useState(false);
  const [selectedDay, setSelectedDay] = useState<CalendarDayData | null>(null);

  const dayNames: string[] = t.raw("day_names");

  const loadMonth = useCallback(
    async (y: number, m: number) => {
      setLoading(true);
      try {
        const result = await getWorkoutCalendar(y, m);
        setData(result);
      } finally {
        setLoading(false);
      }
    },
    []
  );

  const goToPrevMonth = () => {
    const newMonth = month === 1 ? 12 : month - 1;
    const newYear = month === 1 ? year - 1 : year;
    setMonth(newMonth);
    setYear(newYear);
    setSelectedDay(null);
    loadMonth(newYear, newMonth);
  };

  const goToNextMonth = () => {
    const newMonth = month === 12 ? 1 : month + 1;
    const newYear = month === 12 ? year + 1 : year;
    setMonth(newMonth);
    setYear(newYear);
    setSelectedDay(null);
    loadMonth(newYear, newMonth);
  };

  // Build calendar grid
  const firstDay = new Date(year, month - 1, 1);
  // Monday-based: 0=Mon, 6=Sun
  const startWeekday = (firstDay.getDay() + 6) % 7;
  const daysInMonth = new Date(year, month, 0).getDate();

  // Map date string -> day data (workouts + garmin readiness)
  const workoutMap = new Map<string, CalendarDayData>();
  for (const d of data) {
    workoutMap.set(d.date, d);
  }

  // Max volume for intensity coloring (only workout days)
  const maxVol = Math.max(...data.filter(d => d.exerciseCount > 0).map((d) => d.totalVolume), 1);

  const getIntensityLabel = (totalVolume: number) => {
    const ratio = totalVolume / maxVol;
    if (ratio < 0.33) return t("light");
    if (ratio < 0.66) return t("medium");
    return t("heavy");
  };

  const monthNames = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
  ];

  const cells: (number | null)[] = [];
  for (let i = 0; i < startWeekday; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  // Pad to complete the last week row
  while (cells.length % 7 !== 0) cells.push(null);

  return (
    <div className="space-y-3">
      {/* Navigation */}
      <div className="flex items-center justify-between">
        <Button variant="ghost" size="sm" onClick={goToPrevMonth} disabled={loading}>
          <ChevronLeftIcon className="size-4" />
          <span className="sr-only">Попередній місяць</span>
        </Button>
        <span className="font-medium text-sm">
          {monthNames[month - 1]} {year}
        </span>
        <Button variant="ghost" size="sm" onClick={goToNextMonth} disabled={loading}>
          <ChevronRightIcon className="size-4" />
          <span className="sr-only">Наступний місяць</span>
        </Button>
      </div>

      {/* Calendar grid */}
      <div className="grid grid-cols-7 gap-px text-center text-xs">
        {dayNames.map((d) => (
          <div key={d} className="py-1 font-medium text-muted-foreground">
            {d}
          </div>
        ))}
        {cells.map((day, i) => {
          if (day === null) {
            return <div key={`empty-${i}`} className="py-2" />;
          }
          const dateStr = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
          const dayData = workoutMap.get(dateStr);
          const isToday = dateStr === todayString();
          const isSelected = selectedDay?.date === dateStr;
          const hasWorkout = dayData && dayData.exerciseCount > 0;
          const hasGarminActivity = dayData && !hasWorkout && dayData.durationMinutes != null;
          const hasReadiness = dayData && !hasWorkout && !hasGarminActivity && dayData.garminReadiness != null;

          return (
            <button
              key={dateStr}
              className={`py-1 px-0.5 rounded-md text-xs relative transition-colors min-h-[3.5rem] flex flex-col items-center justify-start ${
                isToday ? "ring-1 ring-primary" : ""
              } ${isSelected ? "bg-muted" : "hover:bg-muted/50"} ${
                hasWorkout ? "cursor-pointer font-medium bg-primary/10"
                : hasGarminActivity ? "cursor-pointer bg-blue-500/10 text-foreground"
                : "text-muted-foreground"
              }`}
              onClick={() => {
                if (dayData) setSelectedDay(isSelected ? null : dayData);
              }}
            >
              <span>{day}</span>
              {(hasWorkout || hasGarminActivity) && (() => {
                const typeIcon = (dayData!.programType ?? dayData!.workoutName ?? "").toLowerCase();
                const icon = typeIcon.includes("cardio") || typeIcon.includes("run") ? "\u{1F3C3}"
                  : typeIcon.includes("cycl") || typeIcon.includes("bike") || typeIcon.includes("вело") || typeIcon.includes("gravel") ? "\u{1F6B4}"
                  : typeIcon.includes("swim") ? "\u{1F3CA}"
                  : typeIcon.includes("yoga") || typeIcon.includes("stretch") ? "\u{1F9D8}"
                  : "\u{1F3CB}\uFE0F";
                return (
                  <>
                    <span className="text-[10px]">{icon}</span>
                    <span className="text-[10px] leading-tight">
                      {dayData!.durationMinutes ? `${dayData!.durationMinutes}'` : ""}
                    </span>
                  </>
                );
              })()}
              {hasReadiness && (
                <span className={`text-[10px] font-medium ${
                  dayData.garminReadiness! >= 70 ? "text-green-500" :
                  dayData.garminReadiness! >= 40 ? "text-yellow-500" : "text-red-500"
                }`}>
                  {dayData.garminReadiness}%
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Legend */}
      <div className="flex items-center gap-3 justify-center text-[10px] text-muted-foreground">
        <span className="flex items-center gap-1">
          <span className="size-2 rounded-full bg-green-500" /> {t("light")}
        </span>
        <span className="flex items-center gap-1">
          <span className="size-2 rounded-full bg-yellow-500" /> {t("medium")}
        </span>
        <span className="flex items-center gap-1">
          <span className="size-2 rounded-full bg-red-500" /> {t("heavy")}
        </span>
      </div>

      {/* Selected day details */}
      {selectedDay && (
        <Card size="sm">
          <CardContent className="pt-3">
            <div className="space-y-1 text-sm">
              <div className="flex justify-between">
                <span className="font-medium">
                  {selectedDay.workoutName ?? selectedDay.date}
                </span>
                <Badge variant="secondary" className="text-[10px]">
                  {getIntensityLabel(selectedDay.totalVolume)}
                </Badge>
              </div>
              <div className="flex gap-4 text-xs text-muted-foreground flex-wrap">
                {selectedDay.exerciseCount > 0 && (
                  <span>
                    {selectedDay.exerciseCount} {t("exercises").toLowerCase()}
                  </span>
                )}
                {selectedDay.durationMinutes && (
                  <span>
                    {selectedDay.durationMinutes} {t("min")}
                  </span>
                )}
                {selectedDay.totalVolume > 0 && (
                  <span>
                    {t("total_volume_label")}: {selectedDay.totalVolume.toLocaleString("en")} {t("kg")}
                  </span>
                )}
                {selectedDay.calories && (
                  <span>{selectedDay.calories} kcal</span>
                )}
                {selectedDay.avgHr && (
                  <span>HR: {selectedDay.avgHr}</span>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
