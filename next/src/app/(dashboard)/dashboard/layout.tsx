import { DashboardSubTabs } from "@/components/shared/dashboard-sub-tabs";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-4">
      <DashboardSubTabs />
      {children}
    </div>
  );
}
