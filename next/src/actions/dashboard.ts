// Re-export everything from the dashboard directory modules
export {
  getDashboardKPIs,
  type KpiPeriodData,
  type DashboardKPIs,
} from "./dashboard/kpi";

export { previousPeriodRange, pearsonR } from "./dashboard/utils";

export {
  getMonthlyTrends,
  getMultiYearTrends,
  getYearComparison,
  type MonthlyTrend,
  type YearComparisonMonth,
  type YearComparisonData,
} from "./dashboard/trends";

export {
  getLifestyleCorrelations,
  getExtendedCorrelations,
  getWellbeingAnalytics,
  type CorrelationPoint,
  type WellbeingTimelinePoint,
  type MoodByWeekday,
  type WellbeingAnalytics,
  type PearsonCorrelation,
  type ExtendedCorrelations,
} from "./dashboard/analytics";

export {
  getRecentActivity,
  getMonthlyDeepDive,
  type RecentActivityItem,
  type CategoryBreakdownRow,
  type DailySpending,
  type MonthlyDeepDive,
} from "./dashboard/activity";

export {
  getGarminHealthTrends,
  getHRVTrend,
  getMoodTimeline,
  getAllDailyLogs,
  getFullMoodTimeline,
  type GarminDayPoint,
  type GarminSleepPoint,
  type GarminWeightPoint,
  type GarminHealthTrends,
  type MoodTimelinePoint,
  type HRVTrendPoint,
} from "./dashboard/health";

export {
  getGymDashboard,
  getExerciseList,
  getExerciseProgress,
  getWeeklyMuscleVolume,
  type GymWorkoutSummary,
  type MuscleGroupVolume,
  type GymDashboardData,
  type ExerciseProgressPoint,
  type ExerciseOption,
  type WeeklyMuscleVolumeRow,
} from "./dashboard/fitness";
