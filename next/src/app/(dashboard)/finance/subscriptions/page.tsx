import { getSubscriptions } from "@/actions/finance/subscriptions";
import { SubscriptionsPage } from "@/components/finance/subscriptions-page";
import { ModuleGate } from "@/components/shared/module-gate";

export default async function SubscriptionsPageRoute() {
  const subscriptions = await getSubscriptions();

  return (
    <ModuleGate moduleKey="finance">
      <SubscriptionsPage initialSubscriptions={subscriptions} />
    </ModuleGate>
  );
}
