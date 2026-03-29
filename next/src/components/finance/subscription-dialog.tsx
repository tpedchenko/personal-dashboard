"use client";

import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { type SubscriptionData } from "@/actions/finance/subscriptions";

const BILLING_CYCLES = ["monthly", "yearly", "weekly"] as const;
const CATEGORIES = [
  "entertainment",
  "productivity",
  "ai",
  "storage",
  "development",
  "communication",
  "other",
] as const;
const CURRENCIES = ["EUR", "USD", "UAH", "GBP"] as const;

interface SubscriptionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  subscription: SubscriptionData | null;
  onSave: (data: Omit<SubscriptionData, "id">) => void;
  isPending: boolean;
}

export function SubscriptionDialog({
  open,
  onOpenChange,
  subscription,
  onSave,
  isPending,
}: SubscriptionDialogProps) {
  const t = useTranslations("subscriptions");
  const tc = useTranslations("common");

  const [name, setName] = useState("");
  const [provider, setProvider] = useState("");
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState("EUR");
  const [billingCycle, setBillingCycle] = useState("monthly");
  const [nextBilling, setNextBilling] = useState("");
  const [category, setCategory] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [url, setUrl] = useState("");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (subscription) {
      setName(subscription.name);
      setProvider(subscription.provider);
      setAmount(String(subscription.amount));
      setCurrency(subscription.currency);
      setBillingCycle(subscription.billingCycle);
      setNextBilling(subscription.nextBilling || "");
      setCategory(subscription.category || "");
      setIsActive(subscription.isActive);
      setUrl(subscription.url || "");
      setNotes(subscription.notes || "");
    } else {
      setName("");
      setProvider("");
      setAmount("");
      setCurrency("EUR");
      setBillingCycle("monthly");
      setNextBilling("");
      setCategory("");
      setIsActive(true);
      setUrl("");
      setNotes("");
    }
  }, [subscription, open]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const parsed = parseFloat(amount);
    if (!name.trim() || !provider.trim() || isNaN(parsed) || parsed <= 0) return;

    onSave({
      name: name.trim(),
      provider: provider.trim(),
      amount: parsed,
      currency,
      billingCycle,
      nextBilling: nextBilling || null,
      category: category || null,
      isActive,
      url: url.trim() || null,
      notes: notes.trim() || null,
    });
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="max-h-[85dvh] overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{subscription ? t("edit") : t("add")}</SheetTitle>
        </SheetHeader>
        <form onSubmit={handleSubmit} className="space-y-4 p-4">
          <div className="grid gap-4 sm:grid-cols-2">
            {/* Name */}
            <div className="space-y-1.5">
              <Label htmlFor="sub-name">{t("name")}</Label>
              <Input
                id="sub-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="YouTube Premium"
                required
              />
            </div>

            {/* Provider */}
            <div className="space-y-1.5">
              <Label htmlFor="sub-provider">{t("provider")}</Label>
              <Input
                id="sub-provider"
                value={provider}
                onChange={(e) => setProvider(e.target.value)}
                placeholder="Google"
                required
              />
            </div>

            {/* Amount */}
            <div className="space-y-1.5">
              <Label htmlFor="sub-amount">{t("amount")}</Label>
              <Input
                id="sub-amount"
                type="number"
                step="0.01"
                min="0"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="11.99"
                required
              />
            </div>

            {/* Currency */}
            <div className="space-y-1.5">
              <Label>{t("currency")}</Label>
              <Select value={currency} onValueChange={(v) => v && setCurrency(v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CURRENCIES.map((c) => (
                    <SelectItem key={c} value={c}>{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Billing Cycle */}
            <div className="space-y-1.5">
              <Label>{t("billing_cycle")}</Label>
              <Select value={billingCycle} onValueChange={(v) => v && setBillingCycle(v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {BILLING_CYCLES.map((c) => (
                    <SelectItem key={c} value={c}>
                      {t(c as Parameters<typeof t>[0])}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Next Billing */}
            <div className="space-y-1.5">
              <Label htmlFor="sub-next">{t("next_billing")}</Label>
              <Input
                id="sub-next"
                type="date"
                value={nextBilling}
                onChange={(e) => setNextBilling(e.target.value)}
              />
            </div>

            {/* Category */}
            <div className="space-y-1.5">
              <Label>{t("category")}</Label>
              <Select value={category} onValueChange={(v) => v && setCategory(v)}>
                <SelectTrigger>
                  <SelectValue placeholder="—" />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((c) => (
                    <SelectItem key={c} value={c}>
                      {t(c as Parameters<typeof t>[0])}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* URL */}
            <div className="space-y-1.5">
              <Label htmlFor="sub-url">{t("url")}</Label>
              <Input
                id="sub-url"
                type="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://..."
              />
            </div>
          </div>

          {/* Notes */}
          <div className="space-y-1.5">
            <Label htmlFor="sub-notes">{t("notes")}</Label>
            <Input
              id="sub-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={t("notes")}
            />
          </div>

          {/* Active toggle */}
          <div className="flex items-center gap-3">
            <Switch checked={isActive} onCheckedChange={setIsActive} id="sub-active" />
            <Label htmlFor="sub-active">
              {isActive ? t("active") : t("inactive")}
            </Label>
          </div>

          {/* Submit */}
          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              {tc("cancel")}
            </Button>
            <Button type="submit" disabled={isPending}>
              {tc("save")}
            </Button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
}
