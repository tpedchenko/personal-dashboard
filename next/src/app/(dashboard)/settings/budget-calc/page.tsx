"use client";

import { useEffect, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import {
  getBudgetConfig,
  saveBudgetConfig,
  getMandatoryCategories,
  addMandatoryCategory,
  removeMandatoryCategory,
  calculateWeeklyBudget,
  getMandatoryCategorySpending,
} from "@/actions/finance";
import { getAllCategoriesFromTransactions } from "@/actions/settings";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { XIcon } from "lucide-react";

type MandatoryCat = { id: number; category: string };

type WeeklyResult = {
  monthlyLimit: number;
  mandatorySpent: number;
  discretionaryBudget: number;
  weeklyBudget: number;
  weeksRemaining: number;
  totalSpent: number;
  discretionarySpent: number;
  remaining: number;
};

type CatSpending = {
  category: string;
  totalSpent: number;
  monthlyAvg: number;
  period: string;
};

export default function BudgetCalcPage() {
  const t = useTranslations("settings");
  const tc = useTranslations("common");
  const [isPending, startTransition] = useTransition();

  const [limitType, setLimitType] = useState("fixed");
  const [limitValue, setLimitValue] = useState("");
  const [mandatoryCats, setMandatoryCats] = useState<MandatoryCat[]>([]);
  const [allCategories, setAllCategories] = useState<string[]>([]);
  const [newMandatoryCat, setNewMandatoryCat] = useState("");
  const [weeklyResult, setWeeklyResult] = useState<WeeklyResult | null>(null);
  const [mandatoryPeriod, setMandatoryPeriod] = useState("last_month");
  const [catSpending, setCatSpending] = useState<CatSpending[]>([]);

  useEffect(() => {
    loadData();
  }, []);

  function loadData() {
    startTransition(async () => {
      try {
        const [config, mCats, cats, weekly, spending] = await Promise.all([
          getBudgetConfig(),
          getMandatoryCategories(),
          getAllCategoriesFromTransactions(),
          calculateWeeklyBudget(mandatoryPeriod),
          getMandatoryCategorySpending(mandatoryPeriod),
        ]);
        if (config) {
          setLimitType(config.limitType);
          setLimitValue(String(config.limitValue));
        }
        setMandatoryCats(mCats);
        setAllCategories(cats);
        setWeeklyResult(weekly);
        setCatSpending(spending);
      } catch (err) {
        console.error("Budget calc load error:", err);
        toast.error("Failed to load budget data");
      }
    });
  }

  function handlePeriodChange(period: string) {
    setMandatoryPeriod(period);
    startTransition(async () => {
      const [spending, weekly] = await Promise.all([
        getMandatoryCategorySpending(period),
        calculateWeeklyBudget(period),
      ]);
      setCatSpending(spending);
      setWeeklyResult(weekly);
    });
  }

  function handleSaveConfig() {
    if (!limitValue) return;
    startTransition(async () => {
      await saveBudgetConfig(limitType, parseFloat(limitValue));
      const weekly = await calculateWeeklyBudget(mandatoryPeriod);
      setWeeklyResult(weekly);
      toast.success(t("save_budget_config"));
    });
  }

  function handleAddMandatory() {
    if (!newMandatoryCat) return;
    startTransition(async () => {
      await addMandatoryCategory(newMandatoryCat);
      setNewMandatoryCat("");
      loadData();
    });
  }

  function handleRemoveMandatory(id: number) {
    startTransition(async () => {
      await removeMandatoryCategory(id);
      loadData();
    });
  }

  const limitTypeLabels: Record<string, string> = {
    fixed: t("budget_limit_fixed"),
    pct_current_income: t("budget_limit_pct_current"),
    pct_avg_income: t("budget_limit_pct_avg"),
  };

  const availableMandatoryCats = allCategories.filter(
    (c) => !mandatoryCats.some((mc) => mc.category === c)
  );

  return (
    <div className="space-y-4">
      {/* Budget Config */}
      <Card className="p-4 space-y-4">
        <h2 className="text-lg font-semibold">{t("budget_auto_calc")}</h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label>{t("budget_limit_type")}</Label>
            <Select value={limitType} onValueChange={(v) => v && setLimitType(v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(limitTypeLabels).map(([key, label]) => (
                  <SelectItem key={key} value={key}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>{t("budget_limit_value")}</Label>
            <Input
              type="number"
              value={limitValue}
              onChange={(e) => setLimitValue(e.target.value)}
              placeholder={limitType === "fixed" ? "EUR" : "%"}
            />
          </div>
        </div>

        <Button onClick={handleSaveConfig} disabled={isPending || !limitValue}>
          {t("save_budget_config")}
        </Button>
      </Card>

      {/* Mandatory Categories */}
      <Card className="p-4 space-y-4">
        <h2 className="text-lg font-semibold">{t("mandatory_categories")}</h2>

        {mandatoryCats.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("no_mandatory_cats")}</p>
        ) : (
          <>
            {/* Period selector for spending calculation */}
            <div className="flex items-center gap-2">
              <Label className="text-sm">{t("spending_period")}:</Label>
              <Select value={mandatoryPeriod} onValueChange={(v) => v && handlePeriodChange(v)}>
                <SelectTrigger className="w-[180px] h-8 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="this_month">{t("this_month")}</SelectItem>
                  <SelectItem value="last_month">{t("last_month")}</SelectItem>
                  <SelectItem value="this_year">{t("this_year")}</SelectItem>
                  <SelectItem value="last_year">{t("last_year")}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Category list with spending amounts */}
            <div className="space-y-2">
              {mandatoryCats.map((mc) => {
                const spending = catSpending.find((cs) => cs.category === mc.category);
                return (
                  <div key={mc.id} className="flex items-center justify-between py-1.5 px-2 rounded-md hover:bg-muted/50">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">{mc.category}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      {spending && (
                        <span className="text-sm font-medium tabular-nums text-muted-foreground">
                          {spending.monthlyAvg.toFixed(2)} EUR/mo
                        </span>
                      )}
                      <button onClick={() => handleRemoveMandatory(mc.id)} className="hover:text-destructive p-1">
                        <XIcon className="size-3" />
                      </button>
                    </div>
                  </div>
                );
              })}
              {catSpending.length > 0 && (
                <div className="flex justify-between border-t pt-2 text-sm font-semibold">
                  <span>{tc("total")}</span>
                  <span className="tabular-nums">
                    {catSpending.reduce((sum, cs) => sum + cs.monthlyAvg, 0).toFixed(2)} EUR/mo
                  </span>
                </div>
              )}
            </div>
          </>
        )}

        <div className="flex gap-2">
          <Select value={newMandatoryCat} onValueChange={(v) => v && setNewMandatoryCat(v)}>
            <SelectTrigger className="max-w-xs">
              <SelectValue placeholder={t("add_mandatory_cat")} />
            </SelectTrigger>
            <SelectContent>
              {availableMandatoryCats.map((cat) => (
                <SelectItem key={cat} value={cat}>{cat}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button onClick={handleAddMandatory} disabled={isPending || !newMandatoryCat}>
            {tc("add")}
          </Button>
        </div>
      </Card>

      {/* Auto Budget Visualization (same as Finance page) */}
      {weeklyResult && (
        <Card className="p-4 space-y-3">
          <h2 className="text-lg font-semibold">{t("budget_auto_calc")}</h2>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">{t("monthly_limit")}</span>
              <span className="font-medium">{weeklyResult.monthlyLimit.toFixed(2)} EUR</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">{t("mandatory_expenses")}</span>
              <span className="font-medium">{weeklyResult.mandatorySpent.toFixed(2)} EUR</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">{t("discretionary_spent")}</span>
              <span className="font-medium">{weeklyResult.discretionarySpent.toFixed(2)} EUR</span>
            </div>
            <Separator />
            <div className="flex justify-between">
              <span className="text-muted-foreground">{t("remaining")}</span>
              <span
                className={`font-semibold ${
                  weeklyResult.remaining >= 0
                    ? "text-income"
                    : "text-expense"
                }`}
              >
                {weeklyResult.remaining.toFixed(2)} EUR
              </span>
            </div>
            {/* Pace indicator — same as WeeklyBudgetCard */}
            {(() => {
              const pct =
                weeklyResult.discretionaryBudget > 0
                  ? (weeklyResult.discretionarySpent / weeklyResult.discretionaryBudget) * 100
                  : 0;
              const now = new Date();
              const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
              const todayDay = now.getDate();
              const dayPct = (todayDay / daysInMonth) * 100;
              return (
                <div className="mt-1">
                  <div className="relative h-2 w-full overflow-hidden rounded-full bg-muted">
                    <div
                      className={`h-full rounded-full transition-all ${
                        pct > 100 ? "bg-red-500" : pct > 75 ? "bg-yellow-500" : "bg-green-500"
                      }`}
                      style={{ width: `${Math.min(pct, 100)}%` }}
                    />
                    {/* Today marker — big red dot */}
                    <div
                      className="absolute top-1/2 -translate-y-1/2 w-4 h-4 rounded-full bg-red-500 border-2 border-background shadow-lg"
                      style={{ left: `${dayPct}%`, marginLeft: "-8px" }}
                    />
                  </div>
                </div>
              );
            })()}
          </div>
        </Card>
      )}

      {weeklyResult === null && (
        <Card className="p-4">
          <p className="text-muted-foreground">{t("no_budget_config")}</p>
        </Card>
      )}
    </div>
  );
}
