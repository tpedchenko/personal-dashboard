"use client";

import { useState, useEffect, useTransition } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  SparklesIcon,
  Loader2Icon,
  RefreshCwIcon,
  SettingsIcon,
  SaveIcon,
  XIcon,
} from "lucide-react";

// Inline SVGs to avoid Turbopack tree-shaking lucide imports
const ThumbsUpSvg = () => <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M7 10v12"/><path d="M15 5.88 14 10h5.83a2 2 0 0 1 1.92 2.56l-2.33 8A2 2 0 0 1 17.5 22H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h2.76a2 2 0 0 0 1.79-1.11L12 2a3.13 3.13 0 0 1 3 3.88Z"/></svg>;
const ThumbsDownSvg = () => <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 14V2"/><path d="M9 18.12 10 14H4.17a2 2 0 0 1-1.92-2.56l2.33-8A2 2 0 0 1 6.5 2H20a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-2.76a2 2 0 0 0-1.79 1.11L12 22a3.13 3.13 0 0 1-3-3.88Z"/></svg>;
import { getPageInsights, getInsightPrompt, setInsightPrompt, submitInsightFeedback, type Insight } from "@/actions/insights/index";
import { DEFAULT_PROMPTS } from "@/lib/ai-insights-prompts";

const defaultPrompts = DEFAULT_PROMPTS;

type Props = {
  page?: string;
};

