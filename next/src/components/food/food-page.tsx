"use client";

import { useState, useTransition, useCallback } from "react";
import { useTranslations } from "next-intl";
import { CalendarIcon, PlusIcon, Trash2Icon } from "lucide-react";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import {
  getFoodEntries,
  getDailySummary,
  addFoodEntry,
  deleteFoodEntry,
  getCalorieTrend,
} from "@/actions/food";
import { setUserPreference } from "@/actions/settings";
import { Fab } from "@/components/ui/fab";
import { toast } from "sonner";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";
import { useChartColors } from "@/hooks/use-chart-colors";

type FoodEntry = {
  id: number;
  userId: number | null;
  date: string;
  time: string | null;
  description: string | null;
  weightG: number | null;
  calories: number | null;
  proteinG: number | null;
  fatG: number | null;
  carbsG: number | null;
  source: string | null;
  photoFileId: string | null;
  aiRawResponse: string | null;
  confirmed: boolean | null;
  createdAt: Date | null;
};

type DailySummary = {
  calories: number;
  protein: number;
  fat: number;
  carbs: number;
};

function formatDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

type CalorieTrendPoint = { date: string; calories: number };

export function FoodPage({
  initialEntries,
  initialSummary,
  initialDate,
  initialCalorieTrend,
  initialCalorieTarget = 2000,
}: {
  initialEntries: FoodEntry[];
  initialSummary: DailySummary;
  initialDate: string;
  initialCalorieTrend: CalorieTrendPoint[];
  initialCalorieTarget?: number;
}) {
  const t = useTranslations("food");
  const tc = useTranslations("common");
  const { colors: CC } = useChartColors();

  const [date, setDate] = useState(initialDate);
  const [entries, setEntries] = useState<FoodEntry[]>(initialEntries);
  const [summary, setSummary] = useState<DailySummary>(initialSummary);
  const [isPending, startTransition] = useTransition();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [calorieTrend, setCalorieTrend] = useState<CalorieTrendPoint[]>(initialCalorieTrend);
  const [calorieTarget, setCalorieTarget] = useState(initialCalorieTarget);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [targetInput, setTargetInput] = useState(String(initialCalorieTarget));

  // Form state
  const [formTime, setFormTime] = useState("");
  const [formDesc, setFormDesc] = useState("");
  const [formCal, setFormCal] = useState("");
  const [formProtein, setFormProtein] = useState("");
  const [formFat, setFormFat] = useState("");
  const [formCarbs, setFormCarbs] = useState("");

  const reload = useCallback(
    (newDate: string) => {
      startTransition(async () => {
        const [e, s, trend] = await Promise.all([
          getFoodEntries(newDate),
          getDailySummary(newDate),
          getCalorieTrend(30),
        ]);
        setEntries(e);
        setSummary(s);
        setCalorieTrend(trend);
      });
    },
    []
  );

  const handleDateSelect = (d: Date | undefined) => {
    if (!d) return;
    const ds = formatDate(d);
    setDate(ds);
    setCalendarOpen(false);
    reload(ds);
  };

  const handlePrevDay = () => {
    const d = new Date(date);
    d.setDate(d.getDate() - 1);
    const ds = formatDate(d);
    setDate(ds);
    reload(ds);
  };

  const handleNextDay = () => {
    const d = new Date(date);
    d.setDate(d.getDate() + 1);
    const ds = formatDate(d);
    setDate(ds);
    reload(ds);
  };

  const handleAdd = () => {
    if (!formDesc.trim()) return;
    startTransition(async () => {
      await addFoodEntry({
        date,
        time: formTime || undefined,
        description: formDesc,
        calories: formCal ? parseFloat(formCal) : undefined,
        proteinG: formProtein ? parseFloat(formProtein) : undefined,
        fatG: formFat ? parseFloat(formFat) : undefined,
        carbsG: formCarbs ? parseFloat(formCarbs) : undefined,
      });
      setFormTime("");
      setFormDesc("");
      setFormCal("");
      setFormProtein("");
      setFormFat("");
      setFormCarbs("");
      setDialogOpen(false);
      reload(date);
    });
  };

  const handleDelete = (id: number) => {
    setDeleteId(id);
  };

  const confirmDelete = () => {
    if (deleteId === null) return;
    startTransition(async () => {
      await deleteFoodEntry(deleteId);
      reload(date);
    });
  };

  const handleSaveTarget = () => {
    const val = parseInt(targetInput, 10);
    if (isNaN(val) || val <= 0) return;
    setCalorieTarget(val);
    startTransition(async () => {
      await setUserPreference("calorie_target", String(val));
      toast.success(t("target_saved"));
    });
  };

  const selectedDate = new Date(date + "T00:00:00");

  return (
    <div className="space-y-6">
      {/* Date picker */}
      <div className="flex items-center gap-2">
        <Button variant="outline" size="icon" onClick={handlePrevDay}>
          &larr;
        </Button>
        <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
          <PopoverTrigger
            render={
              <Button variant="outline" className="min-w-[140px] gap-2" />
            }
          >
            <CalendarIcon className="size-4" />
            {date}
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar
              mode="single"
              selected={selectedDate}
              onSelect={handleDateSelect}
              defaultMonth={selectedDate}
            />
          </PopoverContent>
        </Popover>
        <Button variant="outline" size="icon" onClick={handleNextDay}>
          &rarr;
        </Button>
      </div>

      {/* Summary cards */}
      {(() => {
        const totalMacroG = summary.protein + summary.fat + summary.carbs;
        const pPct = totalMacroG > 0 ? Math.round((summary.protein / totalMacroG) * 100) : 0;
        const fPct = totalMacroG > 0 ? Math.round((summary.fat / totalMacroG) * 100) : 0;
        const cPct = totalMacroG > 0 ? 100 - pPct - fPct : 0;
        const calPct = calorieTarget > 0 ? Math.min(100, Math.round((summary.calories / calorieTarget) * 100)) : 0;
        return (
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 sm:gap-4">
        <Card size="sm">
          <CardHeader>
            <CardTitle className="text-xs sm:text-sm">{t("calories")}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className={`text-lg sm:text-2xl font-bold tabular-nums ${summary.calories <= calorieTarget ? "text-calories-ok" : "text-calories-over"}`}>
              {Math.round(summary.calories)}
            </p>
            <p className="text-xs text-muted-foreground">{calPct}% {t("of_target")}</p>
          </CardContent>
        </Card>
        <Card size="sm">
          <CardHeader>
            <CardTitle className="text-xs sm:text-sm">{t("protein")}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-lg sm:text-2xl font-bold tabular-nums text-blue-500">{Math.round(summary.protein)}g</p>
            <p className="text-xs text-muted-foreground">{pPct}%</p>
          </CardContent>
        </Card>
        <Card size="sm">
          <CardHeader>
            <CardTitle className="text-xs sm:text-sm">{t("fat")}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-lg sm:text-2xl font-bold tabular-nums text-amber-500">{Math.round(summary.fat)}g</p>
            <p className="text-xs text-muted-foreground">{fPct}%</p>
          </CardContent>
        </Card>
        <Card size="sm">
          <CardHeader>
            <CardTitle className="text-xs sm:text-sm">{t("carbs")}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-lg sm:text-2xl font-bold tabular-nums text-purple-500">{Math.round(summary.carbs)}g</p>
            <p className="text-xs text-muted-foreground">{cPct}%</p>
          </CardContent>
        </Card>
      </div>
        );
      })()}

      {/* Calorie trend chart */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2">
          <CardTitle className="text-base">{t("calorie_trend")}</CardTitle>
          <div className="flex items-center gap-1.5">
            <Label className="text-xs text-muted-foreground whitespace-nowrap">{t("calorie_target_label")}:</Label>
            <Input
              type="number"
              value={targetInput}
              onChange={(e) => setTargetInput(e.target.value)}
              onBlur={handleSaveTarget}
              onKeyDown={(e) => { if (e.key === "Enter") handleSaveTarget(); }}
              className="w-20 h-7 text-xs"
              min={500}
              max={10000}
            />
          </div>
        </CardHeader>
        <CardContent>
          <div className="h-44 sm:h-64">
            <figure role="img" aria-label="Графік калорій">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={calorieTrend.map((p) => ({ ...p, label: p.date.slice(5) }))}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 11 }}
                  interval="preserveStartEnd"
                />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip
                  formatter={(value) => [`${value} kcal`, t("calories")]}
                  labelFormatter={(label) => String(label)}
                />
                <ReferenceLine
                  y={calorieTarget}
                  stroke={CC.calorieTarget}
                  strokeDasharray="6 3"
                  label={{
                    value: `${calorieTarget} ${t("target")}`,
                    position: "insideTopRight",
                    fontSize: 11,
                    fill: CC.calorieTarget,
                  }}
                />
                <Line
                  type="monotone"
                  dataKey="calories"
                  stroke={CC.calories}
                  strokeWidth={2}
                  dot={false}
                  connectNulls
                />
              </LineChart>
            </ResponsiveContainer>
            </figure>
          </div>
        </CardContent>
      </Card>

      {/* Food log table + add button */}
      <Card data-testid="food-list">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>{t("meals_today")}</CardTitle>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger
              render={<Button size="sm" className="gap-1" data-testid="add-food-btn" />}
            >
              <PlusIcon className="size-4" />
              {t("add_meal")}
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>{t("add_meal")}</DialogTitle>
              </DialogHeader>
              <div className="grid gap-4 py-2">
                <div className="grid gap-2">
                  <Label>{tc("description")}</Label>
                  <Input
                    value={formDesc}
                    onChange={(e) => setFormDesc(e.target.value)}
                    placeholder="e.g. Chicken breast with rice"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="grid gap-2">
                    <Label>Time</Label>
                    <Input
                      type="time"
                      value={formTime}
                      onChange={(e) => setFormTime(e.target.value)}
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label>{t("calories")}</Label>
                    <Input
                      type="number"
                      value={formCal}
                      onChange={(e) => setFormCal(e.target.value)}
                      placeholder="kcal"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-4">
                  <div className="grid gap-2">
                    <Label>{t("protein")}</Label>
                    <Input
                      type="number"
                      value={formProtein}
                      onChange={(e) => setFormProtein(e.target.value)}
                      placeholder="g"
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label>{t("fat")}</Label>
                    <Input
                      type="number"
                      value={formFat}
                      onChange={(e) => setFormFat(e.target.value)}
                      placeholder="g"
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label>{t("carbs")}</Label>
                    <Input
                      type="number"
                      value={formCarbs}
                      onChange={(e) => setFormCarbs(e.target.value)}
                      placeholder="g"
                    />
                  </div>
                </div>
              </div>
              <DialogFooter>
                <DialogClose render={<Button variant="outline" />}>
                  {tc("cancel")}
                </DialogClose>
                <Button onClick={handleAdd} disabled={isPending || !formDesc.trim()}>
                  {tc("add")}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </CardHeader>
        <CardContent>
          {entries.length === 0 ? (
            <p className="text-muted-foreground text-sm py-4">
              {t("no_food")}
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="hidden sm:table-cell text-xs">Time</TableHead>
                  <TableHead className="text-xs">{tc("description")}</TableHead>
                  <TableHead className="text-right text-xs">{t("calories")}</TableHead>
                  <TableHead className="text-right text-xs hidden sm:table-cell">{t("protein")}</TableHead>
                  <TableHead className="text-right text-xs hidden sm:table-cell">{t("fat")}</TableHead>
                  <TableHead className="text-right text-xs hidden sm:table-cell">{t("carbs")}</TableHead>
                  <TableHead className="w-10"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {entries.map((entry) => (
                  <TableRow key={entry.id}>
                    <TableCell className="hidden sm:table-cell text-xs">{entry.time ?? "—"}</TableCell>
                    <TableCell className="text-xs max-w-[120px] sm:max-w-none truncate">{entry.description ?? "—"}</TableCell>
                    <TableCell className="text-right text-xs">
                      {entry.calories != null ? Math.round(entry.calories) : "—"}
                    </TableCell>
                    <TableCell className="text-right text-xs hidden sm:table-cell">
                      {entry.proteinG != null ? Math.round(entry.proteinG) : "—"}
                    </TableCell>
                    <TableCell className="text-right text-xs hidden sm:table-cell">
                      {entry.fatG != null ? Math.round(entry.fatG) : "—"}
                    </TableCell>
                    <TableCell className="text-right text-xs hidden sm:table-cell">
                      {entry.carbsG != null ? Math.round(entry.carbsG) : "—"}
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        onClick={() => handleDelete(entry.id)}
                        disabled={isPending}
                      >
                        <Trash2Icon className="size-3.5 text-destructive" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
      <Fab aria-label="Add food entry" data-testid="add-food" onClick={() => setDialogOpen(true)} />
      <ConfirmDialog
        open={deleteId !== null}
        onOpenChange={(open) => { if (!open) setDeleteId(null); }}
        title={tc("delete_confirm")}
        confirmLabel={tc("delete")}
        cancelLabel={tc("cancel")}
        onConfirm={confirmDelete}
        destructive
      />
    </div>
  );
}
