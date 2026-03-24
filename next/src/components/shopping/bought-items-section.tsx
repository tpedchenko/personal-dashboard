"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import type { ShoppingItem } from "@/generated/prisma/client";
import { Button } from "@/components/ui/button";
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from "@/components/ui/accordion";
import { ShoppingCart, Receipt, Send } from "lucide-react";
import { toast } from "sonner";
import {
  addQuickExpense,
  sendShoppingReport,
  getShoppingAccounts,
} from "@/actions/shopping";
import { toDateStr } from "./types";
import { ShoppingItemRow } from "./shopping-item-row";
import { QuickExpenseDialog } from "./quick-expense-dialog";

interface BoughtItemsSectionProps {
  boughtItems: ShoppingItem[];
  isPending: boolean;
  onToggle: (id: number) => void;
  onDelete: (id: number) => void;
  onClearBought: () => void;
}

export function BoughtItemsSection({
  boughtItems,
  isPending,
  onToggle,
  onDelete,
  onClearBought,
}: BoughtItemsSectionProps) {
  const t = useTranslations("list");
  const [, startTransition] = useTransition();

  /* ── Quick Expense state ─────────────────────────────────────── */
  const [expenseDialogOpen, setExpenseDialogOpen] = useState(false);
  const [expenseAccount, setExpenseAccount] = useState("");
  const [expenseAmount, setExpenseAmount] = useState("");
  const [expenseDate, setExpenseDate] = useState(toDateStr(new Date()));
  const [accounts, setAccounts] = useState<{ id: number; name: string }[]>([]);

  async function openExpenseDialog() {
    const accs = await getShoppingAccounts();
    setAccounts(accs.map((a) => ({ id: a.id, name: a.name })));
    if (accs.length > 0 && !expenseAccount) {
      setExpenseAccount(accs[0].name);
    }
    setExpenseDate(toDateStr(new Date()));
    setExpenseAmount("");
    setExpenseDialogOpen(true);
  }

  function handleAddExpense() {
    if (!expenseAccount || !expenseAmount) return;
    const items = boughtItems.map((item) => item.itemName);
    startTransition(async () => {
      await addQuickExpense({
        account: expenseAccount,
        amount: parseFloat(expenseAmount),
        date: expenseDate,
        items,
      });
      setExpenseDialogOpen(false);
      toast.success(t("add_expense"));
    });
  }

  function handleSendReport() {
    startTransition(async () => {
      await sendShoppingReport();
      toast.success(t("send_report"));
    });
  }

  if (boughtItems.length === 0) return null;

  return (
    <Accordion>
      <AccordionItem value="bought">
        <AccordionTrigger>
          <div className="flex items-center gap-2">
            <ShoppingCart className="size-4 text-muted-foreground" />
            <span>
              {t("bought")} ({boughtItems.length})
            </span>
          </div>
        </AccordionTrigger>
        <AccordionContent>
          <ul className="space-y-1">
            {boughtItems.map((item) => (
              <ShoppingItemRow
                key={item.id}
                item={item}
                bought
                onToggle={onToggle}
                onDelete={onDelete}
              />
            ))}
          </ul>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              variant="destructive"
              size="sm"
              onClick={onClearBought}
              disabled={isPending}
            >
              {t("clear_bought")}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={openExpenseDialog}
              disabled={isPending}
              className="gap-1"
            >
              <Receipt className="size-3.5" />
              {t("quick_expense")}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleSendReport}
              disabled={isPending}
              className="gap-1"
            >
              <Send className="size-3.5" />
              {t("send_report")}
            </Button>
          </div>

          <QuickExpenseDialog
            open={expenseDialogOpen}
            onOpenChange={setExpenseDialogOpen}
            accounts={accounts}
            expenseAccount={expenseAccount}
            onAccountChange={setExpenseAccount}
            expenseAmount={expenseAmount}
            onAmountChange={setExpenseAmount}
            expenseDate={expenseDate}
            onDateChange={setExpenseDate}
            boughtItemNames={boughtItems.map((i) => i.itemName)}
            isPending={isPending}
            onSubmit={handleAddExpense}
          />
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
}
