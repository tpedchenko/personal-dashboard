"use client";

import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  SparklesIcon,
  Loader2Icon,
  ChevronDownIcon,
  ChevronRightIcon,
  SaveIcon,
  BanknoteIcon,
  TrendingUpIcon,
  HeartPulseIcon,
  DumbbellIcon,
  ShoppingCartIcon,
  ThumbsUpIcon,
  RotateCcwIcon,
  HistoryIcon,
  FlaskConicalIcon,
} from "lucide-react";
import {
  getAllInsightsForSettings,
  getInsightPrompt,
  setInsightPrompt,
  resetInsightPrompt,
  getInsightFeedbackStats,
  getABTestStats,
  type InsightRow,
  type Insight,
  type FeedbackPageStats,
  type PromptChange,
  type ABTestPageStats,
} from "@/actions/insights";
import { DEFAULT_PROMPTS } from "@/lib/ai-insights-prompts";

const PAGE_ICONS: Record<string, typeof SparklesIcon> = {
  finance: BanknoteIcon,
  investments: TrendingUpIcon,
  "my-day": HeartPulseIcon,
  gym: DumbbellIcon,
  exercises: DumbbellIcon,
  list: ShoppingCartIcon,
};

const PAGE_LABELS: Record<string, string> = {
  finance: "Finance",
  investments: "Investments",
  "my-day": "My Day",
  gym: "Gym",
  exercises: "Exercises",
  list: "Shopping List",
};

const PERIOD_LABELS: Record<string, string> = {
  today: "Today",
  this_week: "This Week",
  this_month: "This Month",
  this_year: "This Year",
};

const PAGES = ["finance", "investments", "my-day", "gym", "exercises", "list"] as const;

function classifyPeriod(period: string): string {
  if (!period) return "other";
  // YYYY-MM-DD format = daily
  if (/^\d{4}-\d{2}-\d{2}$/.test(period)) return "today";
  // YYYY-Wxx format = weekly
  if (/^\d{4}-W\d{2}$/.test(period)) return "this_week";
  // YYYY-MM format = monthly
  if (/^\d{4}-\d{2}$/.test(period)) return "this_month";
  // YYYY format = yearly
  if (/^\d{4}$/.test(period)) return "this_year";
  return "other";
}

