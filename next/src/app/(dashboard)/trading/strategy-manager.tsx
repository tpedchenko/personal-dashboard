"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PlusIcon, PlayIcon, SquareIcon, Trash2Icon, PencilIcon, ZapIcon } from "lucide-react";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { saveStrategyConfig, activateStrategy, deactivateStrategy, deleteStrategyConfig } from "@/actions/trading";
import { writeStrategyConfig } from "@/actions/trading/multi-strategy";
import { RocketIcon } from "lucide-react";

interface StrategyConfig {
  id: number; name: string; strategyFile: string; exchange: string;
  stakeCurrency: string; stakeAmount: string; maxOpenTrades: number;
  stoploss: number; dryRun: boolean; isActive: boolean;
}

interface Props {
  configs: StrategyConfig[];
  availableStrategies: string[];
}

const EXCHANGES = ["kraken", "binance", "bybit", "okx"];

const emptyForm = { name: "", strategyFile: "", exchange: "kraken", stakeAmount: "unlimited", maxOpenTrades: 5, stoploss: -0.05, dryRun: true };

export function StrategyManager({ configs: initial, availableStrategies }: Props) {
  const t = useTranslations("trading");
  const [configs, setConfigs] = useState(initial);
  const [isPending, startTransition] = useTransition();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [deleteTarget, setDeleteTarget] = useState<{ id: number; name: string } | null>(null);

  function openAdd() { setEditId(null); setForm(emptyForm); setDialogOpen(true); }
  function openEdit(c: StrategyConfig) {
    setEditId(c.id);
    setForm({ name: c.name, strategyFile: c.strategyFile, exchange: c.exchange, stakeAmount: c.stakeAmount, maxOpenTrades: c.maxOpenTrades, stoploss: c.stoploss, dryRun: c.dryRun });
    setDialogOpen(true);
  }

  function handleSave() {
    if (!form.name.trim() || !form.strategyFile) { toast.error(t("name_strategy_required")); return; }
    startTransition(async () => {
      const res = await saveStrategyConfig({ id: editId ?? undefined, name: form.name.trim(), strategyFile: form.strategyFile, exchange: form.exchange, stakeAmount: form.stakeAmount, maxOpenTrades: form.maxOpenTrades, stoploss: form.stoploss, dryRun: form.dryRun }) as { success?: boolean; error?: string };
      if (res.error) { toast.error(res.error); return; }
      toast.success(editId ? t("updated") : t("saved"));
      setDialogOpen(false);
      window.location.reload();
    });
  }

  function handleActivate(id: number) {
    startTransition(async () => {
      const res = await activateStrategy(id) as { success?: boolean; error?: string; strategyName?: string; reloadError?: string | null };
      if (res.error) { toast.error(res.error); return; }
      toast.success(t("activated", { name: res.strategyName ?? "" }) + (res.reloadError ? ` (warning: ${res.reloadError})` : ""));
      setConfigs(prev => prev.map(c => ({ ...c, isActive: c.id === id })));
    });
  }

  function handleDeactivate(id: number) {
    startTransition(async () => {
      await deactivateStrategy(id);
      toast.success(t("deactivated"));
      setConfigs(prev => prev.map(c => c.id === id ? { ...c, isActive: false } : c));
    });
  }

  function handleDelete(id: number, name: string) {
    setDeleteTarget({ id, name });
  }

  function confirmDeleteStrategy() {
    if (!deleteTarget) return;
    const { id } = deleteTarget;
    startTransition(async () => {
      const res = await deleteStrategyConfig(id) as { success?: boolean; error?: string };
      if (res.error) { toast.error(res.error); return; }
      toast.success(t("deleted"));
      setConfigs(prev => prev.filter(c => c.id !== id));
    });
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2"><ZapIcon className="size-4" /> {t("strategy_configs")}</CardTitle>
          <Button size="sm" variant="outline" onClick={openAdd}><PlusIcon className="size-3.5 mr-1" /> {t("add_strategy")}</Button>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogContent>
              <DialogHeader><DialogTitle>{editId ? t("edit_strategy") : t("new_strategy")}</DialogTitle></DialogHeader>
              <div className="space-y-4 pt-2">
                <div className="space-y-1">
                  <Label className="text-xs">{t("config_name")}</Label>
                  <Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder={t("config_name_placeholder")} className="h-8 text-sm" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs">{t("strategy")}</Label>
                    <Select value={form.strategyFile} onValueChange={v => v && setForm({ ...form, strategyFile: v })}>
                      <SelectTrigger className="h-8 text-xs"><SelectValue placeholder={t("pick")} /></SelectTrigger>
                      <SelectContent>{availableStrategies.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">{t("exchange")}</Label>
                    <Select value={form.exchange} onValueChange={v => v && setForm({ ...form, exchange: v })}>
                      <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>{EXCHANGES.map(e => <SelectItem key={e} value={e}>{e}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs">{t("stake_amount")}</Label>
                    <Input value={form.stakeAmount} onChange={e => setForm({ ...form, stakeAmount: e.target.value })} className="h-8 text-xs" placeholder={t("stake_amount_placeholder")} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">{t("max_trades")}</Label>
                    <Input type="number" min={1} max={50} value={form.maxOpenTrades} onChange={e => setForm({ ...form, maxOpenTrades: parseInt(e.target.value) || 1 })} className="h-8 text-xs" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">{t("stoploss_pct")}</Label>
                    <Input type="number" step={0.5} value={Math.abs(form.stoploss * 100)} onChange={e => setForm({ ...form, stoploss: -Math.abs(parseFloat(e.target.value) / 100) })} className="h-8 text-xs" />
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <Switch checked={form.dryRun} onCheckedChange={v => setForm({ ...form, dryRun: v })} />
                  <Label className="text-xs">{t("dry_run_label")}</Label>
                </div>
                <Button onClick={handleSave} disabled={isPending} className="w-full">{editId ? t("update") : t("save")}</Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </CardHeader>
      <CardContent>
        {configs.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center">{t("no_configs")}</p>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {configs.map(c => (
              <div key={c.id} className={`border rounded-lg p-3 space-y-2 ${c.isActive ? "border-green-500/50 bg-green-500/5" : ""}`}>
                <div className="flex items-start justify-between">
                  <div>
                    <p className="font-medium text-sm">{c.name}</p>
                    <p className="text-xs text-muted-foreground">{c.strategyFile} | {c.exchange}</p>
                  </div>
                  <div className="flex items-center gap-1">
                    {c.isActive && <Badge className="bg-green-500/10 text-green-500 border-green-500/30 text-[10px]">{t("active")}</Badge>}
                    {c.dryRun && <Badge variant="outline" className="bg-amber-500/10 text-amber-500 border-amber-500/30 text-[10px]">{t("dry")}</Badge>}
                  </div>
                </div>
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                  <span>{t("budget")}: {c.stakeAmount} {c.stakeCurrency}</span>
                  <span>{t("max_label")}: {c.maxOpenTrades} {t("trades_suffix")}</span>
                  <span>{t("sl")}: {(c.stoploss * 100).toFixed(1)}%</span>
                </div>
                <div className="flex gap-1 pt-1">
                  {c.isActive ? (
                    <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => handleDeactivate(c.id)} disabled={isPending}><SquareIcon className="size-3 mr-1" /> {t("deactivate")}</Button>
                  ) : (
                    <Button size="sm" className="h-7 text-xs" onClick={() => handleActivate(c.id)} disabled={isPending}><PlayIcon className="size-3 mr-1" /> {t("activate")}</Button>
                  )}
                  <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => openEdit(c)} disabled={isPending}><PencilIcon className="size-3" /></Button>
                  <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => {
                    startTransition(async () => {
                      const res = await writeStrategyConfig(c.id);
                      if (res.ok) toast.success(t("config_deployed", { port: String(res.port) }));
                      else toast.error(res.message);
                    });
                  }} disabled={isPending} title="Write config for separate container">
                    <RocketIcon className="size-3" />
                  </Button>
                  {!c.isActive && <Button size="sm" variant="ghost" className="h-7 text-xs text-red-500" onClick={() => handleDelete(c.id, c.name)} disabled={isPending}><Trash2Icon className="size-3" /></Button>}
                </div>
              </div>
            ))}
          </div>
        )}
        <p className="text-[10px] text-muted-foreground mt-3">
          <strong>{t("single_mode")}:</strong> {t("single_mode_desc")} <br />
          <strong>{t("multi_mode")}:</strong> {t("multi_mode_desc")} <code>sudo docker run -d --name freqtrade-sN --network pd-frontend-prod -v ... freqtradeorg/freqtrade:stable trade --config ... --strategy StrategyName</code>
        </p>
      </CardContent>
      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}
        title={t("delete_confirm", { name: deleteTarget?.name ?? "" })}
        confirmLabel={t("delete")}
        cancelLabel={t("cancel")}
        onConfirm={confirmDeleteStrategy}
        destructive
      />
    </Card>
  );
}
