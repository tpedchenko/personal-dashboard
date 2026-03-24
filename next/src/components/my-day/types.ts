export type DailyLogData = {
  id: number;
  date: string;
  level: number | null;
  moodDelta: number | null;
  sexCount: number | null;
  sexNote: string | null;
  bjCount: number | null;
  bjNote: string | null;
  kidsHours: number | null;
  kidsNote: string | null;
  generalNote: string | null;
  energyLevel: number | null;
  stressLevel: number | null;
  focusQuality: number | null;
  alcohol: number | null;
  caffeine: number | null;
  createdAt: Date | null;
} | null;

export type GarminData = {
  date: string;
  steps: number | null;
  caloriesTotal: number | null;
  restingHr: number | null;
  avgStress: number | null;
  bodyBatteryHigh: number | null;
  sleepScore: number | null;
  sleepSeconds: number | null;
  hrvLastNight: number | null;
  hrvWeeklyAvg: number | null;
  trainingReadinessScore: number | null;
  [key: string]: unknown;
} | null;

export type GarminSleepData = {
  date: string;
  durationSeconds: number | null;
  sleepScore: number | null;
  deepSeconds: number | null;
  lightSeconds: number | null;
  remSeconds: number | null;
  awakeSeconds: number | null;
  [key: string]: unknown;
} | null;

export type RecentLogEntry = {
  id: number;
  date: string;
  level: number | null;
  moodDelta: number | null;
  energyLevel: number | null;
  stressLevel: number | null;
  focusQuality: number | null;
  kidsHours: number | null;
  kidsNote: string | null;
  generalNote: string | null;
  alcohol: number | null;
  caffeine: number | null;
  sexCount: number | null;
  bjCount: number | null;
};

export function formatDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function getMoodEmoji(level: number): { emoji: string; color: string; label: string } {
  if (level < -3) return { emoji: "\u{1F631}", color: "#dc2626", label: "Terrible" };
  if (level < -2) return { emoji: "\u{1F624}", color: "#ef4444", label: "Very bad" };
  if (level < -1) return { emoji: "\u{1F614}", color: "#f97316", label: "Bad" };
  if (level < 2)  return { emoji: "\u{1F610}", color: "#94a3b8", label: "Normal" };
  if (level < 3)  return { emoji: "\u{1F642}", color: "#22c55e", label: "Good" };
  return { emoji: "\u{1F604}", color: "#a855f7", label: "Wonderful" };
}

export function formatSleepDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  return `${hours}h${mins}m`;
}

export function getColorForValue(value: number, thresholds: { red: number; yellow: number; green: number }, higherIsBetter = true): string {
  if (higherIsBetter) {
    if (value >= thresholds.green) return "text-green-500";
    if (value >= thresholds.yellow) return "text-yellow-500";
    return "text-red-500";
  }
  // Lower is better (e.g., resting HR)
  if (value <= thresholds.green) return "text-green-500";
  if (value <= thresholds.yellow) return "text-yellow-500";
  return "text-red-500";
}
