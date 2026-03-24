import { getActiveItems, getBoughtItems } from "@/actions/shopping";
import { ShoppingList } from "@/components/shopping/shopping-list";
import { FirstVisitBanner } from "@/components/shared/first-visit-banner";
import { ModuleGate } from "@/components/shared/module-gate";
import { InsightsPanel } from "@/components/insights/insights-panel";

export default async function ListPage() {
  const [activeItems, boughtItems] = await Promise.all([
    getActiveItems(),
    getBoughtItems(),
  ]);

  const allItems = [...activeItems, ...boughtItems];

  return (
    <ModuleGate moduleKey="list">
      <div className="py-4">
        <FirstVisitBanner moduleKey="List" />
        <ShoppingList initialItems={allItems} />
        <InsightsPanel page="list" />
      </div>
    </ModuleGate>
  );
}
