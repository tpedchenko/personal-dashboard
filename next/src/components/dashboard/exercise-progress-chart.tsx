"use client";

import { DumbbellIcon } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  BarChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  ComposedChart,
} from "recharts";
import type {
  ExerciseProgressPoint,
  ExerciseOption,
  WeeklyMuscleVolumeRow,
} from "@/actions/dashboard";
import { useChartColors } from "@/hooks/use-chart-colors";

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

export interface ExerciseProgressChartProps {
  exerciseList: ExerciseOption[];
  selectedExerciseId: number | null;
  exerciseProgress: ExerciseProgressPoint[];
  weeklyMuscleVolume: WeeklyMuscleVolumeRow[];
  tooltipStyle: React.CSSProperties;
  onExerciseChange: (value: string | null) => void;
  labels: {
    exerciseProgress: string;
    selectExercise: string;
    noDataExercise: string;
    maxWeight: string;
    est1rm: string;
    volume: string;
    weeklyMuscleVolume: string;
    weeklyDuration?: string;
    muscleGroupLabel: (key: string) => string;
  };
}

/* ------------------------------------------------------------------ */
/* Component                                                           */
/* ------------------------------------------------------------------ */

export function ExerciseProgressChart({
  exerciseList,
  selectedExerciseId,
  exerciseProgress,
  weeklyMuscleVolume,
  tooltipStyle,
  onExerciseChange,
  labels,
}: ExerciseProgressChartProps) {
  const { colors: CC, muscleGroupColors } = useChartColors();

  if (exerciseList.length === 0 && weeklyMuscleVolume.length === 0) return null;

  const allMuscleGroups = Array.from(
    new Set(weeklyMuscleVolume.flatMap((row) => Object.keys(row).filter((k) => k !== "week"))),
  );

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4">
        {/* Exercise Progress Chart */}
        {exerciseList.length > 0 && (
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between gap-2">
                <CardTitle className="text-base">{labels.exerciseProgress}</CardTitle>
                <Select
                  value={selectedExerciseId?.toString() ?? ""}
                  onValueChange={onExerciseChange}
                >
                  <SelectTrigger className="w-full max-w-md">
                    <SelectValue placeholder={labels.selectExercise} />
                  </SelectTrigger>
                  <SelectContent>
                    {exerciseList.map((ex) => (
                      <SelectItem key={ex.id} value={ex.id.toString()}>
                        {ex.nameUa || ex.name} ({ex.usageCount}\u00D7)
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </CardHeader>
            <CardContent>
              <div className="h-48 sm:h-[300px]">
                {exerciseProgress.length === 0 ? (
                  <div className="flex items-center justify-center h-full">
                    <p className="text-sm text-muted-foreground">{labels.noDataExercise}</p>
                  </div>
                ) : (
                  <figure role="img" style={{ height: "100%" }} aria-label="Графік прогресу вправи">
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={exerciseProgress.map((p) => ({
                      date: p.date.slice(5),
                      est1rm: p.est1rm,
                      maxWeight: p.maxWeight,
                      volume: p.totalVolume,
                    }))}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                      <XAxis dataKey="date" className="text-xs" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
                      <YAxis yAxisId="weight" className="text-xs" />
                      <YAxis yAxisId="volume" orientation="right" className="text-xs" />
                      <Tooltip contentStyle={tooltipStyle} allowEscapeViewBox={{ x: true }} />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                      <Bar
                        yAxisId="volume"
                        dataKey="volume"
                        fill={CC.exerciseVolume}
                        radius={[2, 2, 0, 0]}
                        name={labels.volume}
                        opacity={0.6}
                      />
                      <Line
                        yAxisId="weight"
                        type="monotone"
                        dataKey="maxWeight"
                        stroke={CC.exerciseWeight}
                        strokeWidth={2}
                        dot={{ r: 3 }}
                        name={labels.maxWeight}
                        connectNulls
                      />
                      <Line
                        yAxisId="weight"
                        type="monotone"
                        dataKey="est1rm"
                        stroke={CC.exercise1RM}
                        strokeWidth={2}
                        dot={{ r: 3 }}
                        name={labels.est1rm}
                        connectNulls
                      />
                    </ComposedChart>
                  </ResponsiveContainer>
                  </figure>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Weekly Muscle Volume */}
        {weeklyMuscleVolume.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{labels.weeklyMuscleVolume}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-48 sm:h-[300px]">
                <figure role="img" style={{ height: "100%" }} aria-label="Графік об'єму м'язових груп по тижнях">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={weeklyMuscleVolume}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                    <XAxis dataKey="week" className="text-xs" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
                    <YAxis className="text-xs" />
                    <Tooltip contentStyle={tooltipStyle} allowEscapeViewBox={{ x: true }} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    {allMuscleGroups.filter(mg => !mg.startsWith("_")).map((mg) => (
                      <Bar
                        key={mg}
                        dataKey={mg}
                        stackId="muscles"
                        fill={muscleGroupColors[mg] ?? muscleGroupColors[mg.charAt(0).toUpperCase() + mg.slice(1)] ?? CC.muscleOther}
                        name={labels.muscleGroupLabel(mg)}
                      />
                    ))}
                  </BarChart>
                </ResponsiveContainer>
                </figure>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Weekly Training Duration */}
        {weeklyMuscleVolume.length > 0 && weeklyMuscleVolume.some(r => Number(r._durationMin ?? 0) > 0) && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{labels.weeklyDuration || "Training Duration (weekly)"}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-40 sm:h-[200px]">
                <figure role="img" style={{ height: "100%" }} aria-label="Графік тривалості тренувань по тижнях">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={weeklyMuscleVolume}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                    <XAxis dataKey="week" className="text-xs" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
                    <YAxis className="text-xs" unit=" min" />
                    <Tooltip contentStyle={tooltipStyle} formatter={(v) => `${v} min`} />
                    <Bar dataKey="_durationMin" fill={CC.exerciseDuration} radius={[4, 4, 0, 0]} name="Duration" />
                  </BarChart>
                </ResponsiveContainer>
                </figure>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
