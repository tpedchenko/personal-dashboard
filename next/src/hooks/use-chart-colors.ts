"use client";

import { useMemo } from "react";
import { useTheme } from "next-themes";
import {
  getChartColors,
  getTooltipStyle,
  getMuscleGroupColors,
  CHART_COLORS,
  type ChartColors,
} from "@/lib/chart-theme";

/**
 * Returns theme-aware chart colors by reading CSS custom properties.
 * Re-computes when the theme changes (via next-themes).
 */
export function useChartColors(): {
  colors: ChartColors;
  tooltipStyle: React.CSSProperties;
  muscleGroupColors: Record<string, string>;
} {
  const { resolvedTheme } = useTheme();

  return useMemo(() => {
    // resolvedTheme is used as a dependency to re-compute on theme change.
    // getChartColors() reads from the DOM, which already reflects the new theme.
    const colors = typeof document !== "undefined" ? getChartColors() : CHART_COLORS;
    const tooltipStyle = getTooltipStyle();
    const muscleGroupColors = getMuscleGroupColors(colors);
    return { colors, tooltipStyle, muscleGroupColors };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resolvedTheme]);
}
