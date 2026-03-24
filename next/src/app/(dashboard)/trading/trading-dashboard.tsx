"use client";

import { useState, useMemo, useTransition } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar } from "recharts";
import { PlayIcon, SquareIcon, XCircleIcon, SettingsIcon, ChevronDownIcon, ChevronRightIcon } from "lucide-react";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { controlBot, forceExitTrade, updateBotConfig } from "@/actions/trading";

interface Props {
  overview: {
    config: {
      strategy: string; dry_run: boolean; exchange: string; state: string;
      stake_currency: string; stake_amount: string; max_open_trades: number;
      stoploss: number; trailing_stop: boolean; trailing_stop_positive: number;
      trailing_stop_positive_offset: number; minimal_roi: Record<string, number>;
      timeframe: string;
    } | null;
    profit: { profit_all_fiat: number; trade_count: number; winning_trades: number; losing_trades: number; best_pair: string; avg_duration: string; profit_all_percent_sum: number } | null;
    openTrades: Array<{ trade_id: number; pair: string; current_profit_pct: number; current_profit_abs: number; stake_amount: number; open_date: string; strategy: string }>;
    balance: { total: number; stake: string } | null;
    performance: Array<{ pair: string; profit: number; profit_abs: number; count: number }>;
    error: string | null;
  };
  history: {
    trades: Array<{ trade_id: number; pair: string; profit_pct: number; profit_abs: number; open_date: string; close_date: string | null; strategy: string; exit_reason: string | null; stake_amount: number }>;
    count: number;
    error: string | null;
  };
  daily: {
    daily: Array<{ date: string; abs_profit: number; trade_count: number }>;
    error: string | null;
  };
  strategies: string[];
}

