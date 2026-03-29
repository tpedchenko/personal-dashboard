"use client";

import { useState, useTransition, useMemo } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Fab } from "@/components/ui/fab";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  type BigPurchaseData,
  addBigPurchase,
  updateBigPurchase,
  startCoolingOff,
  confirmPurchase,
  markPurchased,
  cancelBigPurchase,
  deleteBigPurchase,
  getBigPurchases,
} from "@/actions/finance/shopping";
import { ShoppingSummary } from "./shopping-summary";
import { ShoppingCard } from "./shopping-card";
import { ShoppingDialog } from "./shopping-dialog";
import { cn } from "@/lib/utils";

const STATUS_TABS = ["active", "purchased", "cancelled"] as const;
type StatusTab = (typeof STATUS_TABS)[number];

interface ShoppingPageProps {
  initialItems: BigPurchaseData[];
}

export function ShoppingPage({ initialItems }: ShoppingPageProps) {
  const t = useTranslations("big_purchases");
  const tc = useTranslations("common");
  const [items, setItems] = useState(initialItems);
  const [isPending, startTransition] = useTransition();
  const [activeTab, setActiveTab] = useState<StatusTab>("active");

  // Dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<BigPurchaseData | null>(null);

  // Confirm dialogs
  const [deleteTarget, setDeleteTarget] = useState<BigPurchaseData | null>(null);
  const [confirmTarget, setConfirmTarget] = useState<BigPurchaseData | null>(null);

  const filteredItems = useMemo(() => {
    if (activeTab === "active") {
      return items.filter((i) =>
        ["investigating", "cooling_off", "ready"].includes(i.status),
      );
    }
    return items.filter((i) => i.status === activeTab);
  }, [items, activeTab]);

  const activeItems = useMemo(
    () => items.filter((i) => ["investigating", "cooling_off", "ready"].includes(i.status)),
    [items],
  );

  async function reload() {
    const fresh = await getBigPurchases();
    setItems(fresh);
  }

  function handleAdd() {
    setEditingItem(null);
    setDialogOpen(true);
  }

  function handleEdit(item: BigPurchaseData) {
    setEditingItem(item);
    setDialogOpen(true);
  }

  function handleSave(data: {
    name: string;
    description?: string;
    estimatedPrice?: number;
    currency?: string;
    url?: string;
    category?: string;
    investigateNotes?: string;
    coolingDays?: number;
  }) {
    startTransition(async () => {
      try {
        if (editingItem) {
          await updateBigPurchase(editingItem.id, {
            name: data.name,
            description: data.description || null,
            estimatedPrice: data.estimatedPrice ?? null,
            currency: data.currency,
            url: data.url || null,
            category: data.category || null,
            investigateNotes: data.investigateNotes || null,
            coolingDays: data.coolingDays,
          });
        } else {
          await addBigPurchase(data);
        }
        await reload();
        setDialogOpen(false);
        setEditingItem(null);
        toast.success(t("saved"));
      } catch {
        toast.error(tc("error"));
      }
    });
  }

  function handleStartCooling(item: BigPurchaseData) {
    startTransition(async () => {
      try {
        await startCoolingOff(item.id);
        await reload();
        toast.success(t("cooling_started"));
      } catch {
        toast.error(tc("error"));
      }
    });
  }

  function handleConfirmRequest(item: BigPurchaseData) {
    setConfirmTarget(item);
  }

  function handleConfirmPurchase() {
    if (!confirmTarget) return;
    startTransition(async () => {
      try {
        await confirmPurchase(confirmTarget.id);
        await reload();
        setConfirmTarget(null);
        toast.success(t("confirmed"));
      } catch (e) {
        toast.error(e instanceof Error ? e.message : tc("error"));
      }
    });
  }

  function handleMarkPurchased(item: BigPurchaseData) {
    startTransition(async () => {
      try {
        await markPurchased(item.id);
        await reload();
        toast.success(t("purchased"));
      } catch {
        toast.error(tc("error"));
      }
    });
  }

  function handleCancel(item: BigPurchaseData) {
    startTransition(async () => {
      try {
        await cancelBigPurchase(item.id);
        await reload();
        toast.success(t("cancelled"));
      } catch {
        toast.error(tc("error"));
      }
    });
  }

  function handleDeleteRequest(item: BigPurchaseData) {
    setDeleteTarget(item);
  }

  function handleConfirmDelete() {
    if (!deleteTarget) return;
    startTransition(async () => {
      try {
        await deleteBigPurchase(deleteTarget.id);
        setItems((prev) => prev.filter((i) => i.id !== deleteTarget.id));
        setDeleteTarget(null);
        toast.success(t("deleted"));
      } catch {
        toast.error(tc("error"));
      }
    });
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      <h1 className="sr-only">{t("title")}</h1>

      <ShoppingSummary items={activeItems} />

      {/* Status tabs */}
      <div className="flex gap-1 rounded-lg bg-muted p-[3px] w-fit">
        {STATUS_TABS.map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={cn(
              "inline-flex items-center justify-center rounded-md px-3 py-1.5 text-sm font-medium transition-all whitespace-nowrap min-h-[44px]",
              activeTab === tab
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {t(`tab_${tab}`)}
          </button>
        ))}
      </div>

      {/* Items grid */}
      {filteredItems.length === 0 ? (
        <div className="rounded-lg border bg-card p-12 text-center text-muted-foreground">
          {t("no_items")}
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filteredItems.map((item) => (
            <ShoppingCard
              key={item.id}
              item={item}
              isPending={isPending}
              onEdit={handleEdit}
              onStartCooling={handleStartCooling}
              onConfirm={handleConfirmRequest}
              onMarkPurchased={handleMarkPurchased}
              onCancel={handleCancel}
              onDelete={handleDeleteRequest}
            />
          ))}
        </div>
      )}

      <Fab aria-label={t("add")} onClick={handleAdd} />

      <ShoppingDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        item={editingItem}
        onSave={handleSave}
        isPending={isPending}
      />

      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
        title={t("delete_confirm")}
        confirmLabel={tc("delete")}
        cancelLabel={tc("cancel")}
        onConfirm={handleConfirmDelete}
        destructive
      />

      <ConfirmDialog
        open={confirmTarget !== null}
        onOpenChange={(open) => {
          if (!open) setConfirmTarget(null);
        }}
        title={t("confirm_title")}
        description={t("confirm_description")}
        confirmLabel={t("confirm_yes")}
        cancelLabel={tc("cancel")}
        onConfirm={handleConfirmPurchase}
      />
    </div>
  );
}