export function InsightsPanel({ page = "finance" }: Props) {
  const activePeriod = "this_month" as const;

  const [insights, setInsights] = useState<Insight[]>([]);
  const [insightId, setInsightId] = useState<number | null>(null);
  const [generatedAt, setGeneratedAt] = useState<string | null>(null);
  const [variant, setVariant] = useState<string>("default");
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [showPromptEditor, setShowPromptEditor] = useState(false);
  const [feedbackReaction, setFeedbackReaction] = useState<string | null>(null);
  const [showFeedbackDialog, setShowFeedbackDialog] = useState(false);
  const [feedbackComment, setFeedbackComment] = useState("");
  const [feedbackPending, startFeedback] = useTransition();
  const [promptText, setPromptText] = useState("");
  const [savingPrompt, setSavingPrompt] = useState(false);

  useEffect(() => {
    loadInsights();
  }, [page, activePeriod]);

  async function loadInsights() {
    setLoading(true);
    try {
      const data = await getPageInsights(page, activePeriod);
      setInsights(data.insights);
      setInsightId(data.insightId);
      setGeneratedAt(data.generatedAt);
      setVariant(data.variant || "default");
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }

  /**
   * Fire-and-forget: triggers generation via API route (POST /api/insights).
   * Does NOT block navigation -- uses a detached fetch with .then/.catch.
   */
  function generateInsights() {
    setGenerating(true);
    const locale = document.cookie.match(/locale=(\w+)/)?.[1] || "uk";

    fetch("/api/insights", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ page, period: activePeriod, locale }),
    })
      .then(async (res) => {
        if (res.ok) {
          const result = await res.json();
          if (result.insights?.length > 0) {
            setInsights(result.insights);
            setInsightId(result.insightId ?? null);
            setGeneratedAt(result.generatedAt);
            setVariant(result.variant || "default");
          }
        }
      })
      .catch(() => {
        // silently fail -- user can retry
      })
      .finally(() => {
        setGenerating(false);
      });
  }

  async function openPromptEditor() {
    const saved = await getInsightPrompt(page);
    setPromptText(saved || defaultPrompts[page] || "");
    setShowPromptEditor(true);
  }

  async function savePrompt() {
    setSavingPrompt(true);
    try {
      await setInsightPrompt(page, promptText);
      setShowPromptEditor(false);
    } catch {
      // ignore
    } finally {
      setSavingPrompt(false);
    }
  }

  if (loading) {
    return (
      <Card className="p-4">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2Icon className="size-4 animate-spin" />
          <span className="text-sm">Loading insights...</span>
        </div>
      </Card>
    );
  }

  return (
    <Card className="p-5 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <SparklesIcon className="size-4 text-primary" />
          <h3 className="font-bold text-sm">AI Insights</h3>
        </div>
        <div className="flex items-center gap-1">
          {generatedAt && (
            <span className="text-[10px] text-muted-foreground mr-1">
              {new Date(generatedAt).toLocaleDateString()}
              {variant === "custom" && <span className="ml-1 text-primary/70" title="A/B test: custom prompt variant">A/B</span>}
            </span>
          )}
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0"
            onClick={openPromptEditor}
            title="Edit prompt"
          >
            <SettingsIcon className="size-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0"
            onClick={generateInsights}
            disabled={generating}
            title="Regenerate"
          >
            {generating ? (
              <Loader2Icon className="size-3.5 animate-spin" />
            ) : (
              <RefreshCwIcon className="size-3.5" />
            )}
          </Button>
        </div>
      </div>

      {/* Generating indicator */}
      {generating && (
        <div className="flex items-center gap-2 text-muted-foreground py-1">
          <Loader2Icon className="size-3.5 animate-spin" />
          <span className="text-xs">Generating insights... You can navigate away.</span>
        </div>
      )}

      {/* Prompt Editor */}
      {showPromptEditor && (
        <div className="space-y-2 border rounded-lg p-3 bg-muted/30">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium">Prompt for {page}</span>
            <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => setShowPromptEditor(false)}>
              <XIcon className="size-3" />
            </Button>
          </div>
          <textarea
            className="w-full text-xs bg-background border rounded-md p-2 min-h-[80px] resize-y"
            value={promptText}
            onChange={(e) => setPromptText(e.target.value)}
            placeholder="Custom prompt for AI insights generation..."
          />
          <div className="flex gap-2">
            <Button size="sm" className="h-7 text-xs" onClick={savePrompt} disabled={savingPrompt}>
              {savingPrompt ? <Loader2Icon className="size-3 animate-spin mr-1" /> : <SaveIcon className="size-3 mr-1" />}
              Save & Regenerate
            </Button>
            <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => {
              setPromptText(defaultPrompts[page] || "");
            }}>
              Reset to default
            </Button>
          </div>
        </div>
      )}

      {insights.length === 0 && !generating ? (
        <div className="text-center py-4">
          <p className="text-sm text-muted-foreground mb-2">No insights yet</p>
          <Button
            variant="outline"
            size="sm"
            onClick={generateInsights}
            disabled={generating}
          >
            Generate Insights
          </Button>
        </div>
      ) : (
        <div className="space-y-1">
          <p className="text-sm text-foreground/90 leading-relaxed">
            {insights.map((insight) => insight.body).join(" ")}
          </p>
          <div className="flex items-center gap-0.5 justify-end" style={{ display: insightId ? "flex" : "none" }}>
              <Button
                variant="ghost"
                size="sm"
                className={`h-7 w-7 p-0 ${feedbackReaction === "like" ? "text-green-500" : "text-muted-foreground opacity-50 hover:opacity-100"}`}
                onClick={() => {
                  setFeedbackReaction("like");
                  if (insightId) startFeedback(async () => { await submitInsightFeedback(insightId, page, activePeriod, "like", undefined, variant); });
                }}
                disabled={feedbackPending}
              >
                <ThumbsUpSvg />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className={`h-7 w-7 p-0 ${feedbackReaction === "dislike" ? "text-red-500" : "text-muted-foreground opacity-50 hover:opacity-100"}`}
                onClick={() => setShowFeedbackDialog(true)}
                disabled={feedbackPending}
              >
                <ThumbsDownSvg />
              </Button>
          </div>
        </div>
      )}

      {/* Feedback dialog */}
      <Dialog open={showFeedbackDialog} onOpenChange={setShowFeedbackDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>How to improve?</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="flex flex-wrap gap-1.5">
              {["More specific numbers", "Compare with previous period", "Shorter and to the point", "More actionable recommendations"].map(s => (
                <button key={s} type="button" className={`px-2.5 py-1 rounded-full text-xs border transition-colors ${feedbackComment.includes(s) ? "bg-primary text-primary-foreground border-primary" : "bg-muted text-muted-foreground border-transparent hover:border-primary/50"}`}
                  onClick={() => setFeedbackComment(prev => prev ? prev + ". " + s : s)}>{s}</button>
              ))}
            </div>
            <textarea className="w-full border rounded-md p-2 min-h-[80px] text-sm bg-background" value={feedbackComment} onChange={e => setFeedbackComment(e.target.value)} placeholder="Describe what could be better..." />
            <div className="flex gap-2 justify-end">
              <Button variant="outline" size="sm" onClick={() => setShowFeedbackDialog(false)}>Cancel</Button>
              <Button size="sm" disabled={feedbackPending || !feedbackComment.trim()} onClick={() => {
                setFeedbackReaction("dislike");
                startFeedback(async () => {
                  if (insightId) await submitInsightFeedback(insightId, page, activePeriod, "dislike", feedbackComment, variant);
                  setShowFeedbackDialog(false);
                  setFeedbackComment("");
                });
              }}>Send</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
