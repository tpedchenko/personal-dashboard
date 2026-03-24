import { getInvestmentsSummary } from "@/actions/brokers-common";
import { InvestmentsPage } from "@/components/finance/investments-page";
import { ModuleGate } from "@/components/shared/module-gate";

export default async function InvestmentsPageRoute() {
  const data = await getInvestmentsSummary();

  return (
    <ModuleGate moduleKey="investments">
      <InvestmentsPage initialData={data} />
    </ModuleGate>
  );
}
