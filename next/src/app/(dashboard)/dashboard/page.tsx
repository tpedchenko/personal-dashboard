import { Suspense } from "react";
import {
  getDashboardKPIs,
  getMonthlyTrends,
  getLifestyleCorrelations,
  getMonthlyDeepDive,
  getGarminHealthTrends,
  getMoodTimeline,
  getHRVTrend,
  getExerciseList,
  getWeeklyMuscleVolume,
  getExtendedCorrelations,
  type MonthlyTrend,
  type CorrelationPoint,
  type MonthlyDeepDive as MonthlyDeepDiveType,
  type GarminHealthTrends,
  type MoodTimelinePoint,
  type HRVTrendPoint,
  type ExerciseOption,
  type WeeklyMuscleVolumeRow,
  type ExtendedCorrelations,
} from "@/actions/dashboard";
import { getTradingOverview } from "@/actions/trading";
import { DashboardPage } from "@/components/dashboard/dashboard-page";
import { DashboardDataHydrator } from "@/components/dashboard/dashboard-data-hydrator";
import { DeferredDashboardProvider } from "@/components/dashboard/dashboard-context";
import { FirstVisitBanner } from "@/components/shared/first-visit-banner";
import { KpiGridSkeleton } from "@/components/dashboard/dashboard-skeletons";
import { ModuleGate } from "@/components/shared/module-gate";

function currentYearRange(): { from: string; to: string } {
  const now = new Date();
  const y = now.getFullYear();
  const from = `${y}-01-01`;
  const m = now.getMonth();
  const d = now.getDate();
  const to = `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  return { from, to };
}

export default function DashboardPageRoute({ tab }: { tab?: "life" | "finance" | "training" }) {
  return (
    <ModuleGate moduleKey="dashboard">
      <FirstVisitBanner moduleKey="Dashboard" />
      <DeferredDashboardProvider>
        <Suspense fallback={<div className="space-y-6"><KpiGridSkeleton /></div>}>
          <PrimaryDashboardContent tab={tab ?? "life"} />
        </Suspense>
      </DeferredDashboardProvider>
    </ModuleGate>
  );
}

/* ------------------------------------------------------------------ */
/* Primary: starts ALL fetches, awaits only KPIs, streams the rest     */
/* ------------------------------------------------------------------ */

async function PrimaryDashboardContent({ tab }: { tab: "life" | "finance" | "training" }) {
  const period = currentYearRange();
  const year = new Date().getFullYear();
  const yearRange = { from: `${year}-01-01`, to: `${year}-12-31` };
  const daysFromStart = Math.max(7, Math.ceil((Date.now() - new Date(period.from).getTime()) / 86400000));
  const weeks = Math.max(1, Math.ceil(daysFromStart / 7));

  // Start ALL fetches in parallel immediately
  const kpisPromise = getDashboardKPIs(period);
  const lifePromise = Promise.all([
    getGarminHealthTrends(daysFromStart),
    getMoodTimeline(yearRange),
    getHRVTrend(daysFromStart),
    getLifestyleCorrelations(period),
    getExtendedCorrelations(period),
  ]);
  const financePromise = Promise.all([
    getMonthlyTrends(year),
    getMonthlyDeepDive(period),
  ]);
  const trainingPromise = Promise.all([
    getExerciseList(),
    getWeeklyMuscleVolume(weeks),
  ]);
  const tradingPromise = getTradingOverview().catch(() => null);

  // Only await KPIs — the shell renders as soon as this resolves
  const kpis = await kpisPromise;

  return (
    <>
      <DashboardPage
        initialKpis={kpis}
        initialPeriod={period}
        activeTab={tab}
      />

      {/* Secondary data streams in via Suspense as each promise resolves */}
      <Suspense fallback={null}>
        <LifeDataResolver dataPromise={lifePromise} />
      </Suspense>
      <Suspense fallback={null}>
        <FinanceDataResolver dataPromise={financePromise} />
      </Suspense>
      <Suspense fallback={null}>
        <TrainingDataResolver dataPromise={trainingPromise} />
      </Suspense>
      <Suspense fallback={null}>
        <TradingDataResolver dataPromise={tradingPromise} />
      </Suspense>
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Secondary resolvers — await already-started promises and hydrate    */
/* ------------------------------------------------------------------ */

async function LifeDataResolver({
  dataPromise,
}: {
  dataPromise: Promise<[GarminHealthTrends, MoodTimelinePoint[], HRVTrendPoint[], CorrelationPoint[], ExtendedCorrelations]>;
}) {
  const [garminHealth, moodTimeline, hrvTrend, correlations, extendedCorrelations] = await dataPromise;

  return (
    <>
      <DashboardDataHydrator slot="garminHealth" data={garminHealth} />
      <DashboardDataHydrator slot="moodTimeline" data={moodTimeline} />
      <DashboardDataHydrator slot="hrvTrend" data={hrvTrend} />
      <DashboardDataHydrator slot="correlations" data={correlations} />
      <DashboardDataHydrator slot="extendedCorrelations" data={extendedCorrelations} />
    </>
  );
}

async function FinanceDataResolver({
  dataPromise,
}: {
  dataPromise: Promise<[MonthlyTrend[], MonthlyDeepDiveType]>;
}) {
  const [trends, deepDive] = await dataPromise;

  return (
    <>
      <DashboardDataHydrator slot="trends" data={trends} />
      <DashboardDataHydrator slot="deepDive" data={deepDive} />
    </>
  );
}

async function TrainingDataResolver({
  dataPromise,
}: {
  dataPromise: Promise<[ExerciseOption[], WeeklyMuscleVolumeRow[]]>;
}) {
  const [exerciseList, weeklyMuscleVolume] = await dataPromise;

  return (
    <>
      <DashboardDataHydrator slot="exerciseList" data={exerciseList} />
      <DashboardDataHydrator slot="weeklyMuscleVolume" data={weeklyMuscleVolume} />
    </>
  );
}

async function TradingDataResolver({
  dataPromise,
}: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  dataPromise: Promise<any>;
}) {
  const tradingOverview = await dataPromise;

  const tradingPnL = tradingOverview && !tradingOverview.error ? {
    totalFiat: tradingOverview.profit?.profit_all_fiat ?? 0,
    totalPct: tradingOverview.profit?.profit_all_percent_sum ?? 0,
    currency: tradingOverview.config?.stake_currency ?? "USDT",
    openTrades: tradingOverview.openTrades.length,
  } : null;

  return <DashboardDataHydrator slot="tradingPnL" data={tradingPnL} />;
}
