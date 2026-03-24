"use client";

import { useEffect, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import {
  getRecurringTransactions,
  addRecurringTransaction,
  toggleRecurring,
  deleteRecurring,
} from "@/actions/finance";
import { getAccounts, getCategories } from "@/actions/settings";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Trash2 } from "lucide-react";

type RecurringTx = {
  id: number;
  name: string;
  amountEur: number;
  category: string;
  txType: string;
  account: string | null;
  dayOfMonth: number | null;
  active: boolean | null;
};

export default function RecurringPage() {
  const t = useTranslations("settings");
  const tf = useTranslations("finance");
  const tc = useTranslations("common");
  const [isPending, startTransition] = useTransition();
  const [items, setItems] = useState<RecurringTx[]>([]);
  const [accounts, setAccounts] = useState<{ name: string }[]>([]);
  const [categories, setCategories] = useState<string[]>([]);

  // form
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState("");
  const [txType, setTxType] = useState("EXPENSE");
  const [account, setAccount] = useState("");
  const [dayOfMonth, setDayOfMonth] = useState("1");

  useEffect(() => {
    load();
  }, []);

  function load() {
    startTransition(async () => {
      const [r, a, c] = await Promise.all([
        getRecurringTransactions(),
        getAccounts(),
        getCategories(),
      ]);
      setItems(r as RecurringTx[]);
      setAccounts(a);
      setCategories(c.map((x: { category: string }) => x.category));
      if (a.length > 0 && !account) setAccount(a[0].name);
    });
  }

  function handleAdd() {
    if (!name.trim() || !amount || !category) return;
    startTransition(async () => {
      await addRecurringTransaction({
        name: name.trim(),
        amountEur: parseFloat(amount),
        category,
        txType,
        account: account || undefined,
        dayOfMonth: parseInt(dayOfMonth) || 1,
      });
      setName("");
      setAmount("");
      setCategory("");
      setTxType("EXPENSE");
      setDayOfMonth("1");
      load();
    });
  }

  function handleToggle(id: number) {
    startTransition(async () => {
      await toggleRecurring(id);
      load();
    });
  }

  function handleDelete(id: number) {
    startTransition(async () => {
      await deleteRecurring(id);
      load();
    });
  }

  return (
    <div className="space-y-4">
      {/* Add form */}
      <Card className="p-4 space-y-3">
        <h2 className="text-lg font-semibold">{tf("add_recurring")}</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
          <div>
            <Label>{tc("name")}</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t("recurring_name_placeholder")}
            />
          </div>
          <div>
            <Label>{tf("amount")} (EUR)</Label>
            <Input
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0"
              min={0}
              step={0.01}
            />
          </div>
          <div>
            <Label>{tf("category")}</Label>
            <Select value={category} onValueChange={(v) => v && setCategory(v)}>
              <SelectTrigger>
                <SelectValue placeholder={tf("category")} />
              </SelectTrigger>
              <SelectContent>
                {categories.map((c) => (
                  <SelectItem key={c} value={c}>
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>{tf("type")}</Label>
            <Select value={txType} onValueChange={(v) => v && setTxType(v)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="EXPENSE">{tf("expense")}</SelectItem>
                <SelectItem value="INCOME">{tf("income")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>{tf("account")}</Label>
            <Select value={account} onValueChange={(v) => v && setAccount(v)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {accounts.map((a) => (
                  <SelectItem key={a.name} value={a.name}>
                    {a.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>{t("day_of_month")}</Label>
            <Input
              type="number"
              value={dayOfMonth}
              onChange={(e) => setDayOfMonth(e.target.value)}
              min={1}
              max={28}
            />
          </div>
        </div>
        <Button onClick={handleAdd} disabled={isPending || !name.trim() || !amount || !category}>
          {tc("add")}
        </Button>
      </Card>

      {/* List */}
      <Card className="p-4 space-y-3">
        <h2 className="text-lg font-semibold">{tf("recurring")}</h2>
        {items.length === 0 ? (
          <p className="text-muted-foreground text-sm">{tf("no_recurring")}</p>
        ) : (
          <div className="space-y-2">
            {items.map((item) => (
              <div
                key={item.id}
                className="flex items-center justify-between border rounded-lg p-3"
              >
                <div className="flex items-center gap-3">
                  <Switch
                    checked={item.active === true}
                    onCheckedChange={() => handleToggle(item.id)}
                    disabled={isPending}
                  />
                  <div>
                    <span className="font-medium">{item.name}</span>
                    <span className="text-muted-foreground text-sm ml-2">
                      {item.category}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-sm text-muted-foreground">
                    {t("day_of_month")}: {item.dayOfMonth}
                  </span>
                  <span className={`font-medium ${item.txType === "INCOME" ? "text-income" : "text-expense"}`}>
                    {item.txType === "INCOME" ? "+" : "-"}{item.amountEur.toFixed(2)} EUR
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {item.txType === "INCOME" ? "📥" : "📤"}
                  </span>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleDelete(item.id)}
                    disabled={isPending}
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
