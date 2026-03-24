import { FinanceSubTabs } from "@/components/shared/finance-sub-tabs";

export default function FinanceLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="space-y-3">
      <FinanceSubTabs />
      {children}
    </div>
  );
}
