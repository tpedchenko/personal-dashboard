import { getBigPurchases } from "@/actions/finance/shopping";
import { ShoppingPage } from "@/components/finance/shopping-page";
import { ModuleGate } from "@/components/shared/module-gate";

export default async function ShoppingPageRoute() {
  const items = await getBigPurchases();

  return (
    <ModuleGate moduleKey="finance">
      <ShoppingPage initialItems={items} />
    </ModuleGate>
  );
}