export function TradingDashboard({ overview, history, daily, strategies }: Props) {
  const t = useTranslations("trading");
  const { config, profit, openTrades, balance, performance } = overview;
  const [isPending, startTransition] = useTransition();
  const [botState, setBotState] = useState(config?.state ?? "offline");
  const [controlsOpen, setControlsOpen] = useState(false);

  // Bot control form state
  const [editStoploss, setEditStoploss] = useState(String(Math.abs(config?.stoploss ?? 0.1) * 100));
  const [editMaxTrades, setEditMaxTrades] = useState(String(config?.max_open_trades ?? 5));
  const [editStakeAmount, setEditStakeAmount] = useState(config?.stake_amount ?? "unlimited");
  const [editStrategy, setEditStrategy] = useState(config?.strategy ?? "");
  const [forceExitState, setForceExitState] = useState<{ tradeId: number; pair: string } | null>(null);

  // Filters
  const [filterPair, setFilterPair] = useState("all");
  const [filterStrategy, setFilterStrategy] = useState("all");
  const [filterDateFrom, setFilterDateFrom] = useState("");
  const [filterDateTo, setFilterDateTo] = useState("");

  const uniquePairs = useMemo(() => [...new Set(history.trades.map(t => t.pair))].sort(), [history.trades]);
  const uniqueStrategies = useMemo(() => [...new Set(history.trades.map(t => t.strategy).filter(Boolean))].sort(), [history.trades]);

  const filteredTrades = useMemo(() => {
    return history.trades.filter(t => {
      if (filterPair !== "all" && t.pair !== filterPair) return false;
      if (filterStrategy !== "all" && t.strategy !== filterStrategy) return false;
      if (filterDateFrom && t.close_date && t.close_date < filterDateFrom) return false;
      if (filterDateTo && t.close_date && t.close_date > filterDateTo + "T23:59:59") return false;
      return true;
    });
  }, [history.trades, filterPair, filterStrategy, filterDateFrom, filterDateTo]);

  const filteredStats = useMemo(() => {
    const wins = filteredTrades.filter(t => t.profit_abs >= 0).length;
    const losses = filteredTrades.filter(t => t.profit_abs < 0).length;
    const totalPnl = filteredTrades.reduce((s, t) => s + t.profit_abs, 0);
    return { wins, losses, total: filteredTrades.length, totalPnl };
  }, [filteredTrades]);

  if (overview.error) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold">{t("title")}</h1>
        <Card>
          <CardContent className="p-6">
            <p className="text-muted-foreground">{t("bot_not_connected", { error: overview.error })}</p>
            <p className="text-sm text-muted-foreground mt-2">{t("bot_not_connected_hint")}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const winRate = profit ? Math.round((profit.winning_trades / Math.max(profit.trade_count, 1)) * 100) : 0;

  const cumulative = daily.daily.reduce<Array<{ date: string; profit: number; trades: number }>>((acc, d) => {
    const prev = acc.length > 0 ? acc[acc.length - 1].profit : 0;
    acc.push({ date: d.date, profit: prev + d.abs_profit, trades: d.trade_count });
    return acc;
  }, []);

  function handleBotControl(action: "start" | "stop") {
    startTransition(async () => {
      const res = await controlBot(action);
      if (res.error) { toast.error(res.error); return; }
      setBotState(action === "start" ? "running" : "stopped");
      toast.success(action === "start" ? t("bot_started") : t("bot_stopped"));
    });
  }

  function handleForceExit(tradeId: number, pair: string) {
    setForceExitState({ tradeId, pair });
  }

  function confirmForceExit() {
    if (!forceExitState) return;
    const { tradeId, pair } = forceExitState;
    startTransition(async () => {
      const res = await forceExitTrade(tradeId);
      if (res.error) { toast.error(res.error); return; }
      toast.success(t("exited", { pair }));
    });
  }

  function handleSaveConfig() {
    startTransition(async () => {
      const res = await updateBotConfig({
        stoploss: -Math.abs(parseFloat(editStoploss) / 100),
        max_open_trades: parseInt(editMaxTrades),
        stake_amount: editStakeAmount,
        strategy: editStrategy !== config?.strategy ? editStrategy : undefined,
      });
      if ("error" in res && res.error) { toast.error(String(res.error)); return; }
      toast.success(t("config_updated"));
    });
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-2xl font-bold">{t("title")}</h1>
        <div className="flex items-center gap-2">
          {config?.dry_run && <Badge variant="outline" className="bg-amber-500/10 text-amber-500 border-amber-500/30">{t("dry_run")}</Badge>}
          <Badge variant={botState === "running" ? "default" : "destructive"}>{botState}</Badge>
          <span className="text-sm text-muted-foreground">{config?.strategy} | {config?.exchange} | {config?.timeframe}</span>
          {/* Start/Stop */}
          {botState === "running" ? (
            <Button size="sm" variant="outline" onClick={() => handleBotControl("stop")} disabled={isPending}>
              <SquareIcon className="size-3.5 mr-1" /> {t("stop")}
            </Button>
          ) : (
            <Button size="sm" onClick={() => handleBotControl("start")} disabled={isPending}>
              <PlayIcon className="size-3.5 mr-1" /> {t("start")}
            </Button>
          )}
        </div>
      </div>

      {/* Bot Controls (collapsible) */}
      <Card data-testid="bot-control">
        <CardHeader className="py-2 px-4 cursor-pointer select-none" onClick={() => setControlsOpen(!controlsOpen)}>
          <CardTitle className="text-sm flex items-center gap-2">
            {controlsOpen ? <ChevronDownIcon className="size-4" /> : <ChevronRightIcon className="size-4" />}
            <SettingsIcon className="size-4" /> {t("bot_configuration")}
          </CardTitle>
        </CardHeader>
        {controlsOpen && (
          <CardContent className="space-y-4 pt-0">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">{t("strategy")}</Label>
                <Select value={editStrategy} onValueChange={(v) => v && setEditStrategy(v)}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {strategies.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">{t("stop_loss")}</Label>
                <Input type="number" step="0.5" value={editStoploss} onChange={e => setEditStoploss(e.target.value)} className="h-8 text-xs" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">{t("max_open_trades_label")}</Label>
                <Input type="number" min="1" max="50" value={editMaxTrades} onChange={e => setEditMaxTrades(e.target.value)} className="h-8 text-xs" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">{t("stake_amount")}</Label>
                <Input value={editStakeAmount} onChange={e => setEditStakeAmount(e.target.value)} className="h-8 text-xs" placeholder={t("stake_amount_placeholder")} />
              </div>
            </div>

            {/* Current config summary */}
            <div className="text-xs text-muted-foreground bg-muted p-2 rounded flex flex-wrap gap-x-4 gap-y-1">
              <span>{t("trailing_stop")}: {config?.trailing_stop ? `${((config.trailing_stop_positive ?? 0) * 100).toFixed(1)}% @ ${((config.trailing_stop_positive_offset ?? 0) * 100).toFixed(1)}%` : t("trailing_stop_off")}</span>
              <span>{t("roi")}: {config?.minimal_roi ? Object.entries(config.minimal_roi).map(([k, v]) => `${k}m→${(v * 100).toFixed(1)}%`).join(", ") : "—"}</span>
            </div>

            <div className="flex gap-2">
              <Button size="sm" onClick={handleSaveConfig} disabled={isPending}>{t("save_reload")}</Button>
              {editStrategy !== config?.strategy && (
                <p className="text-xs text-amber-500 flex items-center">{t("strategy_change_warning")}</p>
              )}
            </div>
          </CardContent>
        )}
      </Card>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">{t("total_pnl")}</p>
            <p className={`text-2xl font-bold ${(profit?.profit_all_fiat ?? 0) >= 0 ? "text-income" : "text-expense"}`}>
              {(profit?.profit_all_fiat ?? 0) >= 0 ? "+" : ""}{(profit?.profit_all_fiat ?? 0).toFixed(2)} {config?.stake_currency}
            </p>
            <p className="text-xs text-muted-foreground">{(profit?.profit_all_percent_sum ?? 0).toFixed(1)}%</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">{config?.dry_run ? t("paper_balance") : t("exchange_balance")}</p>
            <p className="text-2xl font-bold">{(balance?.total ?? 0).toFixed(2)} {config?.stake_currency}</p>
            {config?.dry_run && <p className="text-[10px] text-amber-500">{t("simulated")}</p>}
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">{t("win_rate")}</p>
            <p className={`text-2xl font-bold ${winRate >= 50 ? "text-green-500" : "text-yellow-500"}`}>{winRate}%</p>
            <p className="text-xs text-muted-foreground">{profit?.winning_trades ?? 0}W / {profit?.losing_trades ?? 0}L ({profit?.trade_count ?? 0})</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">{t("open_trades")}</p>
            <p className="text-2xl font-bold">{openTrades.length} / {config?.max_open_trades ?? "—"}</p>
            <p className="text-xs text-muted-foreground">{t("best")}: {profit?.best_pair ?? "—"}</p>
          </CardContent>
        </Card>
      </div>

      {/* Open Positions with Force Exit */}
      {openTrades.length > 0 && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">{t("open_positions")}</CardTitle></CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("col_pair")}</TableHead>
                  <TableHead>{t("col_stake")}</TableHead>
                  <TableHead>{t("col_profit")}</TableHead>
                  <TableHead>{t("col_opened")}</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {openTrades.map((tr) => (
                  <TableRow key={tr.trade_id}>
                    <TableCell className="font-medium">{tr.pair}</TableCell>
                    <TableCell>{tr.stake_amount.toFixed(2)}</TableCell>
                    <TableCell className={tr.current_profit_pct >= 0 ? "text-income" : "text-expense"}>
                      {tr.current_profit_pct >= 0 ? "+" : ""}{(tr.current_profit_pct * 100).toFixed(2)}%
                      <span className="text-xs ml-1">({tr.current_profit_abs.toFixed(2)})</span>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">{new Date(tr.open_date).toLocaleString("en")}</TableCell>
                    <TableCell>
                      <Button size="sm" variant="ghost" className="h-6 px-2 text-xs text-red-500 hover:text-red-600" onClick={() => handleForceExit(tr.trade_id, tr.pair)} disabled={isPending}>
                        <XCircleIcon className="size-3 mr-1" /> {t("exit_btn")}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Profit Chart */}
      {cumulative.length > 0 && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">{t("cumulative_profit")}</CardTitle></CardHeader>
          <CardContent>
            <figure role="img" aria-label={t("chart_cumulative_label")}>
            <ResponsiveContainer width="100%" height={250}>
              <LineChart data={cumulative}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip />
                <Line type="monotone" dataKey="profit" stroke="var(--primary)" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
            </figure>
          </CardContent>
        </Card>
      )}

      {/* Performance by Pair */}
      {performance.length > 0 && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">{t("performance_by_pair")}</CardTitle></CardHeader>
          <CardContent>
            <figure role="img" aria-label={t("chart_performance_label")}>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={performance.slice(0, 10)}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="pair" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip />
                <Bar dataKey="profit_abs" fill="var(--primary)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
            </figure>
          </CardContent>
        </Card>
      )}

      {/* Trade History with Filters */}
      <Card data-testid="trade-list">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">{t("trade_history")} ({filteredTrades.length}{filteredTrades.length !== history.count ? ` / ${history.count}` : ""})</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-2 items-end">
            <div className="w-36">
              <Select value={filterPair} onValueChange={(v) => v && setFilterPair(v)}>
                <SelectTrigger className="h-8 text-xs"><SelectValue placeholder={t("col_pair")} /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t("all_pairs")}</SelectItem>
                  {uniquePairs.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            {uniqueStrategies.length > 1 && (
              <div className="w-40">
                <Select value={filterStrategy} onValueChange={(v) => v && setFilterStrategy(v)}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue placeholder={t("strategy")} /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{t("all_strategies")}</SelectItem>
                    {uniqueStrategies.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}
            <Input type="date" value={filterDateFrom} onChange={e => setFilterDateFrom(e.target.value)} className="h-8 w-32 text-xs" />
            <Input type="date" value={filterDateTo} onChange={e => setFilterDateTo(e.target.value)} className="h-8 w-32 text-xs" />
            {(filterPair !== "all" || filterStrategy !== "all" || filterDateFrom || filterDateTo) && (
              <button onClick={() => { setFilterPair("all"); setFilterStrategy("all"); setFilterDateFrom(""); setFilterDateTo(""); }} className="text-xs text-muted-foreground hover:text-foreground underline h-8 flex items-center">{t("reset")}</button>
            )}
          </div>

          {(filterPair !== "all" || filterStrategy !== "all" || filterDateFrom || filterDateTo) && (
            <div className="flex gap-4 text-xs text-muted-foreground">
              <span>{t("pnl")}: <span className={filteredStats.totalPnl >= 0 ? "text-income font-medium" : "text-expense font-medium"}>{filteredStats.totalPnl >= 0 ? "+" : ""}{filteredStats.totalPnl.toFixed(2)}</span></span>
              <span>{t("win")}: {filteredStats.wins} / {t("loss")}: {filteredStats.losses}</span>
              <span>{t("win_rate_label")}: {filteredStats.total > 0 ? Math.round((filteredStats.wins / filteredStats.total) * 100) : 0}%</span>
            </div>
          )}

          {filteredTrades.length === 0 ? (
            <p className="text-muted-foreground text-sm">{t("no_trades_match")}</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("col_pair")}</TableHead>
                  <TableHead>{t("col_profit")}</TableHead>
                  <TableHead>{t("col_stake")}</TableHead>
                  <TableHead>{t("col_exit")}</TableHead>
                  <TableHead>{t("col_date")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredTrades.slice(0, 50).map((tr) => (
                  <TableRow key={tr.trade_id}>
                    <TableCell className="font-medium">{tr.pair}</TableCell>
                    <TableCell className={tr.profit_abs >= 0 ? "text-income" : "text-expense"}>
                      {tr.profit_abs >= 0 ? "+" : ""}{tr.profit_abs.toFixed(2)} ({tr.profit_pct.toFixed(1)}%)
                    </TableCell>
                    <TableCell>{tr.stake_amount.toFixed(2)}</TableCell>
                    <TableCell className="text-xs">{tr.exit_reason ?? "—"}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {tr.close_date ? new Date(tr.close_date).toLocaleDateString() : t("open")}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
      <ConfirmDialog
        open={forceExitState !== null}
        onOpenChange={(open) => { if (!open) setForceExitState(null); }}
        title={t("force_exit_confirm", { pair: forceExitState?.pair ?? "" })}
        confirmLabel={t("force_exit")}
        cancelLabel={t("cancel")}
        onConfirm={confirmForceExit}
        destructive
      />
    </div>
  );
}
