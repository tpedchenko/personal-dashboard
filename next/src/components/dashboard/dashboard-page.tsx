"use client";

import { useState, useEffect, useTransition, useCallback, useMemo } from "react";
import { useTranslations } from "next-intl";
import {
  WalletIcon,
  DumbbellIcon,
  SmileIcon,
  ActivityIcon,
  ZapIcon,
  BanknoteIcon,
  HeartPulseIcon,
  ScaleIcon,
  TrendingUpIcon,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatKidsHours } from "@/lib/utils";
import { PeriodSelector, type PeriodPreset, getDateRange } from "@/components/ui/period-selector";
import {
  getDashboardKPIs,
  getMonthlyTrends,
  getLifestyleCorrelations,
  getMonthlyDeepDive,
  getGarminHealthTrends,
  getMoodTimeline,
  getFullMoodTimeline,
  getAllDailyLogs,
  getHRVTrend,
  getExerciseProgress,
  getWeeklyMuscleVolume,
  getExtendedCorrelations,
  type DashboardKPIs,
  type MonthlyTrend,
  type RecentActivityItem,
  type CorrelationPoint,
  type MonthlyDeepDive,
  type GarminHealthTrends,
  type MoodTimelinePoint,
  type HRVTrendPoint,
  type ExerciseProgressPoint,
  type ExerciseOption,
  type WeeklyMuscleVolumeRow,
  type ExtendedCorrelations,
} from "@/actions/dashboard";

import { ErrorBoundary } from "@/components/shared/error-boundary";
import { EmptyState } from "@/components/shared/empty-state";
import { InsightsPanel } from "@/components/insights/insights-panel";
import { usePageShortcuts } from "@/hooks/use-keyboard-shortcuts";
import { useChartColors } from "@/hooks/use-chart-colors";
import { KpiGrid, type KpiCardProps } from "./kpi-grid";
import { MoodTimeline } from "./mood-timeline";
import { GarminHealthCharts } from "./garmin-health-charts";
import { ExerciseProgressChart } from "./exercise-progress-chart";
import { IncomeExpensesChart } from "./income-expenses-chart";
import { PortfolioHistoryChart, type PortfolioHistoryPoint } from "./portfolio-history-chart";
import {
  KpiGridSkeleton,
  MoodTimelineSkeleton,
  GarminHealthSkeleton,
  ExpenseBreakdownSkeleton,
  ExerciseProgressSkeleton,
  IncomeExpensesSkeleton,
} from "./dashboard-skeletons";
import { useDeferredDashboardData } from "./dashboard-context";

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

interface TradingPnL {
  totalFiat: number;
  totalPct: number;
  currency: string;
  openTrades: number;
}

interface DashboardPageProps {
  initialKpis: DashboardKPIs;
  initialPeriod: { from: string; to: string };
  /* Secondary data — optional, streamed via Suspense */
  initialTrends?: MonthlyTrend[];
  initialActivity?: RecentActivityItem[];
  initialCorrelations?: CorrelationPoint[];
  initialDeepDive?: MonthlyDeepDive;
  initialGarminHealth?: GarminHealthTrends;
  initialMoodTimeline?: MoodTimelinePoint[];
  initialHRVTrend?: HRVTrendPoint[];
  initialExerciseList?: ExerciseOption[];
  initialWeeklyMuscleVolume?: WeeklyMuscleVolumeRow[];
  initialExtendedCorrelations?: ExtendedCorrelations;
  tradingPnL?: TradingPnL | null;
  activeTab?: "life" | "finance" | "training";
  // passthrough for other props
  [key: string]: unknown;
}

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

const MONTH_LABELS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

function pctChange(
  current: number | null | undefined,
  previous: number | null | undefined,
): { pct: number; direction: "up" | "down" | "flat" } | null {
  if (current == null || previous == null || previous === 0) return null;
  const pct = Math.round(((current - previous) / Math.abs(previous)) * 100);
  if (pct === 0) return { pct: 0, direction: "flat" };
  return { pct: Math.abs(pct), direction: pct > 0 ? "up" : "down" };
}


/* ------------------------------------------------------------------ */
/* Component                                                           */
/* ------------------------------------------------------------------ */

