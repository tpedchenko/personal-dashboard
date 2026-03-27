"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Loader2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { toast } from "sonner";
import { updateTransaction, deleteTransaction } from "@/actions/finance";
import type { Transaction, AccountData } from "./finance-types";

interface TransactionEditDialogProps {
  editTx: Transaction | null;
  onClose: () => void;
  accounts: AccountData[];
  categories: string[];
  onSaved: () => void;
}

export function TransactionEditDialog({
  editTx,
  onClose,
  accounts,
  categories,
  onSaved,
}: TransactionEditDialogProps) {
  const t = useTranslations("finance");
  const tc = useTranslations("common");

  const [editDate, setEditDate] = useState("");
  const [editType, setEditType] = useState("");
  const [editAccount, setEditAccount] = useState("");
  const [editCategory, setEditCategory] = useState("");
  const [editAmount, setEditAmount] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editSaving, setEditSaving] = useState(false);

  // Sync state when editTx changes
  const [prevTxId, setPrevTxId] = useState<number | null>(null);
  if (editTx && editTx.id !== prevTxId) {
    setPrevTxId(editTx.id);
    setEditDate(editTx.date);
    setEditType(editTx.type ?? "EXPENSE");
    setEditAccount(editTx.account ?? "");
    setEditCategory(editTx.category ?? "");
    setEditAmount(String(Math.abs(editTx.amountEur ?? 0)));
    setEditDescription(editTx.description ?? "");
  }
  if (!editTx && prevTxId !== null) {
    setPrevTxId(null);
  }

  async function handleSaveEdit() {
    if (!editTx) return;
    setEditSaving(true);
    try {
      await updateTransaction(editTx.id, {
        date: editDate,
        type: editType,
        account: editAccount,
        category: editCategory,
        amountOriginal: parseFloat(editAmount) || 0,
        amountEur: parseFloat(editAmount) || 0,
        description: editDescription,
      });
      toast.success(tc("saved"));
      onClose();
      onSaved();
    } catch {
      toast.error(tc("error"));
    } finally {
      setEditSaving(false);
    }
  }

  return (
    <Dialog open={editTx !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{tc("edit")}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label className="text-xs">{t("date")}</Label>
            <Input type="date" value={editDate} onChange={(e) => setEditDate(e.target.value)} />
          </div>
          <div>
            <Label className="text-xs">{tc("type")}</Label>
            <select
              className="h-9 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm dark:bg-input/30"
              value={editType}
              onChange={(e) => setEditType(e.target.value)}
            >
              <option value="INCOME">{t("income")}</option>
              <option value="EXPENSE">{t("expense")}</option>
            </select>
          </div>
          <div>
            <Label className="text-xs">{t("account")}</Label>
            <select
              className="h-9 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm dark:bg-input/30"
              value={editAccount}
              onChange={(e) => setEditAccount(e.target.value)}
            >
              <option value="">---</option>
              {accounts.map((a) => (
                <option key={a.name} value={a.name}>{a.name}</option>
              ))}
            </select>
          </div>
          <div>
            <Label className="text-xs">{t("category")}</Label>
            <select
              className="h-9 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm dark:bg-input/30"
              value={editCategory}
              onChange={(e) => setEditCategory(e.target.value)}
            >
              <option value="">---</option>
              {categories.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
          <div>
            <Label className="text-xs">{t("amount")} (EUR)</Label>
            <Input type="number" step="0.01" value={editAmount} onChange={(e) => setEditAmount(e.target.value)} />
          </div>
          <div>
            <Label className="text-xs">{t("note")}</Label>
            <Input value={editDescription} onChange={(e) => setEditDescription(e.target.value)} />
          </div>
          <div className="flex gap-2 pt-2">
            <Button onClick={handleSaveEdit} disabled={editSaving} className="flex-1">
              {editSaving ? <Loader2Icon className="size-4 animate-spin" /> : tc("save")}
            </Button>
            <Button variant="outline" onClick={onClose}>{tc("cancel")}</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

interface TransactionDeleteDialogProps {
  deleteId: number | null;
  onClose: () => void;
  onConfirm: () => void;
}

export function TransactionDeleteDialog({ deleteId, onClose, onConfirm }: TransactionDeleteDialogProps) {
  const tc = useTranslations("common");

  return (
    <ConfirmDialog
      open={deleteId !== null}
      onOpenChange={(open) => { if (!open) onClose(); }}
      title={tc("delete_confirm")}
      confirmLabel={tc("delete")}
      cancelLabel={tc("cancel")}
      onConfirm={onConfirm}
      destructive
    />
  );
}
