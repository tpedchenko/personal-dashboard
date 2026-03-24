/**
 * Shared gym intensity constants.
 *
 * INTENSITY_OPTIONS — the canonical set used in the AddSetDialog picker.
 * ALL_INTENSITY_VALUES — superset that includes legacy values for backward compatibility.
 */

export const INTENSITY_OPTIONS = ["warmup", "easy", "normal", "hard", "limit"] as const;
export type Intensity = (typeof INTENSITY_OPTIONS)[number];

/** Legacy values that may exist in the database from older UI versions. */
export const LEGACY_INTENSITY_VALUES = ["1-2 fail", "tech-fail", "full-fail"] as const;

/** Every intensity value the system may encounter (current + legacy). */
export const ALL_INTENSITY_VALUES = [
  ...INTENSITY_OPTIONS,
  ...LEGACY_INTENSITY_VALUES,
] as const;
export type AnyIntensity = (typeof ALL_INTENSITY_VALUES)[number];

// ---------------------------------------------------------------------------
// Colors
// ---------------------------------------------------------------------------

/** Tailwind text-color classes for Select / Badge usage. */
export const INTENSITY_COLORS: Record<string, string> = {
  warmup: "text-gray-400",
  easy: "text-green-400",
  normal: "text-amber-500",
  hard: "text-red-500",
  limit: "text-red-400",
  // legacy
  "1-2 fail": "text-red-500",
  "tech-fail": "text-red-500",
  "full-fail": "text-red-400",
};

/** Active / inactive button styles for the segmented control in AddSetDialog. */
export const INTENSITY_STYLES: Record<
  Intensity,
  { active: string; inactive: string }
> = {
  warmup: {
    active: "bg-gray-500 text-white",
    inactive: "text-gray-400 hover:bg-gray-500/10",
  },
  easy: {
    active: "bg-green-600 text-white",
    inactive: "text-green-500 hover:bg-green-600/10",
  },
  normal: {
    active: "bg-amber-500 text-white",
    inactive: "text-amber-500 hover:bg-amber-500/10",
  },
  hard: {
    active: "bg-red-600 text-white",
    inactive: "text-red-500 hover:bg-red-600/10",
  },
  limit: {
    active: "bg-red-900 text-white",
    inactive: "text-red-400 hover:bg-red-900/10",
  },
};

/** Hex border colors used in ExerciseExecutionScreen intensity bars. */
const INTENSITY_BORDER_COLORS: Record<string, string> = {
  warmup: "#6b7280",
  easy: "#22c55e",
  normal: "#f59e0b",
  hard: "#ef4444",
  limit: "#7f1d1d",
  // legacy
  "1-2 fail": "#ef4444",
  "tech-fail": "#991b1b",
  "full-fail": "#991b1b",
};

/** Return a hex color for an intensity value (defaults to amber / "normal"). */
export function getIntensityColor(intensity: string | null): string {
  return INTENSITY_BORDER_COLORS[intensity || "normal"] || "#f59e0b";
}
