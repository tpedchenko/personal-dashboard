"use client";

import { useTranslations } from "next-intl";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface QuickExpenseDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  accounts: { id: number; name: string }[];
  expenseAccount: string;
  onAccountChange: (value: string) => void;
  expenseAmount: string;
  onAmountChange: (value: string) => void;
  expenseDate: string;
  onDateChange: (value: string) => void;
  boughtItemNames: string[];
  isPending: boolean;
  onSubmit: () => void;
}

export function QuickExpenseDialog({
  open,
  onOpenChange,
  accounts,
  expenseAccount,
  onAccountChange,
  expenseAmount,
  onAmountChange,
  expenseDate,
  onDateChange,
  boughtItemNames,
  isPending,
  onSubmit,
}: QuickExpenseDialogProps) {
  const t = useTranslations("list");
  const tCommon = useTranslations("common");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("add_expense")}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 py-2">
          <div className="grid gap-2">
            <Label>{tCommon("account")}</Label>
            <Select value={expenseAccount} onValueChange={(v) => v && onAccountChange(v)}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {accounts.map((acc) => (
                  <SelectItem key={acc.id} value={acc.name}>
                    {acc.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-2">
            <Label>{tCommon("amount")} (EUR)</Label>
            <Input
              type="number"
              value={expenseAmount}
              onChange={(e) => onAmountChange(e.target.value)}
              placeholder="0.00"
              step="0.01"
            />
          </div>
          <div className="grid gap-2">
            <Label>{tCommon("date")}</Label>
            <Input
              type="date"
              value={expenseDate}
              onChange={(e) => onDateChange(e.target.value)}
            />
          </div>
          <div className="text-muted-foreground text-xs">
            {boughtItemNames.join(", ")}
          </div>
        </div>
        <DialogFooter>
          <DialogClose render={<Button variant="outline" />}>
            {tCommon("cancel")}
          </DialogClose>
          <Button
            onClick={onSubmit}
            disabled={isPending || !expenseAmount || !expenseAccount}
          >
            {tCommon("add")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
