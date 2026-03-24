"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { CalendarIcon } from "lucide-react";

export type PeriodPreset =
  | "today"
  | "this_week"
  | "prev_week"
  | "this_month"
  | "prev_month"
  | "prev_year"
  | "this_year"
  | "custom"
  | "all";

function toIso(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function getDateRange(preset: PeriodPreset): { dateFrom: string; dateTo: string } {
  const now = new Date();
  const today = toIso(now);

  switch (preset) {
    case "today":
      return { dateFrom: today, dateTo: today };
    case "this_week": {
      const day = now.getDay();
      const diff = day === 0 ? 6 : day - 1; // Monday start
      const monday = new Date(now);
      monday.setDate(now.getDate() - diff);
      return { dateFrom: toIso(monday), dateTo: today };
    }
    case "prev_week": {
      const day = now.getDay();
      const diff = day === 0 ? 6 : day - 1;
      const thisMonday = new Date(now);
      thisMonday.setDate(now.getDate() - diff);
      const prevMonday = new Date(thisMonday);
      prevMonday.setDate(thisMonday.getDate() - 7);
      const prevSunday = new Date(thisMonday);
      prevSunday.setDate(thisMonday.getDate() - 1);
      return { dateFrom: toIso(prevMonday), dateTo: toIso(prevSunday) };
    }
    case "this_month": {
      const first = new Date(now.getFullYear(), now.getMonth(), 1);
      return { dateFrom: toIso(first), dateTo: today };
    }
    case "prev_month": {
      const first = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const last = new Date(now.getFullYear(), now.getMonth(), 0);
      return { dateFrom: toIso(first), dateTo: toIso(last) };
    }
    case "prev_year": {
      const first = new Date(now.getFullYear() - 1, 0, 1);
      const last = new Date(now.getFullYear() - 1, 11, 31);
      return { dateFrom: toIso(first), dateTo: toIso(last) };
    }
    case "this_year": {
      const first = new Date(now.getFullYear(), 0, 1);
      return { dateFrom: toIso(first), dateTo: today };
    }
    case "all":
      return { dateFrom: "", dateTo: "" };
    default:
      return { dateFrom: "", dateTo: "" };
  }
}

interface PeriodSelectorProps {
  value: PeriodPreset;
  onChange: (preset: PeriodPreset, range: { dateFrom: string; dateTo: string }) => void;
  customFrom?: string;
  customTo?: string;
  onCustomChange?: (from: string, to: string) => void;
}

export function PeriodSelector({
  value,
  onChange,
  customFrom,
  customTo,
  onCustomChange,
}: PeriodSelectorProps) {
  const t = useTranslations("period");
  const [calFromOpen, setCalFromOpen] = useState(false);
  const [calToOpen, setCalToOpen] = useState(false);

  const presets: PeriodPreset[] = [
    "today",
    "this_week",
    "prev_week",
    "this_month",
    "prev_month",
    "this_year",
    "prev_year",
    "custom",
    "all",
  ];

  return (
    <div className="space-y-2" data-testid="period-selector">
      <div className="flex flex-wrap gap-1">
        {presets.map((preset) => (
          <Button
            key={preset}
            variant={value === preset ? "default" : "outline"}
            size="sm"
            className="text-xs h-7"
            onClick={() => {
              if (preset === "custom") {
                onChange(preset, {
                  dateFrom: customFrom ?? "",
                  dateTo: customTo ?? "",
                });
              } else {
                onChange(preset, getDateRange(preset));
              }
            }}
          >
            {t(preset)}
          </Button>
        ))}
      </div>

      {value === "custom" && (
        <div className="flex items-center gap-2">
          <Popover open={calFromOpen} onOpenChange={setCalFromOpen}>
            <PopoverTrigger
              render={<Button variant="outline" size="sm" className="text-xs h-7 gap-1" />}
            >
              <CalendarIcon className="size-3" />
              {customFrom || "From"}
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="single"
                selected={customFrom ? new Date(customFrom) : undefined}
                onSelect={(date) => {
                  if (date) {
                    const iso = toIso(date);
                    onCustomChange?.(iso, customTo ?? "");
                    onChange("custom", { dateFrom: iso, dateTo: customTo ?? "" });
                  }
                  setCalFromOpen(false);
                }}
                initialFocus
              />
            </PopoverContent>
          </Popover>
          <span className="text-xs text-muted-foreground">—</span>
          <Popover open={calToOpen} onOpenChange={setCalToOpen}>
            <PopoverTrigger
              render={<Button variant="outline" size="sm" className="text-xs h-7 gap-1" />}
            >
              <CalendarIcon className="size-3" />
              {customTo || "To"}
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="single"
                selected={customTo ? new Date(customTo) : undefined}
                onSelect={(date) => {
                  if (date) {
                    const iso = toIso(date);
                    onCustomChange?.(customFrom ?? "", iso);
                    onChange("custom", { dateFrom: customFrom ?? "", dateTo: iso });
                  }
                  setCalToOpen(false);
                }}
                initialFocus
              />
            </PopoverContent>
          </Popover>
        </div>
      )}
    </div>
  );
}
