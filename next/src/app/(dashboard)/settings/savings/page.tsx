"use client";

import { useEffect, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import {
  getSavingsGoals,
  addSavingsGoal,
  updateSavingsGoal,
  deleteSavingsGoal,
  removeFutureTransactions,
  getNbuCacheStats,
} from "@/actions/settings";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";

type SavingsGoal = {
  id: number;
  name: string;
  targetEur: number;
  currentEur: number | null;
  deadline: string | null;
  active: boolean | null;
};

export default function SavingsPage() {
  const t = useTranslations("settings");
  const tc = useTranslations("common");
  const [isPending, startTransition] = useTransition();
  const [goals, setGoals] = useState<SavingsGoal[]>([]);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editCurrentEur, setEditCurrentEur] = useState("");
  const [nbuStats, setNbuStats] = useState<{ totalRecords: number; uniqueDates: number; oldest: string | null; newest: string | null } | null>(null);
  const [futureDeleted, setFutureDeleted] = useState<number | null>(null);

  // form state
  const [name, setName] = useState("");
  const [target, setTarget] = useState("");
  const [deadline, setDeadline] = useState("");

  useEffect(() => {
    loadGoals();
  }, []);

  function loadGoals() {
    startTransition(async () => {
      const data = await getSavingsGoals();
      setGoals(data);
    });
  }

  function handleAdd() {
    if (!name.trim() || !target) return;
    startTransition(async () => {
      await addSavingsGoal({
        name: name.trim(),
        targetEur: parseFloat(target),
        deadline: deadline || undefined,
      });
      setName("");
      setTarget("");
      setDeadline("");
      loadGoals();
    });
  }

  function handleDelete(id: number) {
    startTransition(async () => {
      await deleteSavingsGoal(id);
      loadGoals();
    });
  }

  function startEdit(goal: SavingsGoal) {
    setEditingId(goal.id);
    setEditCurrentEur(String(goal.currentEur ?? 0));
  }

  function handleUpdate(id: number) {
    startTransition(async () => {
      await updateSavingsGoal(id, {
        currentEur: parseFloat(editCurrentEur) || 0,
      });
      setEditingId(null);
      loadGoals();
    });
  }

  return (
    <div className="space-y-4">
      {/* Add Goal Form */}
      <Card className="p-4 space-y-3">
        <h2 className="text-lg font-semibold">{t("add_goal")}</h2>
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
          <div>
            <Label>{t("goal_name")}</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t("goal_name")}
            />
          </div>
          <div>
            <Label>{t("target_eur")}</Label>
            <Input
              type="number"
              value={target}
              onChange={(e) => setTarget(e.target.value)}
              placeholder="0"
            />
          </div>
          <div>
            <Label>{t("deadline")}</Label>
            <Input
              type="date"
              value={deadline}
              onChange={(e) => setDeadline(e.target.value)}
            />
          </div>
          <div className="flex items-end">
            <Button
              onClick={handleAdd}
              disabled={isPending || !name.trim() || !target}
            >
              {tc("add")}
            </Button>
          </div>
        </div>
      </Card>

      {/* Goals List */}
      <Card className="p-4 space-y-4">
        <h2 className="text-lg font-semibold">{t("savings_goals")}</h2>
        {goals.length === 0 ? (
          <p className="text-muted-foreground">{t("no_goals")}</p>
        ) : (
          <div className="space-y-4">
            {goals.map((goal) => {
              const current = goal.currentEur ?? 0;
              const pct = goal.targetEur > 0
                ? Math.min(100, (current / goal.targetEur) * 100)
                : 0;
              return (
                <div
                  key={goal.id}
                  className="border rounded-lg p-4 space-y-2"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="font-medium">{goal.name}</span>
                      {goal.deadline && (
                        <span className="ml-2 text-sm text-muted-foreground">
                          {t("deadline")}: {goal.deadline}
                        </span>
                      )}
                    </div>
                    <div className="flex gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => startEdit(goal)}
                        disabled={isPending}
                      >
                        {tc("edit")}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-destructive"
                        onClick={() => handleDelete(goal.id)}
                        disabled={isPending}
                      >
                        {tc("delete")}
                      </Button>
                    </div>
                  </div>

                  {/* Progress bar */}
                  <div className="space-y-1">
                    <div className="flex justify-between text-sm">
                      <span>{current.toFixed(2)} EUR / {goal.targetEur.toFixed(2)} EUR</span>
                      <span>{pct.toFixed(1)}%</span>
                    </div>
                    <div className="w-full bg-muted rounded-full h-3">
                      <div
                        className={`rounded-full h-3 transition-all ${
                          pct >= 100 ? "bg-green-500" : pct >= 50 ? "bg-amber-500" : "bg-blue-500"
                        }`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>

                  {/* Inline edit for current amount */}
                  {editingId === goal.id && (
                    <div className="flex gap-2 items-end pt-2">
                      <div>
                        <Label>{t("current_amount")}</Label>
                        <Input
                          type="number"
                          value={editCurrentEur}
                          onChange={(e) => setEditCurrentEur(e.target.value)}
                        />
                      </div>
                      <Button
                        size="sm"
                        onClick={() => handleUpdate(goal.id)}
                        disabled={isPending}
                      >
                        {tc("save")}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setEditingId(null)}
                      >
                        {tc("cancel")}
                      </Button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {/* Maintenance: NBU Cache Stats */}
      <Card className="p-4 space-y-3">
        <h2 className="text-lg font-semibold">{t("nbu_cache")}</h2>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            startTransition(async () => {
              const stats = await getNbuCacheStats();
              setNbuStats(stats);
            });
          }}
          disabled={isPending}
        >
          {t("load_stats")}
        </Button>
        {nbuStats && (
          <div className="grid grid-cols-2 gap-2 text-sm">
            <span className="text-muted-foreground">{t("total_records")}:</span>
            <span>{nbuStats.totalRecords}</span>
            <span className="text-muted-foreground">{t("unique_dates")}:</span>
            <span>{nbuStats.uniqueDates}</span>
            <span className="text-muted-foreground">{t("oldest_rate")}:</span>
            <span>{nbuStats.oldest ?? "—"}</span>
            <span className="text-muted-foreground">{t("newest_rate")}:</span>
            <span>{nbuStats.newest ?? "—"}</span>
          </div>
        )}
      </Card>

      {/* Maintenance: Remove Future Transactions */}
      <Card className="p-4 space-y-3">
        <h2 className="text-lg font-semibold">{t("remove_future_tx")}</h2>
        <p className="text-sm text-muted-foreground">{t("remove_future_tx_desc")}</p>
        <Button
          variant="destructive"
          size="sm"
          onClick={() => {
            startTransition(async () => {
              const count = await removeFutureTransactions();
              setFutureDeleted(count);
            });
          }}
          disabled={isPending}
        >
          {t("remove_future_tx")}
        </Button>
        {futureDeleted !== null && (
          <p className="text-sm text-green-600">
            {t("removed_count", { count: futureDeleted })}
          </p>
        )}
      </Card>
    </div>
  );
}
