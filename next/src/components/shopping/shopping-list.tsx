"use client";

import { useState, useOptimistic, useTransition, useRef, useMemo } from "react";
import { useTranslations } from "next-intl";
import type { ShoppingItem } from "@/generated/prisma/client";
import { addItem, toggleBought, deleteItem, clearBought } from "@/actions/shopping";
import { toast } from "sonner";
import { ErrorBoundary } from "@/components/shared/error-boundary";
import { usePageShortcuts } from "@/hooks/use-keyboard-shortcuts";
import { optimisticReducer } from "./types";
import { AddItemForm } from "./add-item-form";
import { ShoppingItemRow } from "./shopping-item-row";
import { BoughtItemsSection } from "./bought-items-section";
import { ShoppingHistory } from "./shopping-history";
import { ShoppingStats } from "./shopping-stats";

/* ═══════════════════════════════════════════════════════════════════ */

export function ShoppingList({
  initialItems,
}: {
  initialItems: ShoppingItem[];
}) {
  const t = useTranslations("list");
  const [isPending, startTransition] = useTransition();
  const [optimisticItems, addOptimistic] = useOptimistic(
    initialItems,
    optimisticReducer
  );
  const formRef = useRef<HTMLFormElement>(null);
  const itemInputRef = useRef<HTMLInputElement>(null);

  const activeItems = optimisticItems.filter((item) => !item.boughtAt);
  const boughtItems = optimisticItems.filter((item) => item.boughtAt);

  // Keyboard shortcuts: n → focus add-item input, Escape → blur
  usePageShortcuts(
    useMemo(
      () => ({
        n: () => {
          itemInputRef.current?.focus();
        },
        Escape: () => {
          if (document.activeElement instanceof HTMLElement) {
            document.activeElement.blur();
          }
        },
      }),
      [],
    ),
  );

  /* ── handlers ─────────────────────────────────────────────────── */

  function handleAddItem(formData: FormData) {
    const itemName = (formData.get("itemName") as string).trim();
    const quantity = (formData.get("quantity") as string).trim() || "1";
    if (!itemName) return;

    const tempItem: ShoppingItem = {
      id: -Date.now(),
      itemName,
      quantity,
      addedBy: "app",
      addedAt: new Date(),
      boughtAt: null,
      boughtBy: null,
      userId: 0,
    };

    startTransition(async () => {
      addOptimistic({ type: "add", item: tempItem });
      try {
        await addItem(itemName, quantity);
      } catch {
        toast.error(t("error_add") ?? "Failed to add item");
        throw undefined;
      }
    });

    formRef.current?.reset();
  }

  function handleToggle(id: number) {
    startTransition(async () => {
      addOptimistic({ type: "toggle", id });
      try {
        await toggleBought(id);
      } catch {
        toast.error(t("error_toggle") ?? "Failed to update item");
        throw undefined;
      }
    });
  }

  function handleDelete(id: number) {
    startTransition(async () => {
      addOptimistic({ type: "delete", id });
      try {
        await deleteItem(id);
      } catch {
        toast.error(t("error_delete") ?? "Failed to delete item");
        throw undefined;
      }
    });
  }

  function handleClearBought() {
    startTransition(async () => {
      addOptimistic({ type: "clearBought" });
      try {
        await clearBought();
      } catch {
        toast.error(t("error_clear") ?? "Failed to clear bought items");
        throw undefined;
      }
    });
  }

  return (
    <ErrorBoundary moduleName="Shopping List">
    <div className="mx-auto max-w-lg space-y-6">
      {/* ── Add Item Form ─────────────────────────────────────────── */}
      <AddItemForm
        formRef={formRef}
        itemInputRef={itemInputRef}
        isPending={isPending}
        onSubmit={handleAddItem}
      />

      {/* ── Active Items ──────────────────────────────────────────── */}
      {activeItems.length === 0 ? (
        <p className="text-muted-foreground py-8 text-center text-sm">
          {t("empty")}
        </p>
      ) : (
        <div className="space-y-1">
          <p className="text-muted-foreground mb-2 text-xs">
            {t("active_items", { count: activeItems.length })}
          </p>
          <ul className="space-y-1">
            {activeItems.map((item) => (
              <ShoppingItemRow
                key={item.id}
                item={item}
                bought={false}
                onToggle={handleToggle}
                onDelete={handleDelete}
              />
            ))}
          </ul>
        </div>
      )}

      {/* ── Bought Items (collapsible) ────────────────────────────── */}
      <BoughtItemsSection
        boughtItems={boughtItems}
        isPending={isPending}
        onToggle={handleToggle}
        onDelete={handleDelete}
        onClearBought={handleClearBought}
      />

      {/* ── Purchase History ──────────────────────────────────────── */}
      <ShoppingHistory />

      {/* ── Shopping Stats ────────────────────────────────────────── */}
      <ShoppingStats />
    </div>
    </ErrorBoundary>
  );
}
