"use client";

import { useTranslations } from "next-intl";
import { CalendarIcon, StarIcon, Loader2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DialogFooter, DialogClose } from "@/components/ui/dialog";
import { normalizeCurrency } from "./finance-types";
import type { AccountData, NbuRateData, CategoryWithFav } from "./finance-types";

export interface TransactionFormProps {
  // Form state
  formDate: string;
  formType: string;
  formAccount: string;
  formCategory: string;
  formAmount: string;
  formCurrency: string;
  formDescription: string;
  formFromAccount: string;
  formToAccount: string;
  formFromAmount: string;
  formToAmount: string;
  calFormOpen: boolean;
  isPending: boolean;
  // Data
  accounts: AccountData[];
  categoriesWithFavs: CategoryWithFav[];
  nbuRates: NbuRateData[];
  // Setters
  onFormDateChange: (v: string) => void;
  onFormTypeChange: (v: string) => void;
  onFormAccountChange: (v: string) => void;
  onFormCategoryChange: (v: string) => void;
  onFormAmountChange: (v: string) => void;
  onFormCurrencyChange: (v: string) => void;
  onFormDescriptionChange: (v: string) => void;
  onFormFromAccountChange: (v: string) => void;
  onFormToAccountChange: (v: string) => void;
  onFormFromAmountChange: (v: string) => void;
  onFormToAmountChange: (v: string) => void;
  onCalFormOpenChange: (v: boolean) => void;
  // Action
  onSubmit: () => void;
  submitLabel: string;
}

