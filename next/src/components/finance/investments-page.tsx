"use client";

import { useState, useEffect, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { InsightsPanel } from "@/components/insights/insights-panel";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { ChevronDownIcon, ChevronRightIcon, AlertCircleIcon, RefreshCwIcon, BarChart3Icon, ListIcon, PieChartIcon, FileTextIcon } from "lucide-react";
import { toast } from "sonner";
import { syncIbkrToDb, getIbkrAllocation, getIbkrPerformance, syncIbkrTradesToDb } from "@/actions/brokers-ibkr";
import { syncTrading212Portfolio } from "@/actions/brokers-trading212";
import { syncEtorroPortfolio } from "@/actions/brokers-etorro";
import { getInvestmentsSummary, getBrokerTransactions } from "@/actions/brokers-common";

type BrokerDef = { id: string; name: string; icon: string; href: string; desc: string; brokerKey: string };

const BROKERS: BrokerDef[] = [
  { id: "ibkr", name: "Interactive Brokers", icon: "\u{1F3E6}", href: "/settings/integrations/ibkr", desc: "Stocks, ETFs, options, futures, forex", brokerKey: "IBKR" },
  { id: "etoro", name: "eTorro", icon: "\u{1F4CA}", href: "/settings/integrations/etoro", desc: "Social trading, crypto, stocks, ETFs", brokerKey: "ETORRO" },
  { id: "trading212", name: "Trading 212", icon: "\u{1F4C8}", href: "/settings/integrations/trading212", desc: "Stocks, ETFs (Invest/ISA accounts)", brokerKey: "TRADING212" },
];

type Position = {
  symbol: string; name: string | null; quantity: unknown; avgCost: unknown;
  marketPrice: unknown; marketValue: unknown; unrealizedPnl: unknown; currency: string; assetClass: string;
};

export type InvestmentsData = {
  totalPortfolio: number; totalPnl: number; connectedCount: number; positionsCount: number;
  connected: Record<string, boolean>;
  positionsByBroker: Record<string, (Position & { marketValueEur?: number; unrealizedPnlEur?: number })[]>;
  brokerSummaries: Record<string, { nav: number; navEur: number; pnl: number; pnlEur: number; cash: number; cashEur: number; currency: string }>;
  usdToEur?: number;
} | null;

type BrokerTx = {
  id: number; broker: string; symbol: string; type: string;
  quantity: unknown; price: unknown; amount: unknown; commission: unknown;
  currency: string; executedAt: string;
};

type AllocationData = {
  assetClass?: { long: Record<string, number>; short: Record<string, number> };
  sector?: { long: Record<string, number>; short: Record<string, number> };
};

type PerformanceData = {
  nav?: { data: number[]; dates: string[] };
  cps?: { data: number[]; dates: string[] };
};

const COLORS = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899", "#06b6d4", "#84cc16", "#f97316", "#6366f1"];

function AllocationChart({ data, title }: { data: Record<string, number>; title: string }) {
  const entries = Object.entries(data).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
  const total = entries.reduce((s, [, v]) => s + v, 0);
  if (total === 0) return null;

  return (
    <div className="space-y-2">
      <p className="text-xs font-medium text-muted-foreground">{title}</p>
      <div className="flex h-3 rounded-full overflow-hidden">
        {entries.map(([name, value], i) => (
          <div key={name} className="h-full" style={{ width: `${(value / total) * 100}%`, backgroundColor: COLORS[i % COLORS.length] }} title={`${name}: ${((value / total) * 100).toFixed(1)}%`} />
        ))}
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-1">
        {entries.map(([name, value], i) => (
          <span key={name} className="text-[10px] flex items-center gap-1">
            <span className="size-2 rounded-full inline-block" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
            {name} {((value / total) * 100).toFixed(1)}%
          </span>
        ))}
      </div>
    </div>
  );
}

function PerformanceChart({ data }: { data: PerformanceData }) {
  const nav = data.nav;
  if (!nav?.data?.length || !nav?.dates?.length) return <p className="text-xs text-muted-foreground">No performance data</p>;

  const values = nav.data;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const h = 120;
  const w = 400;
  const points = values.map((v, i) => `${(i / (values.length - 1)) * w},${h - ((v - min) / range) * h}`).join(" ");

  const startVal = values[0];
  const endVal = values[values.length - 1];
  const change = endVal - startVal;
  const changePct = startVal > 0 ? (change / startVal) * 100 : 0;

  return (
    <div className="space-y-2">
      <div className="flex items-baseline gap-2">
        <span className="text-sm font-medium">NAV</span>
        <span className={`text-xs ${change >= 0 ? "text-income" : "text-expense"}`}>
          {change >= 0 ? "+" : ""}{changePct.toFixed(2)}%
        </span>
      </div>
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-28" preserveAspectRatio="none">
        <polyline fill="none" stroke={change >= 0 ? "#22c55e" : "#ef4444"} strokeWidth="2" points={points} />
      </svg>
      <div className="flex justify-between text-[10px] text-muted-foreground">
        <span>{nav.dates[0]}</span>
        <span>{nav.dates[nav.dates.length - 1]}</span>
      </div>
    </div>
  );
}

function TransactionsTable({ transactions }: { transactions: BrokerTx[] }) {
  if (transactions.length === 0) return <p className="text-xs text-muted-foreground py-2">No transactions yet. Sync trades or import via Flex.</p>;

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Date</TableHead>
          <TableHead>Symbol</TableHead>
          <TableHead>Type</TableHead>
          <TableHead className="text-right">Qty</TableHead>
          <TableHead className="text-right">Price</TableHead>
          <TableHead className="text-right">Amount</TableHead>
          <TableHead className="text-right">Commission</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {transactions.map((tx) => (
          <TableRow key={tx.id}>
            <TableCell className="text-xs">{new Date(tx.executedAt).toLocaleDateString()}</TableCell>
            <TableCell className="font-medium text-xs">{tx.symbol}</TableCell>
            <TableCell>
              <Badge variant={tx.type === "BUY" ? "default" : "secondary"} className={`text-[10px] ${tx.type === "BUY" ? "bg-income/10 text-income" : "bg-expense/10 text-expense"}`}>
                {tx.type}
              </Badge>
            </TableCell>
            <TableCell className="text-right text-xs">{Number(tx.quantity).toFixed(2)}</TableCell>
            <TableCell className="text-right text-xs">{Number(tx.price).toFixed(2)}</TableCell>
            <TableCell className="text-right text-xs">{Number(tx.amount).toFixed(2)} {tx.currency}</TableCell>
            <TableCell className="text-right text-xs text-muted-foreground">{Number(tx.commission).toFixed(2)}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

type Tab = "positions" | "allocation" | "performance" | "transactions";

function BrokerSection({ broker, connected, positions, summary, t, onSync }: {
  broker: BrokerDef; connected: boolean;
  positions: (Position & { marketValueEur?: number; unrealizedPnlEur?: number })[];
  summary: { nav: number; navEur: number; pnl: number; pnlEur: number; cash: number; cashEur: number; currency: string } | null;
  t: (key: string) => string;
  onSync?: () => void;
}) {
  const [open, setOpen] = useState(positions.length > 0);
  const [syncing, setSyncing] = useState(false);
  const [tab, setTab] = useState<Tab>("positions");
  const [, startTransition] = useTransition();

  // Extended data (loaded on demand)
  const [allocation, setAllocation] = useState<AllocationData | null>(null);
  const [performance, setPerformance] = useState<PerformanceData | null>(null);
  const [transactions, setTransactions] = useState<BrokerTx[] | null>(null);

  const hasData = positions.length > 0 || summary;
  const isIbkr = broker.id === "ibkr";

  function loadTab(t: Tab) {
    setTab(t);
    if (t === "allocation" && !allocation && isIbkr) {
      startTransition(async () => {
        const res = await getIbkrAllocation();
        if (res.data) setAllocation(res.data as AllocationData);
        else if (res.error) toast.error(res.error);
      });
    }
    if (t === "performance" && !performance && isIbkr) {
      startTransition(async () => {
        const res = await getIbkrPerformance("1Y");
        if (res.data) setPerformance(res.data as PerformanceData);
        else if (res.error) toast.error(res.error);
      });
    }
    if (t === "transactions" && !transactions) {
      startTransition(async () => {
        const txs = await getBrokerTransactions(broker.brokerKey, 50);
        setTransactions(txs as unknown as BrokerTx[]);
      });
    }
  }

  function handleSyncTrades() {
    startTransition(async () => {
      const res = await syncIbkrTradesToDb();
      if (res.ok) {
        toast.success(res.message);
        const txs = await getBrokerTransactions("IBKR", 50);
        setTransactions(txs as unknown as BrokerTx[]);
      } else {
        toast.error(res.message);
      }
    });
  }

  return (
    <Card>
      <CardHeader className="cursor-pointer select-none py-3" onClick={() => setOpen(!open)}>
        <CardTitle className="text-base flex items-center gap-2">
          {open ? <ChevronDownIcon className="size-4" /> : <ChevronRightIcon className="size-4" />}
          {broker.icon} {broker.name}
          {summary && (
            <span className="text-sm font-normal text-muted-foreground ml-2">
              EUR {(summary.navEur || summary.nav).toLocaleString("en", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
          )}
          <div className="ml-auto flex items-center gap-1.5">
            {connected && onSync && (
              <Button size="sm" variant="ghost" className="h-6 px-2 text-xs" disabled={syncing} onClick={(e) => {
                e.stopPropagation();
                setSyncing(true);
                onSync();
                setTimeout(() => setSyncing(false), 3000);
              }}>
                <RefreshCwIcon className={`size-3 mr-1 ${syncing ? "animate-spin" : ""}`} /> Sync
              </Button>
            )}
            <Badge variant={connected ? "default" : "secondary"} className="text-xs">
              {connected ? t("connected") : t("not_connected")}
            </Badge>
          </div>
        </CardTitle>
      </CardHeader>
      {open && (
        <CardContent>
          {!connected ? (
            <div className="text-center py-4">
              <AlertCircleIcon className="size-6 mx-auto mb-2 text-muted-foreground/50" />
              <p className="text-sm text-muted-foreground">{broker.desc}</p>
              <a href={broker.href} className="inline-flex items-center justify-center rounded-md text-sm font-medium border bg-background hover:bg-accent px-3 py-1.5 mt-3">
                {t("configure_in_settings")}
              </a>
            </div>
          ) : !hasData ? (
            <div className="text-center py-4">
              <p className="text-sm text-muted-foreground">{t("connected_no_data")}</p>
            </div>
          ) : (
            <div className="space-y-3">
              {/* Broker KPIs */}
              {summary && (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-sm">
                  <div className="bg-muted rounded p-2">
                    <span className="text-xs text-muted-foreground">NAV</span>
                    <p className="font-semibold">EUR {(summary.navEur || summary.nav).toLocaleString("en", { minimumFractionDigits: 2 })}</p>
                    {summary.currency !== "EUR" && <p className="text-[10px] text-muted-foreground">{summary.currency} {summary.nav.toLocaleString("en", { minimumFractionDigits: 2 })}</p>}
                  </div>
                  <div className="bg-muted rounded p-2">
                    <span className="text-xs text-muted-foreground">P&L</span>
                    <p className={`font-semibold ${(summary.pnlEur || summary.pnl) >= 0 ? "text-income" : "text-expense"}`}>
                      {(summary.pnlEur || summary.pnl) >= 0 ? "+" : ""}EUR {(summary.pnlEur || summary.pnl).toLocaleString("en", { minimumFractionDigits: 2 })}
                    </p>
                  </div>
                  <div className="bg-muted rounded p-2">
                    <span className="text-xs text-muted-foreground">Cash</span>
                    <p className="font-semibold">EUR {(summary.cashEur || summary.cash).toLocaleString("en", { minimumFractionDigits: 2 })}</p>
                  </div>
                  <div className="bg-muted rounded p-2">
                    <span className="text-xs text-muted-foreground">{t("positions")}</span>
                    <p className="font-semibold">{positions.length}</p>
                  </div>
                </div>
              )}

              {/* Tab navigation (IBKR gets extra tabs) */}
              {isIbkr && (
                <div className="flex gap-1 border-b">
                  {([
                    { key: "positions" as Tab, icon: ListIcon, label: "Positions" },
                    { key: "allocation" as Tab, icon: PieChartIcon, label: "Allocation" },
                    { key: "performance" as Tab, icon: BarChart3Icon, label: "Performance" },
                    { key: "transactions" as Tab, icon: FileTextIcon, label: "Transactions" },
                  ]).map(({ key, icon: Icon, label }) => (
                    <button key={key} onClick={() => loadTab(key)}
                      className={`flex items-center gap-1 px-3 py-1.5 text-xs border-b-2 transition-colors ${tab === key ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}>
                      <Icon className="size-3" /> {label}
                    </button>
                  ))}
                </div>
              )}

              {/* Tab content */}
              {tab === "positions" && isIbkr && positions.length > 0 && (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Symbol</TableHead>
                      <TableHead>Name</TableHead>
                      <TableHead className="text-right">Qty</TableHead>
                      <TableHead className="text-right">Avg Cost</TableHead>
                      <TableHead className="text-right">Price</TableHead>
                      <TableHead className="text-right">Value</TableHead>
                      <TableHead className="text-right">P&L</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {positions.map((p) => {
                      const pnl = Number(p.unrealizedPnl);
                      const value = Number(p.marketValue);
                      const pnlPct = value > 0 ? (pnl / (value - pnl)) * 100 : 0;
                      return (
                        <TableRow key={p.symbol}>
                          <TableCell className="font-medium">{p.symbol}</TableCell>
                          <TableCell className="text-xs text-muted-foreground">{p.name ?? "\u2014"}</TableCell>
                          <TableCell className="text-right">{Number(p.quantity).toFixed(2)}</TableCell>
                          <TableCell className="text-right">{Number(p.avgCost).toFixed(2)}</TableCell>
                          <TableCell className="text-right">{Number(p.marketPrice).toFixed(2)}</TableCell>
                          <TableCell className="text-right">{value.toFixed(2)}</TableCell>
                          <TableCell className={`text-right ${pnl >= 0 ? "text-income" : "text-expense"}`}>
                            {pnl >= 0 ? "+" : ""}{pnl.toFixed(2)} ({pnlPct.toFixed(1)}%)
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}

              {tab === "allocation" && isIbkr && (
                <div className="space-y-4 py-2">
                  {allocation ? (
                    <>
                      {allocation.assetClass?.long && <AllocationChart data={allocation.assetClass.long} title="By Asset Class" />}
                      {allocation.sector?.long && <AllocationChart data={allocation.sector.long} title="By Sector" />}
                    </>
                  ) : (
                    <p className="text-xs text-muted-foreground">Loading allocation data...</p>
                  )}
                </div>
              )}

              {tab === "performance" && isIbkr && (
                <div className="py-2">
                  {performance ? <PerformanceChart data={performance} /> : <p className="text-xs text-muted-foreground">Loading performance data...</p>}
                </div>
              )}

              {tab === "transactions" && (
                <div className="space-y-2 py-2">
                  {isIbkr && (
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" className="h-7 text-xs" onClick={handleSyncTrades}>
                        <RefreshCwIcon className="size-3 mr-1" /> Sync Trades
                      </Button>
                    </div>
                  )}
                  {transactions ? <TransactionsTable transactions={transactions} /> : <p className="text-xs text-muted-foreground">Loading transactions...</p>}
                </div>
              )}

              {/* Non-IBKR brokers: show positions table with Asset column */}
              {!isIbkr && positions.length > 0 && (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Asset</TableHead>
                      <TableHead className="text-right">Qty</TableHead>
                      <TableHead className="text-right">Avg Cost</TableHead>
                      <TableHead className="text-right">Price</TableHead>
                      <TableHead className="text-right">Value</TableHead>
                      <TableHead className="text-right">P&L</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {positions.map((p) => {
                      const pnl = Number(p.unrealizedPnl);
                      const value = Number(p.marketValue);
                      const pnlPct = value > 0 ? (pnl / (value - pnl)) * 100 : 0;
                      const displayName = p.name && p.name !== p.symbol ? p.name : null;
                      return (
                        <TableRow key={p.symbol}>
                          <TableCell>
                            <div>
                              <span className="font-medium">{p.symbol}</span>
                              {displayName && <p className="text-xs text-muted-foreground truncate max-w-[200px]">{displayName}</p>}
                            </div>
                          </TableCell>
                          <TableCell className="text-right">{Number(p.quantity).toFixed(2)}</TableCell>
                          <TableCell className="text-right">{Number(p.avgCost).toFixed(2)}</TableCell>
                          <TableCell className="text-right">{Number(p.marketPrice).toFixed(2)}</TableCell>
                          <TableCell className="text-right">{value.toFixed(2)}</TableCell>
                          <TableCell className={`text-right ${pnl >= 0 ? "text-income" : "text-expense"}`}>
                            {pnl >= 0 ? "+" : ""}{pnl.toFixed(2)} ({pnlPct.toFixed(1)}%)
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </div>
          )}
        </CardContent>
      )}
    </Card>
  );
}

interface InvestmentsPageProps {
  initialData: InvestmentsData;
}

export function InvestmentsPage({ initialData }: InvestmentsPageProps) {
  const t = useTranslations("investments");
  const [, startTransition] = useTransition();
  const [data, setData] = useState<InvestmentsData>(initialData);

  // Fire-and-forget background sync on mount, then refresh data
  useEffect(() => {
    fetch("/api/sync/investments", { method: "POST" })
      .catch(() => {})
      .finally(() => {
        startTransition(async () => {
          try {
            const res = await getInvestmentsSummary();
            setData(res);
          } catch { /* graceful */ }
        });
      });
  }, []);

  function handleSync(brokerId: string) {
    startTransition(async () => {
      let res: { ok: boolean; message: string };
      if (brokerId === "ibkr") {
        res = await syncIbkrToDb();
      } else if (brokerId === "trading212") {
        res = await syncTrading212Portfolio();
      } else if (brokerId === "etoro") {
        res = await syncEtorroPortfolio();
      } else {
        res = { ok: false, message: "Sync not yet implemented" };
      }
      if (res.ok) {
        toast.success(res.message);
        const fresh = await getInvestmentsSummary();
        setData(fresh);
      } else {
        toast.error(res.message);
      }
    });
  }

  const totalPortfolio = data?.totalPortfolio ?? 0;
  const totalPnl = data?.totalPnl ?? 0;
  const connectedCount = data?.connectedCount ?? 0;
  const positionsCount = data?.positionsCount ?? 0;

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold">{"\u{1F4CA}"} {t("title")}</h2>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card size="sm">
          <CardContent>
            <div className="text-xs text-muted-foreground">{t("total_portfolio")}</div>
            <div className="text-lg font-semibold">
              {totalPortfolio > 0 ? `EUR ${totalPortfolio.toLocaleString("en", { minimumFractionDigits: 2 })}` : "\u2014"}
            </div>
          </CardContent>
        </Card>
        <Card size="sm">
          <CardContent>
            <div className="text-xs text-muted-foreground">{t("total_pnl")}</div>
            <div className={`text-lg font-semibold ${totalPnl > 0 ? "text-income" : totalPnl < 0 ? "text-expense" : ""}`}>
              {totalPnl !== 0 ? `${totalPnl >= 0 ? "+" : ""}EUR ${totalPnl.toLocaleString("en", { minimumFractionDigits: 2 })}` : "\u2014"}
            </div>
          </CardContent>
        </Card>
        <Card size="sm">
          <CardContent>
            <div className="text-xs text-muted-foreground">{t("brokers")}</div>
            <div className="text-lg font-semibold">{connectedCount}</div>
          </CardContent>
        </Card>
        <Card size="sm">
          <CardContent>
            <div className="text-xs text-muted-foreground">{t("positions")}</div>
            <div className="text-lg font-semibold">{positionsCount}</div>
          </CardContent>
        </Card>
      </div>

      {/* Broker Sections */}
      {BROKERS.map((b) => (
        <BrokerSection
          key={b.id}
          broker={b}
          connected={!!data?.connected[b.id]}
          positions={data?.positionsByBroker[b.brokerKey] ?? []}
          summary={data?.brokerSummaries[b.brokerKey] ?? null}
          t={t}
          onSync={data?.connected[b.id] ? () => handleSync(b.id) : undefined}
        />
      ))}

      <InsightsPanel page="investments" />
    </div>
  );
}
