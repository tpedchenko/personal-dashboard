import { getReportingOverview, getUaTaxOverview, type UaTaxOverview } from "@/actions/reporting";
import { getEsTaxOverview, type EsTaxOverview } from "@/actions/reporting/es-tax";
import { ReportingDashboard } from "@/components/reporting/reporting-dashboard";
import { UaTaxDashboard } from "@/components/reporting/ua-tax-dashboard";
import { EsTaxSection } from "@/components/reporting/es-tax-section";
import { FinanceSubTabs } from "@/components/shared/finance-sub-tabs";
import { ModuleGate } from "@/components/shared/module-gate";

export default async function ReportingPage() {
  const [overview, uaTaxData, esTaxData] = await Promise.all([
    getReportingOverview(),
    getUaTaxOverview().catch((): UaTaxOverview => ({
      currentYear: new Date().getFullYear(),
      years: [],
      budgetBalance: 0,
      declarationCount: 0,
    })),
    // Load current year first; if empty, try previous year (tax declarations are usually for prev year)
    getEsTaxOverview().then(async (data) => {
      if (data.documents.length === 0) {
        const prev = await getEsTaxOverview(new Date().getFullYear() - 1);
        if (prev.documents.length > 0) return prev;
      }
      return data;
    }).catch((): EsTaxOverview => ({
      year: new Date().getFullYear(),
      nominas: [],
      totalGross: 0, totalBaseIrpf: 0, totalIrpfWithheld: 0, totalSS: 0, totalNetPay: 0,
      avgIrpfRate: 0, monthsUploaded: 0,
      investments: [], totalDividends: 0, totalCapitalGains: 0, totalCapitalLosses: 0, totalInvestmentWithheld: 0,
      certificado: null, verification: null, irpfComparison: null, documents: [],
    })),
  ]);

  return (
    <ModuleGate moduleKey="reporting">
    <div className="space-y-3">
      <FinanceSubTabs />
      <div className="space-y-6">
      <ReportingDashboard overview={overview} />
      {uaTaxData.declarationCount > 0 && <UaTaxDashboard data={uaTaxData} />}
      <EsTaxSection initialData={esTaxData} />
      </div>
    </div>
    </ModuleGate>
  );
}