export function TransactionForm({
  formDate,
  formType,
  formAccount,
  formCategory,
  formAmount,
  formCurrency,
  formDescription,
  formFromAccount,
  formToAccount,
  formFromAmount,
  formToAmount,
  calFormOpen,
  isPending,
  accounts,
  categoriesWithFavs,
  nbuRates,
  onFormDateChange,
  onFormTypeChange,
  onFormAccountChange,
  onFormCategoryChange,
  onFormAmountChange,
  onFormCurrencyChange,
  onFormDescriptionChange,
  onFormFromAccountChange,
  onFormToAccountChange,
  onFormFromAmountChange,
  onFormToAmountChange,
  onCalFormOpenChange,
  onSubmit,
  submitLabel,
}: TransactionFormProps) {
  const t = useTranslations("finance");
  const tc = useTranslations("common");

  const handleFromAmountChange = (value: string) => {
    onFormFromAmountChange(value);
    // Auto-calculate to-amount if same currency
    const fromCur = accounts.find((a) => a.name === formFromAccount)?.currency ?? "EUR";
    const toCur = accounts.find((a) => a.name === formToAccount)?.currency ?? "EUR";
    if (fromCur === toCur) {
      onFormToAmountChange(value);
    } else {
      // Cross-convert via NBU rates
      const amt = parseFloat(value);
      if (!isNaN(amt) && amt > 0) {
        const eurRate = nbuRates.find((r) => r.currencyCode === "EUR")?.rate ?? 1;
        const usdRate = nbuRates.find((r) => r.currencyCode === "USD")?.rate ?? 1;
        const toUah = (a: number, cur: string) => {
          if (cur === "UAH") return a;
          if (cur === "EUR") return a * eurRate;
          if (cur === "USD") return a * usdRate;
          return a;
        };
        const fromUah = (uah: number, cur: string) => {
          if (cur === "UAH") return uah;
          if (cur === "EUR") return eurRate > 0 ? uah / eurRate : uah;
          if (cur === "USD") return usdRate > 0 ? uah / usdRate : uah;
          return uah;
        };
        const uah = toUah(amt, fromCur);
        const converted = fromUah(uah, toCur);
        onFormToAmountChange(String(Math.round(converted * 100) / 100));
      }
    }
  };

  const handleToAmountChange = (value: string) => {
    onFormToAmountChange(value);
    // Reverse conversion: recalculate from-amount
    const fromCur = accounts.find((a) => a.name === formFromAccount)?.currency ?? "EUR";
    const toCur = accounts.find((a) => a.name === formToAccount)?.currency ?? "EUR";
    const amt = parseFloat(value);
    if (!isNaN(amt) && amt > 0) {
      const eurRate = nbuRates.find((r) => r.currencyCode === "EUR")?.rate ?? 1;
      const usdRate = nbuRates.find((r) => r.currencyCode === "USD")?.rate ?? 1;
      const toUah = (a: number, cur: string) => {
        if (cur === "UAH") return a;
        if (cur === "EUR") return a * eurRate;
        if (cur === "USD") return a * usdRate;
        return a;
      };
      const fromUahFn = (uah: number, cur: string) => {
        if (cur === "UAH") return uah;
        if (cur === "EUR") return eurRate > 0 ? uah / eurRate : uah;
        if (cur === "USD") return usdRate > 0 ? uah / usdRate : uah;
        return uah;
      };
      const uah = toUah(amt, toCur);
      const converted = fromUahFn(uah, fromCur);
      onFormFromAmountChange(String(Math.round(converted * 100) / 100));
    }
  };

  return (
    <div className="grid gap-3">
      {/* Date */}
      <div className="grid gap-1">
        <Label>{t("date")}</Label>
        <Popover open={calFormOpen} onOpenChange={onCalFormOpenChange}>
          <PopoverTrigger
            render={
              <Button variant="outline" className="w-full justify-start" />
            }
          >
            <CalendarIcon className="mr-2 size-4" />
            {formDate || tc("date")}
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0">
            <Calendar
              mode="single"
              selected={formDate ? new Date(formDate + "T00:00:00") : undefined}
              onSelect={(d) => {
                if (d) {
                  const ds = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
                  onFormDateChange(ds);
                }
                onCalFormOpenChange(false);
              }}
            />
          </PopoverContent>
        </Popover>
      </div>

      {/* Type */}
      <div className="grid gap-1">
        <Label>{tc("type")}</Label>
        <Select
          value={formType}
          onValueChange={(v) => onFormTypeChange(v as string)}
        >
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="EXPENSE">{t("expense")}</SelectItem>
            <SelectItem value="INCOME">{t("income")}</SelectItem>
            <SelectItem value="TRANSFER">{t("transfer")}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Transfer mode fields */}
      {formType === "TRANSFER" ? (
        <>
          {/* From Account + Amount */}
          <div className="grid gap-1">
            <Label>{t("from_account")}</Label>
            <Select
              value={formFromAccount}
              onValueChange={(v) => onFormFromAccountChange(v as string)}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {accounts.map((a) => (
                  <SelectItem key={a.id} value={a.name}>
                    {a.name} ({a.currency})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1">
            <Label>{t("amount")} ({accounts.find((a) => a.name === formFromAccount)?.currency ?? "EUR"})</Label>
            <Input
              type="number"
              step="0.01"
              value={formFromAmount}
              onChange={(e) => handleFromAmountChange(e.target.value)}
              placeholder="0.00"
            />
          </div>

          {/* Arrow */}
          <div className="flex justify-center text-xl text-muted-foreground">→</div>

          {/* To Account + Amount */}
          <div className="grid gap-1">
            <Label>{t("to_account")}</Label>
            <Select
              value={formToAccount}
              onValueChange={(v) => onFormToAccountChange(v as string)}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {accounts
                  .filter((a) => a.name !== formFromAccount)
                  .map((a) => (
                    <SelectItem key={a.id} value={a.name}>
                      {a.name} ({a.currency})
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>
          {(() => {
            const fromCur = accounts.find((a) => a.name === formFromAccount)?.currency ?? "EUR";
            const toCur = accounts.find((a) => a.name === formToAccount)?.currency ?? "EUR";
            if (fromCur === toCur) {
              return (
                <div className="text-xs text-muted-foreground">
                  {tc("from")}: {fromCur} → {tc("to")}: {toCur} — auto-matched
                </div>
              );
            }
            return (
              <div className="grid gap-1">
                <Label>{t("amount")} ({toCur})</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={formToAmount}
                  onChange={(e) => handleToAmountChange(e.target.value)}
                  placeholder="0.00"
                />
              </div>
            );
          })()}
        </>
      ) : (
        <>
          {/* Account */}
          <div className="grid gap-1">
            <Label>{t("account")}</Label>
            <Select
              value={formAccount}
              onValueChange={(v) => {
                onFormAccountChange(v as string);
                const acc = accounts.find((a) => a.name === v);
                if (acc) {
                  const cur = normalizeCurrency(acc.currency);
                  onFormCurrencyChange(cur);
                }
              }}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {accounts.map((a) => (
                  <SelectItem key={a.id} value={a.name}>
                    {a.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Category */}
          <div className="grid gap-1">
            <Label>{t("category")}</Label>
            <Select
              value={formCategory}
              onValueChange={(v) => onFormCategoryChange(v as string)}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder={t("category")} />
              </SelectTrigger>
              <SelectContent>
                {categoriesWithFavs.map((c) => (
                  <SelectItem key={c.category} value={c.category}>
                    <span className="flex items-center gap-1.5">
                      {c.isFavourite && <StarIcon className="size-3 text-yellow-500 fill-yellow-500" />}
                      {c.category}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Amount + Currency */}
          <div className="grid grid-cols-3 gap-2">
            <div className="col-span-2 grid gap-1">
              <Label>{t("amount")}</Label>
              <Input
                type="number"
                step="0.01"
                value={formAmount}
                onChange={(e) => onFormAmountChange(e.target.value)}
                placeholder="0.00"
              />
            </div>
            <div className="grid gap-1">
              <Label>{t("currency")}</Label>
              <Select
                value={formCurrency}
                onValueChange={(v) => onFormCurrencyChange(v as string)}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="EUR">EUR</SelectItem>
                  <SelectItem value="USD">USD</SelectItem>
                  <SelectItem value="UAH">UAH</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </>
      )}

      {/* Description */}
      <div className="grid gap-1">
        <Label>{tc("description")}</Label>
        <Input
          value={formDescription}
          onChange={(e) => onFormDescriptionChange(e.target.value)}
          placeholder={tc("optional")}
        />
      </div>

      <DialogFooter>
        <DialogClose render={<Button variant="outline" />}>
          {tc("cancel")}
        </DialogClose>
        <Button onClick={onSubmit} disabled={isPending}>
          {isPending && <Loader2Icon className="mr-2 size-4 animate-spin" />}
          {submitLabel}
        </Button>
      </DialogFooter>
    </div>
  );
}