function parseInsights(json: string): Insight[] {
  try {
    const parsed = JSON.parse(json);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

type GroupedInsights = Record<string, Record<string, InsightRow[]>>;

function groupInsights(rows: InsightRow[]): GroupedInsights {
  const grouped: GroupedInsights = {};
  for (const page of PAGES) {
    grouped[page] = {};
  }
  for (const row of rows) {
    if (!grouped[row.page]) grouped[row.page] = {};
    const periodType = classifyPeriod(row.period);
    if (!grouped[row.page][periodType]) grouped[row.page][periodType] = [];
    grouped[row.page][periodType].push(row);
  }
  return grouped;
}

export default function AiInsightsSettingsPage() {
  const t = useTranslations("settings");
  const [rows, setRows] = useState<InsightRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set());
  const [prompts, setPrompts] = useState<Record<string, string>>({});
  const [editingPrompt, setEditingPrompt] = useState<string | null>(null);
  const [promptDraft, setPromptDraft] = useState("");
  const [savingPrompt, setSavingPrompt] = useState(false);
  const [feedbackStats, setFeedbackStats] = useState<FeedbackPageStats[]>([]);
  const [promptChanges, setPromptChanges] = useState<PromptChange[]>([]);
  const [resettingPrompt, setResettingPrompt] = useState<string | null>(null);
  const [abStats, setAbStats] = useState<ABTestPageStats[]>([]);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    try {
      const [data, stats, ab] = await Promise.all([
        getAllInsightsForSettings(),
        getInsightFeedbackStats(),
        getABTestStats(),
      ]);
      setRows(data);
      setFeedbackStats(stats.pageStats);
      setPromptChanges(stats.promptChanges);
      setAbStats(ab);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }

  function toggleSection(key: string) {
    setExpandedSections((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  async function startEditPrompt(page: string) {
    if (editingPrompt === page) {
      setEditingPrompt(null);
      return;
    }
    // Load saved prompt or use default
    let saved = prompts[page];
    if (saved === undefined) {
      saved = await getInsightPrompt(page);
      setPrompts((prev) => ({ ...prev, [page]: saved }));
    }
    setPromptDraft(saved || DEFAULT_PROMPTS[page] || "");
    setEditingPrompt(page);
  }

  async function savePromptHandler(page: string) {
    setSavingPrompt(true);
    try {
      await setInsightPrompt(page, promptDraft);
      setPrompts((prev) => ({ ...prev, [page]: promptDraft }));
      setEditingPrompt(null);
    } catch {
      // ignore
    } finally {
      setSavingPrompt(false);
    }
  }

  async function handleResetPrompt(page: string) {
    setResettingPrompt(page);
    try {
      await resetInsightPrompt(page);
      setPrompts((prev) => ({ ...prev, [page]: "" }));
      if (editingPrompt === page) {
        setPromptDraft(DEFAULT_PROMPTS[page] || "");
      }
      // Reload stats to reflect audit log change
      const stats = await getInsightFeedbackStats();
      setPromptChanges(stats.promptChanges);
    } catch {
      // ignore
    } finally {
      setResettingPrompt(null);
    }
  }

  const grouped = groupInsights(rows);
  const hasAnyFeedback = feedbackStats.some((s) => s.likes > 0 || s.dislikes > 0);

  if (loading) {
    return (
      <Card className="p-6">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2Icon className="size-4 animate-spin" />
          <span className="text-sm">{t("ai_insights_loading")}</span>
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 mb-2">
        <SparklesIcon className="size-5 text-primary" />
        <h2 className="text-lg font-bold">{t("ai_insights_settings")}</h2>
      </div>

      {/* Feedback Stats */}
      {hasAnyFeedback && (
        <Card className="overflow-hidden">
          <div className="flex items-center gap-2 p-4 border-b">
            <ThumbsUpIcon className="size-4 text-primary" />
            <span className="font-semibold text-sm">{t("ai_insights_feedback_stats")}</span>
          </div>
          <div className="p-4">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-muted-foreground text-left">
                  <th className="pb-2 font-medium">{t("ai_insights_page")}</th>
                  <th className="pb-2 font-medium text-center">👍</th>
                  <th className="pb-2 font-medium text-center">👎</th>
                  <th className="pb-2 font-medium text-right">{t("ai_insights_last_feedback")}</th>
                </tr>
              </thead>
              <tbody>
                {feedbackStats
                  .filter((s) => s.likes > 0 || s.dislikes > 0)
                  .map((stat) => (
                    <tr key={stat.page} className="border-t border-muted/30">
                      <td className="py-1.5">{PAGE_LABELS[stat.page] || stat.page}</td>
                      <td className="py-1.5 text-center text-green-600">{stat.likes}</td>
                      <td className="py-1.5 text-center text-red-500">{stat.dislikes}</td>
                      <td className="py-1.5 text-right text-muted-foreground">
                        {stat.lastFeedback
                          ? new Date(stat.lastFeedback).toLocaleDateString()
                          : "—"}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* A/B Test Comparison */}
      {abStats.some((s) => s.hasCustomPrompt || s.defaultTotal + s.customTotal > 0) && (
        <Card className="overflow-hidden">
          <div className="flex items-center gap-2 p-4 border-b">
            <FlaskConicalIcon className="size-4 text-primary" />
            <span className="font-semibold text-sm">A/B Test — Default vs Custom Prompt</span>
          </div>
          <div className="p-4">
            <p className="text-xs text-muted-foreground mb-3">
              When a custom prompt is set, insights are generated with both default and custom prompts.
              One is randomly shown (50/50). Feedback tracks which variant wins.
            </p>
            <table className="w-full text-xs">
              <thead>
                <tr className="text-muted-foreground text-left">
                  <th className="pb-2 font-medium">{t("ai_insights_page")}</th>
                  <th className="pb-2 font-medium text-center" colSpan={2}>Default</th>
                  <th className="pb-2 font-medium text-center" colSpan={2}>Custom</th>
                  <th className="pb-2 font-medium text-center">Winner</th>
                </tr>
                <tr className="text-muted-foreground/70 text-[10px]">
                  <th></th>
                  <th className="pb-1 text-center font-normal">Win %</th>
                  <th className="pb-1 text-center font-normal">Votes</th>
                  <th className="pb-1 text-center font-normal">Win %</th>
                  <th className="pb-1 text-center font-normal">Votes</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {abStats
                  .filter((s) => s.hasCustomPrompt || s.defaultTotal + s.customTotal > 0)
                  .map((stat) => {
                    const totalVotes = stat.defaultTotal + stat.customTotal;
                    let winner = "—";
                    let winnerClass = "text-muted-foreground";
                    if (totalVotes >= 3) {
                      if (stat.defaultWinRate > stat.customWinRate) {
                        winner = "Default";
                        winnerClass = "text-blue-500 font-medium";
                      } else if (stat.customWinRate > stat.defaultWinRate) {
                        winner = "Custom";
                        winnerClass = "text-green-500 font-medium";
                      } else {
                        winner = "Tied";
                      }
                    } else if (totalVotes > 0) {
                      winner = "Too few";
                      winnerClass = "text-muted-foreground/50";
                    } else if (stat.hasCustomPrompt) {
                      winner = "Pending";
                      winnerClass = "text-muted-foreground/50";
                    }

                    return (
                      <tr key={stat.page} className="border-t border-muted/30">
                        <td className="py-1.5">
                          {PAGE_LABELS[stat.page] || stat.page}
                          {stat.hasCustomPrompt && (
                            <span className="ml-1 text-[9px] text-primary/60" title="Custom prompt active">A/B</span>
                          )}
                        </td>
                        <td className="py-1.5 text-center">
                          {stat.defaultTotal > 0 ? `${stat.defaultWinRate}%` : "—"}
                        </td>
                        <td className="py-1.5 text-center text-muted-foreground">
                          {stat.defaultTotal > 0 ? `${stat.defaultLikes}/${stat.defaultTotal}` : "—"}
                        </td>
                        <td className="py-1.5 text-center">
                          {stat.customTotal > 0 ? `${stat.customWinRate}%` : "—"}
                        </td>
                        <td className="py-1.5 text-center text-muted-foreground">
                          {stat.customTotal > 0 ? `${stat.customLikes}/${stat.customTotal}` : "—"}
                        </td>
                        <td className={`py-1.5 text-center ${winnerClass}`}>
                          {winner}
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Prompt Change History */}
      {promptChanges.length > 0 && (
        <Card className="overflow-hidden">
          <div className="flex items-center gap-2 p-4 border-b">
            <HistoryIcon className="size-4 text-primary" />
            <span className="font-semibold text-sm">{t("ai_insights_prompt_history")}</span>
          </div>
          <div className="p-4 space-y-1.5">
            {promptChanges.map((change, idx) => (
              <div
                key={idx}
                className="flex items-center justify-between text-xs border-b border-muted/20 pb-1.5 last:border-0"
              >
                <div>
                  <span className="font-medium">{PAGE_LABELS[change.page] || change.page}</span>
                  <span className="text-muted-foreground ml-2">{change.details.split("|")[1]?.trim()}</span>
                </div>
                <span className="text-muted-foreground text-[10px]">
                  {change.changedAt ? new Date(change.changedAt).toLocaleString() : ""}
                </span>
              </div>
            ))}
          </div>
        </Card>
      )}

      {PAGES.map((page) => {
        const Icon = PAGE_ICONS[page] || SparklesIcon;
        const pageData = grouped[page] || {};
        const totalInsights = Object.values(pageData).reduce(
          (sum, arr) => sum + arr.length,
          0,
        );
        const sectionKey = `section-${page}`;
        const isExpanded = expandedSections.has(sectionKey);

        return (
          <Card key={page} className="overflow-hidden">
            {/* Page header */}
            <button
              onClick={() => toggleSection(sectionKey)}
              className="w-full flex items-center gap-3 p-4 hover:bg-muted/50 transition-colors text-left"
            >
              {isExpanded ? (
                <ChevronDownIcon className="size-4 shrink-0" />
              ) : (
                <ChevronRightIcon className="size-4 shrink-0" />
              )}
              <Icon className="size-4 shrink-0 text-primary" />
              <span className="font-semibold text-sm">{PAGE_LABELS[page]}</span>
              <Badge variant="outline" className="text-[10px] ml-auto">
                {totalInsights} {totalInsights === 1 ? "insight" : "insights"}
              </Badge>
            </button>

            {isExpanded && (
              <div className="border-t px-4 pb-4 space-y-3">
                {/* Prompt editor */}
                <div className="pt-3">
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-xs h-7"
                      onClick={() => startEditPrompt(page)}
                    >
                      {editingPrompt === page ? "Hide Prompt" : "Edit Prompt"}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-xs h-7 text-muted-foreground"
                      onClick={() => handleResetPrompt(page)}
                      disabled={resettingPrompt === page}
                    >
                      {resettingPrompt === page ? (
                        <Loader2Icon className="size-3 animate-spin mr-1" />
                      ) : (
                        <RotateCcwIcon className="size-3 mr-1" />
                      )}
                      {t("ai_insights_reset_default")}
                    </Button>
                  </div>

                  {editingPrompt === page && (
                    <div className="mt-2 space-y-2 border rounded-lg p-3 bg-muted/30">
                      <textarea
                        className="w-full text-xs bg-background border rounded-md p-2 min-h-[80px] resize-y"
                        value={promptDraft}
                        onChange={(e) => setPromptDraft(e.target.value)}
                        placeholder="Custom prompt..."
                      />
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          className="h-7 text-xs"
                          onClick={() => savePromptHandler(page)}
                          disabled={savingPrompt}
                        >
                          {savingPrompt ? (
                            <Loader2Icon className="size-3 animate-spin mr-1" />
                          ) : (
                            <SaveIcon className="size-3 mr-1" />
                          )}
                          {t("ai_insights_save_prompt")}
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 text-xs"
                          onClick={() =>
                            setPromptDraft(DEFAULT_PROMPTS[page] || "")
                          }
                        >
                          {t("ai_insights_reset_default")}
                        </Button>
                      </div>
                    </div>
                  )}
                </div>

                {/* Periods */}
                {Object.entries(PERIOD_LABELS).map(([periodKey, periodLabel]) => {
                  const periodRows = pageData[periodKey] || [];
                  if (periodRows.length === 0) return null;

                  return (
                    <div key={periodKey} className="space-y-2">
                      <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                        {periodLabel}
                      </h4>
                      {periodRows.map((row, idx) => {
                        const insights = parseInsights(row.insightsJson);
                        return (
                          <div
                            key={idx}
                            className="border rounded-lg p-3 bg-muted/20 space-y-2"
                          >
                            <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                              <span>
                                {row.period} | {row.model}
                                {row.variant === "custom" && <span className="ml-1 text-primary/70">A/B:custom</span>}
                              </span>
                              <span>
                                {row.generatedAt
                                  ? new Date(row.generatedAt).toLocaleString()
                                  : row.date}
                              </span>
                            </div>
                            {row.promptUsed && (
                              <details className="text-xs">
                                <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
                                  {t("ai_insights_prompt_used")}
                                </summary>
                                <pre className="mt-1 whitespace-pre-wrap text-[11px] bg-muted/50 rounded p-2 max-h-32 overflow-y-auto">
                                  {row.promptUsed}
                                </pre>
                              </details>
                            )}
                            {insights.length > 0 ? (
                              <div className="space-y-1.5">
                                {insights.map(
                                  (
                                    insight: Insight,
                                    i: number,
                                  ) => (
                                    <div
                                      key={i}
                                      className="text-xs leading-relaxed"
                                    >
                                      <span className="font-medium">
                                        {insight.title}
                                      </span>
                                      {insight.body && (
                                        <span className="text-muted-foreground">
                                          {" "}
                                          — {insight.body}
                                        </span>
                                      )}
                                      {insight.comparison && (
                                        <span className="text-muted-foreground/70 ml-1">
                                          ({insight.comparison})
                                        </span>
                                      )}
                                    </div>
                                  ),
                                )}
                              </div>
                            ) : (
                              <p className="text-xs text-muted-foreground">
                                {t("ai_insights_no_data")}
                              </p>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  );
                })}

                {/* "other" period rows (legacy, no recognized period) */}
                {(pageData["other"] || []).length > 0 && (
                  <div className="space-y-2">
                    <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      Other
                    </h4>
                    {pageData["other"].map((row, idx) => {
                      const insights = parseInsights(row.insightsJson);
                      return (
                        <div
                          key={idx}
                          className="border rounded-lg p-3 bg-muted/20 space-y-2"
                        >
                          <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                            <span>
                              {row.period || "legacy"} | {row.model}
                            </span>
                            <span>
                              {row.generatedAt
                                ? new Date(row.generatedAt).toLocaleString()
                                : row.date}
                            </span>
                          </div>
                          {insights.length > 0 ? (
                            <div className="space-y-1.5">
                              {insights.map(
                                (insight: Insight, i: number) => (
                                  <div key={i} className="text-xs leading-relaxed">
                                    <span className="font-medium">
                                      {insight.title}
                                    </span>
                                    {insight.body && (
                                      <span className="text-muted-foreground">
                                        {" "}
                                        — {insight.body}
                                      </span>
                                    )}
                                  </div>
                                ),
                              )}
                            </div>
                          ) : (
                            <p className="text-xs text-muted-foreground">
                              {t("ai_insights_no_data")}
                            </p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}

                {totalInsights === 0 && (
                  <p className="text-sm text-muted-foreground py-2">
                    {t("ai_insights_empty_section")}
                  </p>
                )}
              </div>
            )}
          </Card>
        );
      })}
    </div>
  );
}
