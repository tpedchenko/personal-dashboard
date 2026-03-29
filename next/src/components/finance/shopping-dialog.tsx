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
import { Textarea } from "@/components/ui/textarea";
import { type BigPurchaseData } from "@/actions/finance/shopping";

const CATEGORIES = [
  "electronics",
  "furniture",
  "appliances",
  "transport",
  "clothing",
  "sports",
  "home",
  "other",
] as const;

const CURRENCIES = ["EUR", "USD", "UAH", "GBP"] as const;

const COOLING_OPTIONS = [
  { value: 7, label: "1 week" },
  { value: 14, label: "2 weeks" },
  { value: 30, label: "1 month" },
] as const;

interface ShoppingDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  item: BigPurchaseData | null;
  onSave: (data: {
    name: string;
    description?: string;
    estimatedPrice?: number;
    currency?: string;
    url?: string;
    category?: string;
    investigateNotes?: string;
    coolingDays?: number;
  }) => void;
  isPending: boolean;
}

export function ShoppingDialog({
  open,
  onOpenChange,
  item,
  onSave,
  isPending,
}: ShoppingDialogProps) {
  const t = useTranslations("big_purchases");
  const tc = useTranslations("common");

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [estimatedPrice, setEstimatedPrice] = useState("");
  const [currency, setCurrency] = useState("EUR");
  const [url, setUrl] = useState("");
  const [category, setCategory] = useState("");
  const [investigateNotes, setInvestigateNotes] = useState("");
  const [coolingDays, setCoolingDays] = useState("7");

  useEffect(() => {
    if (item) {
      setName(item.name);
      setDescription(item.description || "");
      setEstimatedPrice(item.estimatedPrice != null ? String(item.estimatedPrice) : "");
      setCurrency(item.currency);
      setUrl(item.url || "");
      setCategory(item.category || "");
      setInvestigateNotes(item.investigateNotes || "");
      setCoolingDays(String(item.coolingDays));
    } else {
      setName("");
      setDescription("");
      setEstimatedPrice("");
      setCurrency("EUR");
      setUrl("");
      setCategory("");
      setInvestigateNotes("");
      setCoolingDays("7");
    }
  }, [item, open]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;

    const price = parseFloat(estimatedPrice);

    onSave({
      name: name.trim(),
      description: description.trim() || undefined,
      estimatedPrice: isNaN(price) ? undefined : price,
      currency,
      url: url.trim() || undefined,
      category: category || undefined,
      investigateNotes: investigateNotes.trim() || undefined,
      coolingDays: parseInt(coolingDays) || 7,
    });
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="max-h-[85dvh] overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{item ? t("edit") : t("add")}</SheetTitle>
        </SheetHeader>
        <form onSubmit={handleSubmit} className="space-y-4 p-4">
          <div className="grid gap-4 sm:grid-cols-2">
            {/* Name */}
            <div className="space-y-1.5">
              <Label htmlFor="bp-name">{t("name")}</Label>
              <Input
                id="bp-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t("name_placeholder")}
                required
              />
            </div>

            {/* Category */}
            <div className="space-y-1.5">
              <Label>{t("category")}</Label>
              <Select value={category} onValueChange={(v) => v && setCategory(v)}>
                <SelectTrigger>
                  <SelectValue placeholder="--" />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((c) => (
                    <SelectItem key={c} value={c}>
                      {t(`cat_${c}` as Parameters<typeof t>[0])}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Estimated Price */}
            <div className="space-y-1.5">
              <Label htmlFor="bp-price">{t("estimated_price")}</Label>
              <Input
                id="bp-price"
                type="number"
                step="0.01"
                min="0"
                value={estimatedPrice}
                onChange={(e) => setEstimatedPrice(e.target.value)}
                placeholder="999.99"
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

            {/* URL */}
            <div className="space-y-1.5">
              <Label htmlFor="bp-url">{t("url")}</Label>
              <Input
                id="bp-url"
                type="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://..."
              />
            </div>

            {/* Cooling Days */}
            <div className="space-y-1.5">
              <Label>{t("cooling_period")}</Label>
              <Select value={coolingDays} onValueChange={(v) => v && setCoolingDays(v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {COOLING_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={String(opt.value)}>
                      {t(`cooling_${opt.value}d` as Parameters<typeof t>[0])}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Description */}
          <div className="space-y-1.5">
            <Label htmlFor="bp-desc">{t("description")}</Label>
            <Input
              id="bp-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t("description_placeholder")}
            />
          </div>

          {/* Research Notes */}
          <div className="space-y-1.5">
            <Label htmlFor="bp-notes">{t("research_notes")}</Label>
            <Textarea
              id="bp-notes"
              value={investigateNotes}
              onChange={(e) => setInvestigateNotes(e.target.value)}
              placeholder={t("research_placeholder")}
              rows={4}
            />
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
