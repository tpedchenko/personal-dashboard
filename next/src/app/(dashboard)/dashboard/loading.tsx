import { Skeleton } from "@/components/ui/skeleton";

export default function DashboardLoading() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-10 w-64" />
      <div className="grid gap-3 grid-cols-1 min-[360px]:grid-cols-2 lg:grid-cols-4">
        <Skeleton className="h-24 rounded-xl" />
        <Skeleton className="h-24 rounded-xl" />
        <Skeleton className="h-24 rounded-xl" />
        <Skeleton className="h-24 rounded-xl" />
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <Skeleton className="h-48 rounded-xl sm:h-72" />
        <Skeleton className="h-48 rounded-xl sm:h-72" />
      </div>
    </div>
  );
}
