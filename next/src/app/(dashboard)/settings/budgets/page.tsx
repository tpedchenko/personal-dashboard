"use client";

import { useEffect, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { getBudgets, addBudget, updateBudget, deleteBudget, getCategories } from "@/actions/finance";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { PencilIcon, CheckIcon, XIcon, TrashIcon } from "lucide-react";

type Budget = {
  id: number;
  category: string;
  amountEur: number;
  month: string | null;
  active: boolean | null;
};

export default function BudgetsPage() {
  const t = useTranslations("settings");
  const tc = useTranslations("common");
  const [isPending, startTransition] = useTransition();
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [allCategories, setAllCategories] = useState<string[]>([]);
  const [category, setCategory] = useState("");
  const [amount, setAmount] = useState("");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editAmount, setEditAmount] = useState("");

  useEffect(() => {
    loadBudgets();
  }, []);

  function loadBudgets() {
    startTransition(async () => {
      const [data, cats] = await Promise.all([getBudgets(), getCategories()]);
      setBudgets(data);
      setAllCategories(cats);
    });
  }

  function handleAdd() {
    if (!category.trim() || !amount) return;
    startTransition(async () => {
      await addBudget({
        category: category.trim(),
        amountEur: parseFloat(amount),
      });
      setCategory("");
      setAmount("");
      loadBudgets();
      toast.success(t("save_budget"));
    });
  }

  function handleDelete(id: number) {
    startTransition(async () => {
      await deleteBudget(id);
      loadBudgets();
    });
  }

  function startEdit(b: Budget) {
    setEditingId(b.id);
    setEditAmount(String(b.amountEur));
  }

  function saveEdit(id: number) {
    if (!editAmount) return;
    startTransition(async () => {
      await updateBudget(id, { amountEur: parseFloat(editAmount) });
      setEditingId(null);
      loadBudgets();
      toast.success(tc("saved"));
    });
  }

  return (
    <div className="space-y-4">
      {/* Add Budget Form */}
      <Card className="p-4 space-y-3">
        <h2 className="text-lg font-semibold">{t("add_budget")}</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <Label>{tc("category")}</Label>
            <Select value={category} onValueChange={(v) => v && setCategory(v)}>
              <SelectTrigger>
                <SelectValue placeholder={tc("category")} />
              </SelectTrigger>
              <SelectContent>
                {allCategories.map((cat) => (
                  <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>{t("monthly_limit")}</Label>
            <Input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0" />
          </div>
          <div className="flex items-end">
            <Button onClick={handleAdd} disabled={isPending || !category.trim() || !amount}>
              {t("save_budget")}
            </Button>
          </div>
        </div>
      </Card>

      {/* Budget List */}
      <Card className="p-4">
        <h2 className="text-lg font-semibold mb-3">{t("budgets")}</h2>
        {budgets.length === 0 ? (
          <p className="text-muted-foreground">{t("no_budgets")}</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{tc("category")}</TableHead>
                <TableHead>{tc("amount")}</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {budgets.map((b) => (
                <TableRow key={b.id}>
                  <TableCell className="font-medium">{b.category}</TableCell>
                  <TableCell>
                    {editingId === b.id ? (
                      <div className="flex items-center gap-1">
                        <Input
                          type="number"
                          value={editAmount}
                          onChange={(e) => setEditAmount(e.target.value)}
                          onKeyDown={(e) => e.key === "Enter" && saveEdit(b.id)}
                          className="h-8 w-24"
                          autoFocus
                        />
                        <Button variant="ghost" size="sm" onClick={() => saveEdit(b.id)}>
                          <CheckIcon className="size-4" />
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => setEditingId(null)}>
                          <XIcon className="size-4" />
                        </Button>
                      </div>
                    ) : (
                      <span>{b.amountEur.toFixed(2)} EUR</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      {editingId !== b.id && (
                        <Button variant="ghost" size="sm" onClick={() => startEdit(b)}>
                          <PencilIcon className="size-3.5" />
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-destructive"
                        onClick={() => handleDelete(b.id)}
                        disabled={isPending}
                      >
                        <TrashIcon className="size-3.5" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>
    </div>
  );
}