function PortfolioSummaryCard({ onHistoryLoaded }: { onHistoryLoaded?: (data: PortfolioHistoryPoint[]) => void }) {
  const tDash = useTranslations("dashboard");
  const [data, setData] = useState<{ totalPortfolio: number; totalPnl: number; positionsCount: number } | null>(null);

  useEffect(() => {
    fetch("/api/capital").then(r => r.ok ? r.json() : null).then(d => {
      if (d) {
        setData({ totalPortfolio: d.totalPortfolio ?? 0, totalPnl: d.totalPnl ?? 0, positionsCount: d.positionsCount ?? 0 });
        // Save today's snapshot
        fetch("/api/portfolio-snapshot", { method: "POST" }).catch(() => {});
      }
    }).catch(() => {});
    // Load portfolio history
    import("@/actions/finance/portfolio-snapshots").then(({ getPortfolioHistory }) => {
      getPortfolioHistory(90).then(history => {
        if (onHistoryLoaded && history.length > 0) onHistoryLoaded(history);
      });
    }).catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!data || (data.totalPortfolio === 0 && data.positionsCount === 0)) {
    return (
      <Card>
        <CardContent>
          <EmptyState
            icon={TrendingUpIcon}
            title={tDash("connect_broker_hint")}
          />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="pt-4">
        <div className="grid grid-cols-3 gap-4 text-center">
          <div>
            <p className="text-xs text-muted-foreground">{tDash("portfolio")}</p>
            <p className="text-lg font-bold">EUR {data.totalPortfolio.toLocaleString("en", { minimumFractionDigits: 2 })}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">{tDash("pnl")}</p>
            <p className={`text-lg font-bold ${data.totalPnl >= 0 ? "text-income" : "text-expense"}`}>
              {data.totalPnl >= 0 ? "+" : ""}EUR {data.totalPnl.toLocaleString("en", { minimumFractionDigits: 2 })}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">{tDash("positions")}</p>
            <p className="text-lg font-bold">{data.positionsCount}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export function DashboardPage({
  initialKpis,
  initialTrends,
  initialActivity,
  initialCorrelations,
  initialDeepDive,
  initialGarminHealth,
  initialMoodTimeline,
  initialHRVTrend,
  initialExerciseList,
  initialWeeklyMuscleVolume,
  initialExtendedCorrelations,
  tradingPnL: tradingPnLProp,
  activeTab = "life",
}: DashboardPageProps) {
  const t = useTranslations("dashboard");
  const tPeriod = useTranslations("period");
  const tCommon = useTranslations("common");
  const tGym = useTranslations("gym");

  /* ---- Theme-aware chart colors ---- */
  const { tooltipStyle } = useChartColors();

  /* ---- Deferred data from Suspense streaming ---- */
  const deferred = useDeferredDashboardData();

  const [period, setPeriod] = useState<PeriodPreset>("this_year");
  const [dashCustomFrom, setDashCustomFrom] = useState("");
  const [dashCustomTo, setDashCustomTo] = useState("");
  const [kpis, setKpis] = useState<DashboardKPIs>(initialKpis);
  const [trends, setTrends] = useState<MonthlyTrend[]>(initialTrends ?? []);
  const [correlations, setCorrelations] = useState<CorrelationPoint[]>(initialCorrelations ?? []);
  const [deepDive, setDeepDive] = useState<MonthlyDeepDive | null>(initialDeepDive ?? null);
  const [garminHealth, setGarminHealth] = useState<GarminHealthTrends | null>(initialGarminHealth ?? null);
  const [moodTimeline, setMoodTimeline] = useState<MoodTimelinePoint[]>(initialMoodTimeline ?? []);
  const [fullMoodData, setFullMoodData] = useState<MoodTimelinePoint[] | null>(null);
  const [fullChartOpen, setFullChartOpen] = useState(false);
  const [dailyLogsOpen, setDailyLogsOpen] = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [allDailyLogs, setAllDailyLogs] = useState<any[] | null>(null);
  const [hrvTrend, setHRVTrend] = useState<HRVTrendPoint[]>(initialHRVTrend ?? []);
  const [exerciseList, setExerciseList] = useState<ExerciseOption[]>(initialExerciseList ?? []);
  const [selectedExerciseId, setSelectedExerciseId] = useState<number | null>(
    initialExerciseList && initialExerciseList.length > 0 ? initialExerciseList[0].id : null,
  );
  const [exerciseProgress, setExerciseProgress] = useState<ExerciseProgressPoint[]>([]);
  const [weeklyMuscleVolume, setWeeklyMuscleVolume] = useState<WeeklyMuscleVolumeRow[]>(initialWeeklyMuscleVolume ?? []);
  const [extCorrelations, setExtCorrelations] = useState<ExtendedCorrelations | null>(initialExtendedCorrelations ?? null);
  const [capitalEur, setCapitalEur] = useState<number | null>(null);
  const [portfolioHistory, setPortfolioHistory] = useState<PortfolioHistoryPoint[]>([]);
  const [mounted, setMounted] = useState(false);
  const [isPending, startTransition] = useTransition();
  /** Tracks whether user changed period (disables deferred hydration) */
  const [periodChanged, setPeriodChanged] = useState(false);
  const [tradingPnL, setTradingPnL] = useState<TradingPnL | null | undefined>(tradingPnLProp);

  /* ---- Hydrate state from deferred data as it streams in ---- */
  useEffect(() => {
    if (periodChanged) return; // user changed period, ignore deferred data
    if (deferred.trends && trends.length === 0) setTrends(deferred.trends);
    if (deferred.correlations && correlations.length === 0) setCorrelations(deferred.correlations);
    if (deferred.deepDive && !deepDive) setDeepDive(deferred.deepDive);
    if (deferred.garminHealth && !garminHealth) setGarminHealth(deferred.garminHealth);
    if (deferred.moodTimeline && moodTimeline.length === 0) setMoodTimeline(deferred.moodTimeline);
    if (deferred.hrvTrend && hrvTrend.length === 0) setHRVTrend(deferred.hrvTrend);
    if (deferred.exerciseList && exerciseList.length === 0) {
      setExerciseList(deferred.exerciseList);
      if (deferred.exerciseList.length > 0 && selectedExerciseId === null) {
        setSelectedExerciseId(deferred.exerciseList[0].id);
      }
    }
    if (deferred.weeklyMuscleVolume && weeklyMuscleVolume.length === 0) setWeeklyMuscleVolume(deferred.weeklyMuscleVolume);
    if (deferred.extendedCorrelations && !extCorrelations) setExtCorrelations(deferred.extendedCorrelations);
    if (deferred.tradingPnL !== undefined && tradingPnL === undefined) setTradingPnL(deferred.tradingPnL);
  }, [deferred, periodChanged]); // eslint-disable-line react-hooks/exhaustive-deps

  // Keyboard shortcuts: Escape → close full-screen chart dialog
  usePageShortcuts(
    useMemo(
      () => ({
        Escape: () => {
          if (fullChartOpen) setFullChartOpen(false);
          else if (dailyLogsOpen) setDailyLogsOpen(false);
        },
      }),
      [fullChartOpen, dailyLogsOpen],
    ),
  );

  useEffect(() => { setMounted(true); }, []);

  // Load capital via API to avoid server action during render
  useEffect(() => {
    fetch("/api/capital").then(r => r.ok ? r.json() : null).then(data => {
      if (data?.capitalEur != null) setCapitalEur(data.capitalEur);
    }).catch(() => {});
  }, []);

  // Load exercise progress when selectedExerciseId is available
  useEffect(() => {
    if (selectedExerciseId !== null) {
      getExerciseProgress(selectedExerciseId, 180).then(setExerciseProgress);
    }
  }, [selectedExerciseId]);

  const handlePeriodChange = useCallback(
    (preset: PeriodPreset, dateRange: { dateFrom: string; dateTo: string }) => {
      setPeriod(preset);
      setPeriodChanged(true);
      startTransition(async () => {
        try {
          const range = { from: dateRange.dateFrom, to: dateRange.dateTo };
          // Calculate days from today back to range start (not just range width)
          const daysFromStart = Math.max(7, Math.ceil((Date.now() - new Date(range.from).getTime()) / 86400000));
          const weeks = Math.max(1, Math.ceil(daysFromStart / 7));
          const rangeYear = new Date(range.from).getFullYear();
          const [newKpis, newTrends, newCorrelations, newDeepDive, newGarminHealth, newMoodTimeline, newHRVTrend, newWeeklyMuscle, newExtCorr] =
            await Promise.all([
              getDashboardKPIs(range),
              getMonthlyTrends(rangeYear),
              getLifestyleCorrelations(range),
              getMonthlyDeepDive(range),
              getGarminHealthTrends(daysFromStart),
              getMoodTimeline(range),
              getHRVTrend(daysFromStart),
              getWeeklyMuscleVolume(weeks),
              getExtendedCorrelations(range),
            ]);
          setKpis(newKpis);
          setTrends(newTrends);
          setCorrelations(newCorrelations);
          setDeepDive(newDeepDive);
          setGarminHealth(newGarminHealth);
          setMoodTimeline(newMoodTimeline);
          setHRVTrend(newHRVTrend);
          setWeeklyMuscleVolume(newWeeklyMuscle);
          setExtCorrelations(newExtCorr);
        } catch (e) {
          console.error("[Dashboard] Period change error:", e);
        }
      });
    },
    [startTransition],
  );

  const handleExerciseChange = useCallback(
    (value: string | null) => {
      if (!value) return;
      const id = parseInt(value, 10);
      if (isNaN(id)) return;
      setSelectedExerciseId(id);
      startTransition(async () => {
        const progress = await getExerciseProgress(id, 180);
        setExerciseProgress(progress);
      });
    },
    [startTransition],
  );

  const incomeExpensesData = trends.map((m) => ({
    name: MONTH_LABELS[m.month - 1],
    income: m.income,
    expenses: m.expenses,
    expensesByCategory: m.expensesByCategory,
  }));

  const prev = kpis.previousPeriod;

  const lifeCards: KpiCardProps[] = [
    { title: t("mood"), value: kpis.lifestyle.avgMood !== null ? `${kpis.lifestyle.avgMood}` : "\u2014", icon: <SmileIcon className="h-4 w-4" />, change: pctChange(kpis.lifestyle.avgMood, prev?.avgMood), improvementDirection: "up" },
    { title: t("sleep_quality"), value: `${kpis.health.avgSleepScore}`, icon: <ZapIcon className="h-4 w-4" />, change: pctChange(kpis.health.avgSleepScore, prev?.avgSleepScore), improvementDirection: "up" },
    { title: t("steps"), value: `${kpis.health.avgSteps.toLocaleString("en")}`, icon: <ActivityIcon className="h-4 w-4" />, change: pctChange(kpis.health.avgSteps, prev?.avgSteps), improvementDirection: "up" },
    { title: t("weight"), value: kpis.health.latestWeight !== null ? `${kpis.health.latestWeight.toFixed(1)} kg` : "\u2014", icon: <ScaleIcon className="h-4 w-4" />, change: pctChange(kpis.health.latestWeight, prev?.latestWeight), improvementDirection: "down" },
    { title: t("resting_hr"), value: kpis.health.avgRestingHr > 0 ? `${kpis.health.avgRestingHr} bpm` : "\u2014", icon: <HeartPulseIcon className="h-4 w-4" />, change: pctChange(kpis.health.avgRestingHr, prev?.avgRestingHr), improvementDirection: "down" },
    { title: t("sex_bj"), value: `${kpis.lifestyle.totalSex + kpis.lifestyle.totalBj}`, subtitle: `${kpis.lifestyle.totalSex}s / ${kpis.lifestyle.totalBj}b`, icon: <HeartPulseIcon className="h-4 w-4" />, change: pctChange(kpis.lifestyle.totalSex + kpis.lifestyle.totalBj, (prev?.totalSex ?? 0) + (prev?.totalBj ?? 0)), improvementDirection: "up" },
    { title: t("body_battery"), value: kpis.health.avgBodyBattery ? `${kpis.health.avgBodyBattery}%` : "\u2014", icon: <ZapIcon className="h-4 w-4" />, change: pctChange(kpis.health.avgBodyBattery, prev?.avgBodyBattery), improvementDirection: "up" },
  ];

  const financeCards: KpiCardProps[] = [
    ...(capitalEur !== null ? [{ title: t("capital") || "Capital", value: `EUR ${capitalEur.toLocaleString("en")}`, icon: <WalletIcon className="h-4 w-4" /> }] : []),
    { title: `${t("income_vs_expense").split(" vs ")[0] ?? "Income"} / ${t("income_vs_expense").split(" vs ")[1] ?? "Expense"}`, value: `EUR ${kpis.finance.income.toLocaleString("en")}`, subtitle: `-EUR ${kpis.finance.expenses.toLocaleString("en")}`, icon: <BanknoteIcon className="h-4 w-4" /> },
    { title: t("savings_rate") || "Savings", value: `${kpis.finance.savingsRate}%`, icon: <WalletIcon className="h-4 w-4" /> },
    ...(tradingPnL ? [{ title: t("trading_pnl"), value: `${tradingPnL.totalFiat >= 0 ? "+" : ""}${tradingPnL.totalFiat.toFixed(2)}`, subtitle: `${tradingPnL.totalPct.toFixed(1)}% | ${tradingPnL.openTrades} open`, icon: <TrendingUpIcon className="h-4 w-4" /> }] : []),
  ];

  const trainingCards: KpiCardProps[] = [
    { title: t("gym"), value: `${kpis.fitness.gymSessions}`, subtitle: `${kpis.fitness.totalWorkoutMinutes} min`, icon: <DumbbellIcon className="h-4 w-4" />, change: pctChange(kpis.fitness.gymSessions, prev?.gymSessions), improvementDirection: "up" },
    { title: t("steps"), value: `${kpis.health.avgSteps.toLocaleString("en")}`, icon: <ActivityIcon className="h-4 w-4" />, change: pctChange(kpis.health.avgSteps, prev?.avgSteps), improvementDirection: "up" },
    { title: t("resting_hr"), value: kpis.health.avgRestingHr > 0 ? `${kpis.health.avgRestingHr} bpm` : "\u2014", icon: <HeartPulseIcon className="h-4 w-4" />, change: pctChange(kpis.health.avgRestingHr, prev?.avgRestingHr), improvementDirection: "down" },
  ];

  const kpiCards = activeTab === "finance" ? financeCards : activeTab === "training" ? trainingCards : lifeCards;

  return (
    <div className="space-y-6">
      {/* Header + Period Selector */}
      <div className="flex flex-col gap-3">
        <h1 className="sr-only">Dashboard</h1>
        <PeriodSelector
          value={period}
          onChange={handlePeriodChange}
          customFrom={dashCustomFrom}
          customTo={dashCustomTo}
          onCustomChange={(f, t) => { setDashCustomFrom(f); setDashCustomTo(t); }}
        />
      </div>

      {/* KPI Cards */}
      <div aria-live="polite" aria-atomic="true">
      <ErrorBoundary moduleName="KPI Cards">
        {isPending ? <KpiGridSkeleton /> : <KpiGrid cards={kpiCards} />}
      </ErrorBoundary>
      </div>

      {/* === LIFE TAB === */}
      {activeTab === "life" && mounted && <div role="tabpanel" aria-label="Life" aria-live="polite">
      {/* Life Quality Timeline (mood + sex & BJ) */}
      <ErrorBoundary moduleName="Life Quality Timeline">
      {isPending || (!periodChanged && moodTimeline.length === 0 && !deferred.moodTimeline) ? <MoodTimelineSkeleton /> : (
      <MoodTimeline
        moodTimeline={moodTimeline}
        fullMoodData={fullMoodData}
        fullChartOpen={fullChartOpen}
        isPending={isPending}
        titleLabel={t("life_quality")}
        moodLevelLabel={t("mood_level")}
        noDataLabel={t("mood_no_data")}
        tooltipStyle={tooltipStyle}
        onOpenFullChart={() => {
          if (fullMoodData) {
            setFullChartOpen(true);
          } else {
            startTransition(async () => {
              const data = await getFullMoodTimeline();
              setFullMoodData(data);
              setFullChartOpen(true);
            });
          }
        }}
        onFullChartOpenChange={setFullChartOpen}
      />
      )}
      </ErrorBoundary>

      {/* Daily Logs Table (collapsible) */}
      <ErrorBoundary moduleName="Daily Logs">
      <Card>
        <CardHeader
          className="cursor-pointer select-none"
          onClick={() => {
            if (!dailyLogsOpen && !allDailyLogs) {
              startTransition(async () => {
                const logs = await getAllDailyLogs();
                setAllDailyLogs(logs);
                setDailyLogsOpen(true);
              });
            } else {
              setDailyLogsOpen(!dailyLogsOpen);
            }
          }}
        >
          <CardTitle className="text-base flex items-center gap-2">
            {dailyLogsOpen ? "\u25BC" : "\u25B6"} {t("daily_records") || "\u0417\u0430\u043F\u0438\u0441\u0438 \u044F\u043A\u043E\u0441\u0442\u0456 \u0436\u0438\u0442\u0442\u044F"}
          </CardTitle>
        </CardHeader>
        {dailyLogsOpen && allDailyLogs && (
          <CardContent>
            <div className="overflow-x-auto max-h-96">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-background">
                  <tr className="border-b">
                    <th className="text-left py-1.5 px-1">{t("date_col")}</th>
                    <th className="text-center py-1.5 px-1">{t("mood")}</th>
                    <th className="text-center py-1.5 px-1">{t("energy")}</th>
                    <th className="text-center py-1.5 px-1">{t("stress")}</th>
                    <th className="text-center py-1.5 px-1">{t("focus")}</th>
                    <th className="text-center py-1.5 px-1">{t("kids")}</th>
                    <th className="text-center py-1.5 px-1">{t("sex")}</th>
                    <th className="text-center py-1.5 px-1">{t("bj")}</th>
                    <th className="text-center py-1.5 px-1">{t("alc")}</th>
                    <th className="text-center py-1.5 px-1">{t("caf")}</th>
                    <th className="text-center py-1.5 px-1">{t("level")}</th>
                  </tr>
                </thead>
                <tbody>
                  {allDailyLogs.map((log) => (
                    <tr key={log.date} className="border-b last:border-0 hover:bg-muted/50">
                      <td className="py-1.5 px-1 font-mono">{log.date}</td>
                      <td className="text-center py-1.5 px-1">{log.moodDelta ?? "\u2014"}</td>
                      <td className="text-center py-1.5 px-1">{log.energyLevel ?? "\u2014"}</td>
                      <td className="text-center py-1.5 px-1">{log.stressLevel ?? "\u2014"}</td>
                      <td className="text-center py-1.5 px-1">{log.focusQuality ?? "\u2014"}</td>
                      <td className="text-center py-1.5 px-1">{log.kidsHours != null ? formatKidsHours(log.kidsHours) : "\u2014"}</td>
                      <td className="text-center py-1.5 px-1">{log.sexCount ?? "\u2014"}</td>
                      <td className="text-center py-1.5 px-1">{log.bjCount ?? "\u2014"}</td>
                      <td className="text-center py-1.5 px-1">{log.alcohol ?? "\u2014"}</td>
                      <td className="text-center py-1.5 px-1">{log.caffeine ?? "\u2014"}</td>
                      <td className="text-center py-1.5 px-1">
                        <span className={log.level != null ? (log.level >= 2 ? "text-income" : log.level < 0 ? "text-expense" : "") : ""}>
                          {log.level != null ? Number(log.level).toFixed(1) : "\u2014"}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        )}
      </Card>
      </ErrorBoundary>

      {/* Garmin Health Charts (body battery, sleep, steps, HRV, weight) */}
      <ErrorBoundary moduleName="Garmin Health">
      {isPending || !garminHealth ? <GarminHealthSkeleton /> : (
      <GarminHealthCharts
        garminHealth={garminHealth}
        hrvTrend={hrvTrend}
        tooltipStyle={tooltipStyle}
        labels={{
          bodyBattery: t("body_battery"),
          sleepQuality: t("sleep_quality"),
          deep: t("deep"),
          rem: t("rem"),
          light: t("light"),
          awake: t("awake"),
          score: t("score"),
          health: t("health"),
          steps: t("steps"),
          hrvTrend: t("hrv_trend"),
          hrvMs: t("hrv_ms"),
          weightBodyFat: t("weight_body_fat"),
          weightKg: t("weight_kg"),
          bodyFatPct: t("body_fat_pct"),
          stress: t("stress"),
          high: t("high"),
          low: t("low"),
          charged: t("charged"),
          max: t("max"),
          avg: t("avg"),
          fitnessAge: t("fitness_age"),
          weeklyAvg: t("weekly_avg"),
          bmi: t("bmi"),
          activeMin: t("active_min"),
          stepsActiveMin: t("steps_active_min"),
          connectGarminHint: t("connect_garmin_hint"),
          sleepDuration: t("sleep_duration"),
          sleepNeed: t("sleep_need"),
          sleepConsistency: t("sleep_consistency"),
          bedtime: t("bedtime"),
          wakeTime: t("wake_time"),
          avgWeeklySleep: t("avg_weekly_sleep"),
          avgSleepNeed: t("avg_sleep_need"),
          calories: t("calories"),
          activeCalories: t("active_calories"),
          restingCalories: t("resting_calories"),
        }}
      />
      )}
      </ErrorBoundary>

      </div>}

      {/* === FINANCE TAB === */}
      {activeTab === "finance" && mounted && <div role="tabpanel" aria-label="Finance" aria-live="polite">
      {/* Portfolio Summary (from Investments) */}
      <PortfolioSummaryCard onHistoryLoaded={setPortfolioHistory} />

      {/* Portfolio History Chart */}
      <ErrorBoundary moduleName="Portfolio History">
      <PortfolioHistoryChart
        data={portfolioHistory}
        tooltipStyle={tooltipStyle}
        labels={{
          title: t("portfolio_history"),
          capital: t("total_nav"),
          pnl: t("pnl"),
          invested: t("invested"),
        }}
      />
      </ErrorBoundary>

      {/* Expense Breakdown */}
      <ErrorBoundary moduleName={t("expense_breakdown")}>
      {isPending || !deepDive ? <ExpenseBreakdownSkeleton /> : deepDive.categoryBreakdown.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Expense Breakdown</CardTitle>
            <p className="text-sm text-muted-foreground">
              {t("total_expenses_label")}: <span className="font-semibold text-red-400">EUR {deepDive.totalExpenses.toLocaleString("en")}</span>
              {" "} | {t("avg_per_day")}: <span className="font-semibold text-red-400">EUR {deepDive.avgDailyExpense.toLocaleString("en")}</span>
            </p>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {deepDive.categoryBreakdown.map((row) => {
                const barWidth = deepDive.categoryBreakdown[0]
                  ? Math.round((row.amount / deepDive.categoryBreakdown[0].amount) * 100)
                  : 0;
                return (
                  <div key={row.category}>
                    <div className="flex justify-between text-sm mb-1">
                      <span>{row.category}</span>
                      <span className="text-muted-foreground">
                        EUR {row.amount.toLocaleString("en")}
                        <span className="text-xs ml-1 opacity-60">{row.percentage}%</span>
                      </span>
                    </div>
                    <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                      <div
                        className="h-full rounded-full bg-red-400/70"
                        style={{ width: `${barWidth}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}
      </ErrorBoundary>

      {/* Income vs Expenses Chart */}
      <ErrorBoundary moduleName="Income vs Expenses">
      {isPending || (!periodChanged && trends.length === 0 && !deferred.trends) ? <IncomeExpensesSkeleton /> : (
      <IncomeExpensesChart
        chartData={incomeExpensesData}
        titleLabel={t("income_vs_expense")}
        tooltipStyle={tooltipStyle}
        incomeLabel={t("income_chart_label")}
        expensesLabel={t("expenses_chart_label")}
      />
      )}
      </ErrorBoundary>
      </div>}

      {/* === TRAINING TAB === */}
      {activeTab === "training" && mounted && <div role="tabpanel" aria-label="Training" aria-live="polite">
      {/* Exercise Progress + Weekly Muscle Volume */}
      <ErrorBoundary moduleName="Exercise Progress">
      {isPending || (!periodChanged && exerciseList.length === 0 && !deferred.exerciseList) ? <ExerciseProgressSkeleton /> : (
      <ExerciseProgressChart
        exerciseList={exerciseList}
        selectedExerciseId={selectedExerciseId}
        exerciseProgress={exerciseProgress}
        weeklyMuscleVolume={weeklyMuscleVolume}
        tooltipStyle={tooltipStyle}
        onExerciseChange={handleExerciseChange}
        labels={{
          exerciseProgress: tGym("exercise_progress"),
          selectExercise: tGym("select_exercise"),
          noDataExercise: tGym("no_data_exercise"),
          maxWeight: tGym("max_weight"),
          est1rm: tGym("est_1rm"),
          volume: t("volume"),
          weeklyMuscleVolume: tGym("weekly_muscle_volume"),
          muscleGroupLabel: (key: string) => {
            // DB stores lowercase ("chest"), i18n has capitalized ("Chest")
            const capitalized = key.charAt(0).toUpperCase() + key.slice(1);
            return tGym(`muscle_groups.${capitalized}`) || tGym(`muscle_groups.${key}`) || key;
          },
        }}
      />
      )}
      </ErrorBoundary>

      {/* AI Insights for Gym & Exercises */}
      <InsightsPanel page="gym" />
      <InsightsPanel page="exercises" />

      </div>}
    </div>
  );
}
