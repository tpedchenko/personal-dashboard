import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

/* ------------------------------------------------------------------ */
/* KPI Grid Skeleton                                                   */
/* ------------------------------------------------------------------ */

function KpiCardSkeleton() {
  return (
    <Card className="metric-card">
      <CardContent className="pt-3 pb-2.5 px-3 sm:pt-4 sm:pb-3 sm:px-4">
        <div className="flex items-center justify-between mb-0.5 sm:mb-1">
          <Skeleton className="h-3 w-16" />
          <Skeleton className="h-4 w-4 rounded hidden sm:block" />
        </div>
        <Skeleton className="h-6 w-20 mt-1" />
        <Skeleton className="h-3 w-14 mt-1.5" />
      </CardContent>
    </Card>
  );
}

export function KpiGridSkeleton({ count = 8 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 xl:grid-cols-8 gap-2 sm:gap-3">
      {Array.from({ length: count }).map((_, i) => (
        <KpiCardSkeleton key={i} />
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Chart Card Skeleton                                                 */
/* ------------------------------------------------------------------ */

export function ChartCardSkeleton({
  titleWidth = "w-32",
  height = "h-64",
}: {
  titleWidth?: string;
  height?: string;
}) {
  return (
    <Card>
      <CardHeader>
        <Skeleton className={`h-5 ${titleWidth}`} />
      </CardHeader>
      <CardContent>
        <Skeleton className={`w-full ${height} rounded-lg`} />
      </CardContent>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/* Section-level skeletons                                             */
/* ------------------------------------------------------------------ */

/** Mood timeline chart skeleton */
export function MoodTimelineSkeleton() {
  return <ChartCardSkeleton titleWidth="w-40" height="h-72" />;
}

/** Garmin health section skeleton (multiple chart cards) */
export function GarminHealthSkeleton() {
  return (
    <div className="space-y-4">
      <ChartCardSkeleton titleWidth="w-28" height="h-56" />
      <ChartCardSkeleton titleWidth="w-32" height="h-56" />
      <ChartCardSkeleton titleWidth="w-24" height="h-56" />
    </div>
  );
}

/** Expense breakdown skeleton */
export function ExpenseBreakdownSkeleton() {
  return (
    <Card>
      <CardHeader>
        <Skeleton className="h-5 w-40" />
        <Skeleton className="h-4 w-56 mt-1" />
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i}>
              <div className="flex justify-between mb-1">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-4 w-16" />
              </div>
              <Skeleton className="h-1.5 rounded-full" style={{ width: `${100 - i * 15}%` }} />
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

/** Exercise progress skeleton */
export function ExerciseProgressSkeleton() {
  return (
    <div className="space-y-4">
      <ChartCardSkeleton titleWidth="w-36" height="h-64" />
      <ChartCardSkeleton titleWidth="w-44" height="h-64" />
    </div>
  );
}

/** Income vs Expenses chart skeleton */
export function IncomeExpensesSkeleton() {
  return <ChartCardSkeleton titleWidth="w-36" height="h-64" />;
}

/** Daily logs card skeleton */
export function DailyLogsSkeleton() {
  return (
    <Card>
      <CardHeader>
        <Skeleton className="h-5 w-48" />
      </CardHeader>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/* Full dashboard skeleton (used for initial page load)                */
/* ------------------------------------------------------------------ */

export function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      <KpiGridSkeleton />
      <MoodTimelineSkeleton />
      <DailyLogsSkeleton />
      <GarminHealthSkeleton />
      <ExpenseBreakdownSkeleton />
      <ExerciseProgressSkeleton />
      <IncomeExpensesSkeleton />
    </div>
  );
}
