"use client";

import { MaximizeIcon } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  ComposedChart,
  ReferenceLine,
  Brush,
} from "recharts";
import type { MoodTimelinePoint } from "@/actions/dashboard";
import { CHART_COLORS, type ChartColors } from "@/lib/chart-theme";
import { useChartColors } from "@/hooks/use-chart-colors";
import { EmptyState } from "@/components/shared/empty-state";
import { SmileIcon } from "lucide-react";

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

export interface MoodTimelineProps {
  moodTimeline: MoodTimelinePoint[];
  fullMoodData: MoodTimelinePoint[] | null;
  fullChartOpen: boolean;
  isPending: boolean;
  titleLabel: string;
  moodLevelLabel: string;
  noDataLabel?: string;
  tooltipStyle: React.CSSProperties;
  onOpenFullChart: () => void;
  onFullChartOpenChange: (open: boolean) => void;
}

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

const moodColor = (v: number | null, cc: ChartColors = CHART_COLORS) => {
  if (v == null) return cc.moodNeutral;
  if (v <= -4) return cc.moodNegative;
  if (v <= -2) return cc.moodWarning;
  if (v >= 2) return cc.moodPositive;
  return cc.moodNeutral;
};

interface ChartPoint {
  date: string;
  fullDate: string;
  mood: number | null;
  sex: number;
  bj: number;
}

function toChartData(points: MoodTimelinePoint[]): ChartPoint[] {
  return points.map((p) => ({
    date: p.date.slice(5),
    fullDate: p.date,
    mood: p.level ?? null,
    sex: p.sexCount && p.sexCount > 0 ? p.sexCount : 0,
    bj: p.bjCount && p.bjCount > 0 ? p.bjCount : 0,
  }));
}

function buildGradientStops(data: { mood: number | null }[], cc: ChartColors = CHART_COLORS) {
  const validPoints = data.map((d, i) => ({ i, mood: d.mood })).filter(p => p.mood != null);
  if (validPoints.length < 2) return null;
  const total = data.length - 1;
  return validPoints.map(p => {
    const offset = `${(p.i / total) * 100}%`;
    const color = moodColor(p.mood, cc);
    return { offset, color };
  });
}

/* ------------------------------------------------------------------ */
/* Component                                                           */
/* ------------------------------------------------------------------ */

export function MoodTimeline({
  moodTimeline,
  fullMoodData,
  fullChartOpen,
  isPending,
  titleLabel,
  moodLevelLabel,
  noDataLabel,
  tooltipStyle,
  onOpenFullChart,
  onFullChartOpenChange,
}: MoodTimelineProps) {
  const { colors: CC } = useChartColors();

  if (moodTimeline.length === 0) {
    return (
      <Card>
        <CardContent>
          <EmptyState
            icon={SmileIcon}
            title={noDataLabel || "Add mood entries to see the chart"}
          />
        </CardContent>
      </Card>
    );
  }

  const chartData = toChartData(moodTimeline);

  const renderMoodChart = (data: ChartPoint[], height: string, showBrush?: boolean) => {
    const gradientStops = buildGradientStops(data, CC);
    const gradientId = showBrush ? "moodGradientFull" : "moodGradient";
    return (
      <div className={height}>
        <figure role="img" style={{ height: "100%" }} aria-label="Графік настрою за період">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 5, right: 5, bottom: showBrush ? 30 : 5, left: 0 }}>
            <defs>
              {gradientStops && (
                <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="0">
                  {gradientStops.map((s, i) => (
                    <stop key={i} offset={s.offset} stopColor={s.color} />
                  ))}
                </linearGradient>
              )}
            </defs>
            <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
            <XAxis dataKey={showBrush ? "fullDate" : "date"} className="text-xs" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
            <YAxis yAxisId="mood" className="text-xs" domain={[-5, 5]} ticks={[-5, -4, -2, 0, 2, 4, 5]} />
            <ReferenceLine yAxisId="mood" y={0} stroke={CC.moodReference} strokeWidth={1.5} />
            <ReferenceLine yAxisId="mood" y={-2} stroke={CC.moodWarning} strokeDasharray="4 4" strokeOpacity={0.4} />
            <ReferenceLine yAxisId="mood" y={-4} stroke={CC.moodNegative} strokeDasharray="4 4" strokeOpacity={0.4} />
            <Tooltip contentStyle={tooltipStyle} />
            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
            <Legend
              wrapperStyle={{ fontSize: 11 }}
              {...{ payload: [
                { value: moodLevelLabel, type: "line" as const, color: CC.moodPositive },
                { value: "\u2764\uFE0F Sex", type: "circle" as const, color: "#f472b6" },
                { value: "\uD83D\uDC9C BJ", type: "circle" as const, color: "#c084fc" },
              ] } as any}
            />
            <Line
              yAxisId="mood"
              type="monotone"
              dataKey="mood"
              connectNulls
              name={moodLevelLabel}
              strokeWidth={2.5}
              stroke={gradientStops ? `url(#${gradientId})` : CC.moodPositive}
              dot={({ cx, cy, payload }: { cx?: number; cy?: number; payload: { sex: number; bj: number; mood: number | null } }) => {
                if (payload.mood == null) return <g key={cx} />;
                const hasSex = payload.sex > 0;
                const hasBj = payload.bj > 0;
                if (hasSex || hasBj) {
                  return (
                    <g key={`${cx}-${cy}`}>
                      <text x={cx} y={(cy ?? 0) - 8} textAnchor="middle" fontSize={hasSex && hasBj ? 8 : 10}>
                        {hasSex && hasBj ? "\uD83D\uDC95" : hasSex ? "\u2764\uFE0F" : "\uD83D\uDC9C"}
                      </text>
                    </g>
                  );
                }
                return <g key={cx} />;
              }}
            />
            {showBrush && (
              <Brush
                dataKey="fullDate"
                height={25}
                stroke={CC.brush}
                travellerWidth={10}
                startIndex={Math.max(0, data.length - 90)}
              />
            )}
          </ComposedChart>
        </ResponsiveContainer>
        </figure>
      </div>
    );
  };

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle className="text-base">{titleLabel}</CardTitle>
        <Button
          variant="ghost"
          size="sm"
          className="h-8"
          disabled={isPending}
          onClick={onOpenFullChart}
        >
          <MaximizeIcon className="size-4" />
        </Button>
      </CardHeader>
      <CardContent>
        {renderMoodChart(chartData, "h-48 sm:h-72")}
      </CardContent>
      <Dialog open={fullChartOpen} onOpenChange={onFullChartOpenChange}>
        <DialogContent className="max-w-[98vw] sm:max-w-[95vw] w-full h-[85vh] sm:h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>{titleLabel}</DialogTitle>
          </DialogHeader>
          <div className="flex-1 min-h-0">
            {fullMoodData ? renderMoodChart(
              toChartData(fullMoodData),
              "h-full",
              true
            ) : (
              <p className="text-center text-muted-foreground py-8">Завантаження...</p>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
