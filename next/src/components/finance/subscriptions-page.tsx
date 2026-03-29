"use client";

import { useState, useTransition, useMemo } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Fab } from "@/components/ui/fab";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  type SubscriptionData,
  addSubscription,
  updateSubscription,
  deleteSubscription,
} from "@/actions/finance/subscriptions";
import { SubscriptionSummary } from "./subscription-summary";
import { SubscriptionList } from "./subscription-list";
import { SubscriptionDialog } from "./subscription-dialog";

interface SubscriptionsPageProps {
  initialSubscriptions: SubscriptionData[];
}

export function SubscriptionsPage({ initialSubscriptions }: SubscriptionsPageProps) {
  const t = useTranslations("subscriptions");
  const tc = useTranslations("common");
  const [subscriptions, setSubscriptions] = useState(initialSubscriptions);
  const [isPending, startTransition] = useTransition();

  // Dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingSub, setEditingSub] = useState<SubscriptionData | null>(null);

  // Confirm delete
  const [deleteTarget, setDeleteTarget] = useState<SubscriptionData | null>(null);

  const activeSubscriptions = useMemo(
    () => subscriptions.filter((s) => s.isActive),
    [subscriptions],
  );

  function handleAdd() {
    setEditingSub(null);
    setDialogOpen(true);
  }

  function handleEdit(sub: SubscriptionData) {
    setEditingSub(sub);
    setDialogOpen(true);
  }

  function handleDeleteRequest(sub: SubscriptionData) {
    setDeleteTarget(sub);
  }

  function handleToggleActive(sub: SubscriptionData) {
    startTransition(async () => {
      try {
        await updateSubscription(sub.id, { isActive: !sub.isActive });
        setSubscriptions((prev) =>
          prev.map((s) => (s.id === sub.id ? { ...s, isActive: !s.isActive } : s)),
        );
        toast.success(t("saved"));
      } catch {
        toast.error("Error");
      }
    });
  }

  async function handleSave(data: Omit<SubscriptionData, "id">) {
    startTransition(async () => {
      try {
        if (editingSub) {
          await updateSubscription(editingSub.id, data);
          setSubscriptions((prev) =>
            prev.map((s) => (s.id === editingSub.id ? { ...s, ...data } : s)),
          );
        } else {
          await addSubscription({
            name: data.name,
            provider: data.provider,
            amount: data.amount,
            currency: data.currency,
            billingCycle: data.billingCycle,
            nextBilling: data.nextBilling ?? undefined,
            category: data.category ?? undefined,
            isActive: data.isActive,
            url: data.url ?? undefined,
            notes: data.notes ?? undefined,
          });
          // Reload from server to get the new ID
          const { getSubscriptions } = await import("@/actions/finance/subscriptions");
          const fresh = await getSubscriptions();
          setSubscriptions(fresh);
        }
        setDialogOpen(false);
        setEditingSub(null);
        toast.success(t("saved"));
      } catch {
        toast.error("Error");
      }
    });
  }

  function handleConfirmDelete() {
    if (!deleteTarget) return;
    startTransition(async () => {
      try {
        await deleteSubscription(deleteTarget.id);
        setSubscriptions((prev) => prev.filter((s) => s.id !== deleteTarget.id));
        setDeleteTarget(null);
        toast.success(t("deleted"));
      } catch {
        toast.error("Error");
      }
    });
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      <h1 className="sr-only">{t("title")}</h1>

      <SubscriptionSummary subscriptions={activeSubscriptions} />

      <SubscriptionList
        subscriptions={subscriptions}
        isPending={isPending}
        onEdit={handleEdit}
        onDelete={handleDeleteRequest}
        onToggleActive={handleToggleActive}
      />

      <Fab aria-label={t("add")} onClick={handleAdd} />

      <SubscriptionDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        subscription={editingSub}
        onSave={handleSave}
        isPending={isPending}
      />

      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}
        title={t("delete_confirm")}
        confirmLabel={tc("delete")}
        cancelLabel={tc("cancel")}
        onConfirm={handleConfirmDelete}
        destructive
      />
    </div>
  );
}
