/* ------------------------------------------------------------------ */
/* D1.7.1 — Chart color constants & theme-aware runtime resolver       */
/* ------------------------------------------------------------------ */

/**
 * CSS variable name → CHART_COLORS key mapping.
 * Each entry maps a CHART_COLORS key to its corresponding CSS custom property.
 */
const CSS_VAR_MAP = {
  // Income / Expenses
  income: "--chart-income",
  expense: "--chart-expense",
  difference: "--chart-difference",

  // Mood level timeline
  moodPositive: "--chart-mood-positive",
  moodNegative: "--chart-mood-negative",
  moodNeutral: "--chart-mood-neutral",
  moodWarning: "--chart-mood-warning",
  moodReference: "--chart-mood-reference",

  // Sleep phases
  sleepDeep: "--chart-sleep-deep",
  sleepRem: "--chart-sleep-rem",
  sleepLight: "--chart-sleep-light",
  sleepAwake: "--chart-sleep-awake",
  sleepScore: "--chart-sleep-score",
  sleepDuration: "--chart-sleep-duration",
  sleepNeed: "--chart-sleep-need",
  sleepBedtime: "--chart-sleep-bedtime",
  sleepWakeTime: "--chart-sleep-wake",

  // HRV
  hrv: "--chart-hrv",

  // Exercise progress
  exerciseWeight: "--chart-exercise-weight",
  exercise1RM: "--chart-exercise-1rm",
  exerciseVolume: "--chart-exercise-volume",
  exerciseDuration: "--chart-exercise-duration",

  // Muscle groups
  muscleChest: "--chart-muscle-chest",
  muscleBack: "--chart-muscle-back",
  muscleShoulders: "--chart-muscle-shoulders",
  muscleBiceps: "--chart-muscle-biceps",
  muscleTriceps: "--chart-muscle-triceps",
  muscleLegs: "--chart-muscle-legs",
  muscleCore: "--chart-muscle-core",
  muscleOther: "--chart-muscle-other",

  // Health: steps & activity
  steps: "--chart-income", // reuse; overridden below
  activeMin: "--chart-active-min",

  // Health: body composition
  weight: "--chart-exercise-weight", // reuse; overridden below
  bmi: "--chart-bmi",
  bodyFat: "--chart-body-fat",

  // Food / Calories
  calories: "--chart-calories",
  calorieTarget: "--chart-calorie-target",

  // Reporting: UA tax
  uaIncome: "--chart-ua-income",
  uaTax: "--chart-ua-tax",
  uaEsv: "--chart-ua-esv",
  uaVz: "--chart-ua-vz",

  // Reporting: ES tax
  esNeto: "--chart-es-neto",
  esIrpf: "--chart-es-irpf",
  esSs: "--chart-es-ss",

  // General
  positive: "--chart-positive",
  negative: "--chart-negative",
  accent: "--chart-accent",
  muted: "--chart-muted",
  brush: "--chart-brush",
} as const;

// Fix the overrides that share CSS vars — give them their own
// (steps and weight have their own dedicated CSS vars)
(CSS_VAR_MAP as Record<string, string>).steps = "--steps";
(CSS_VAR_MAP as Record<string, string>).weight = "--weight";

/**
 * Static fallback colors for SSR (light theme defaults).
 * Used when `document` is not available.
 */
export const CHART_COLORS = {
  // Income / Expenses
  income: "#22c55e",
  expense: "#ef4444",
  difference: "#8b5cf6",

  // Mood level timeline
  moodPositive: "#22c55e",
  moodNegative: "#ef4444",
  moodNeutral: "#94a3b8",
  moodWarning: "#f97316",
  moodReference: "#64748b",

  // Sleep phases
  sleepDeep: "#1e3a5f",
  sleepRem: "#7c3aed",
  sleepLight: "#60a5fa",
  sleepAwake: "#f87171",
  sleepScore: "#fbbf24",
  sleepDuration: "#60a5fa",
  sleepNeed: "#6b7280",
  sleepBedtime: "#7c3aed",
  sleepWakeTime: "#f59e0b",

  // HRV
  hrv: "#8b5cf6",

  // Exercise progress
  exerciseWeight: "#3b82f6",
  exercise1RM: "#f59e0b",
  exerciseVolume: "#60a5fa",
  exerciseDuration: "#8b5cf6",

  // Muscle groups
  muscleChest: "#ef4444",
  muscleBack: "#3b82f6",
  muscleShoulders: "#eab308",
  muscleBiceps: "#22c55e",
  muscleTriceps: "#a855f7",
  muscleLegs: "#f97316",
  muscleCore: "#ec4899",
  muscleOther: "#6b7280",

  // Health: steps & activity
  steps: "#3b82f6",
  activeMin: "#f59e0b",

  // Health: body composition
  weight: "#60a5fa",
  bmi: "#a78bfa",
  bodyFat: "#f59e0b",

  // Food / Calories
  calories: "#3b82f6",
  calorieTarget: "#ef4444",

  // Reporting: UA tax
  uaIncome: "#3b82f6",
  uaTax: "#22c55e",
  uaEsv: "#f59e0b",
  uaVz: "#a855f7",

  // Reporting: ES tax
  esNeto: "#10b981",
  esIrpf: "#ef4444",
  esSs: "#f59e0b",

  // General
  positive: "#34d399",
  negative: "#f87171",
  accent: "#fbbf24",
  muted: "#6b7280",
  brush: "#6b7280",
} as const;

export type ChartColors = typeof CHART_COLORS;

/**
 * Read chart colors from CSS custom properties at runtime.
 * Falls back to CHART_COLORS defaults when a variable is not set or on server.
 */
export function getChartColors(): ChartColors {
  if (typeof document === "undefined") return CHART_COLORS;

  const style = getComputedStyle(document.documentElement);
  const result = { ...CHART_COLORS } as Record<string, string>;

  for (const [key, cssVar] of Object.entries(CSS_VAR_MAP)) {
    const value = style.getPropertyValue(cssVar).trim();
    if (value) result[key] = value;
  }

  return result as unknown as ChartColors;
}

/**
 * Build tooltip contentStyle that adapts to the current theme.
 * Reads --card and --border CSS variables directly (no hsl wrapper).
 */
export function getTooltipStyle(): React.CSSProperties {
  if (typeof document === "undefined") {
    return {
      backgroundColor: "var(--card)",
      border: "1px solid var(--border)",
      borderRadius: "8px",
    };
  }
  const style = getComputedStyle(document.documentElement);
  return {
    backgroundColor: style.getPropertyValue("--card").trim() || "#ffffff",
    border: `1px solid ${style.getPropertyValue("--border").trim() || "#e2e8f0"}`,
    borderRadius: "8px",
  };
}

/**
 * Derive MUSCLE_GROUP_COLORS from a colors object.
 */
export function getMuscleGroupColors(colors: ChartColors = CHART_COLORS): Record<string, string> {
  return {
    Chest: colors.muscleChest,
    Back: colors.muscleBack,
    Shoulders: colors.muscleShoulders,
    Biceps: colors.muscleBiceps,
    Triceps: colors.muscleTriceps,
    Legs: colors.muscleLegs,
    Core: colors.muscleCore,
    Other: colors.muscleOther,
  };
}

/** Static fallback — uses hardcoded defaults */
export const MUSCLE_GROUP_COLORS: Record<string, string> = getMuscleGroupColors();
