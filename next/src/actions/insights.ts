"use server";

import { generateText } from "ai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createGroq } from "@ai-sdk/groq";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/current-user";
import { getSecretValue } from "@/actions/settings";
import { toDateOnly, dateToString } from "@/lib/date-utils";

export type Insight = {
  domain: string;
  severity: "info" | "warning" | "action";
  title: string;
  body: string;
  comparison?: string;
};

export type PageInsights = {
  page: string;
  period: string;
  insightId: number | null;
  insights: Insight[];
  generatedAt: string | null;
  model: string;
  variant: string;
};

import { periodKeyFromPreset, getDateRangesForPreset, DEFAULT_PROMPTS, resolvePrompt } from "@/lib/ai-insights-prompts";

/**
 * Human-readable comparison period for a preset (used as {comparison_period} placeholder).
 */
function comparisonPeriodForPreset(preset?: string): string {
  const now = new Date();
  const d = now.getDate();
  const dow = now.getDay();
  const mondayOffset = dow === 0 ? 6 : dow - 1;
  const dayOfWeek = mondayOffset + 1; // 1=Mon

  switch (preset) {
    case "today":
      return "вчора";
    case "this_week":
      return `минулий тиждень (перші ${dayOfWeek} днів)`;
    case "prev_week":
      return "позаминулий тиждень";
    case "this_month":
      return `минулий місяць (до ${d} числа)`;
    case "prev_month":
      return "позаминулий місяць";
    case "this_year": {
      const monthNames = ["січня", "лютого", "березня", "квітня", "травня", "червня",
        "липня", "серпня", "вересня", "жовтня", "листопада", "грудня"];
      return `минулий рік (до ${d} ${monthNames[now.getMonth()]})`;
    }
    case "prev_year":
      return "позаминулий рік";
    default:
      return "минулий місяць";
  }
}

/**
 * Human-readable period label for a preset (used as {period} placeholder).
 */
function periodLabelForPreset(preset?: string): string {
  switch (preset) {
    case "today":
      return "сьогодні";
    case "this_week":
      return "цей тиждень";
    case "prev_week":
      return "минулий тиждень";
    case "this_month":
      return "цей місяць";
    case "prev_month":
      return "минулий місяць";
    case "this_year":
      return "цей рік";
    case "prev_year":
      return "минулий рік";
    default:
      return "цей місяць";
  }
}

function parseInsightsJson(raw: string, page: string): Insight[] {
  try {
    const parsed = JSON.parse(raw);
    return (Array.isArray(parsed) ? parsed : []).map((item: Record<string, unknown>) => ({
      domain: String(item.domain || item.Category || item.category || item.metric || page),
      severity: String(item.severity || "info") as Insight["severity"],
      title: String(item.title || item.Insight || item.insight || item.Title || ""),
      body: String(item.body || item.Description || item.description || item.Insight || item.insight || ""),
      comparison: item.comparison ? String(item.comparison) : (item.Change ? String(item.Change) : undefined),
    }));
  } catch (e) {
    console.error("[insights/parseInsightsJson] JSON parse error:", e, "raw:", raw?.slice(0, 200));
    return [];
  }
}

export async function getPageInsights(page: string, periodPreset?: string): Promise<PageInsights> {
  const user = await requireUser();
  const period = periodKeyFromPreset(periodPreset);

  // Try exact period match first — get the most recently created (in case of A/B variants)
  let row = await prisma.aiInsight.findFirst({
    where: { userId: user.id, page, period },
    orderBy: { createdAt: "desc" },
  });

  // Fallback: get latest for this page (backward compat with old rows that have period="")
  if (!row) {
    row = await prisma.aiInsight.findFirst({
      where: { userId: user.id, page },
      orderBy: { date: "desc" },
    });
  }

  if (!row) {
    return { page, period, insightId: null, insights: [], generatedAt: null, model: "none", variant: "default" };
  }

  return {
    page,
    period: row.period || period,
    insightId: row.id,
    insights: parseInsightsJson(row.insightsJson, page),
    generatedAt: row.createdAt?.toISOString() ?? row.date,
    model: row.model,
    variant: row.variant || "default",
  };
}

export async function getAllInsightsSummary(): Promise<PageInsights[]> {
  const user = await requireUser();
  const pages = ["finance", "investments", "gym", "exercises", "my-day", "list"];

  const results = await prisma.aiInsight.findMany({
    where: {
      userId: user.id,
      page: { in: pages },
    },
    orderBy: { date: "desc" },
    distinct: ["page"],
  });

  return pages.map((page) => {
    const row = results.find((r) => r.page === page);
    if (!row) return { page, period: "", insightId: null, insights: [], generatedAt: null, model: "none", variant: "default" };

    return {
      page,
      period: row.period,
      insightId: row.id,
      insights: parseInsightsJson(row.insightsJson, page),
      generatedAt: row.createdAt?.toISOString() ?? row.date,
      model: row.model,
      variant: row.variant || "default",
    };
  });
}

export type InsightRow = {
  page: string;
  period: string;
  variant: string;
  date: string;
  insightsJson: string;
  promptUsed: string | null;
  model: string;
  generatedAt: string | null;
};

export async function getAllInsightsForSettings(): Promise<InsightRow[]> {
  const user = await requireUser();
  const pages = ["finance", "investments", "my-day", "gym", "exercises", "list"];

  const rows = await prisma.aiInsight.findMany({
    where: {
      userId: user.id,
      page: { in: pages },
    },
    orderBy: [{ page: "asc" }, { date: "desc" }],
  });

  return rows.map((row) => ({
    page: row.page,
    period: row.period,
    variant: row.variant || "default",
    date: row.date,
    insightsJson: row.insightsJson,
    promptUsed: row.promptUsed,
    model: row.model,
    generatedAt: row.createdAt?.toISOString() ?? row.date,
  }));
}

export async function getInsightPrompt(page: string): Promise<string> {
  const user = await requireUser();
  const pref = await prisma.userPreference.findFirst({
    where: { userId: user.id, key: `insight_prompt_${page}` },
  });
  return pref?.value ?? "";
}

export async function setInsightPrompt(page: string, prompt: string): Promise<void> {
  const user = await requireUser();
  await prisma.userPreference.upsert({
    where: { userId_key: { userId: user.id, key: `insight_prompt_${page}` } },
    update: { value: prompt },
    create: { userId: user.id, key: `insight_prompt_${page}`, value: prompt },
  });

  // Log the change to audit_log
  await prisma.auditLog.create({
    data: {
      userEmail: user.email,
      action: "prompt_changed",
      details: `${page} | custom prompt saved`,
    },
  });
}

const LANG_NAMES: Record<string, string> = { uk: "Ukrainian", en: "English", es: "Spanish" };

type DateRange = { start: string; end: string };

/**
 * Fetch period-specific context for AI insights.
 * Queries data for BOTH the current and comparison periods separately,
 * so the AI can see actual differences between periods.
 */
async function getInsightContext(
  page: string,
  userId: number,
  dateRanges: { current: DateRange; comparison: DateRange },
): Promise<string> {
  const { current, comparison } = dateRanges;

  if (page === "exercises") {
    const { getExerciseInsightsContext } = await import("@/actions/exercise-insights");
    const ctx = await getExerciseInsightsContext();
    return `${ctx}\n\n--- Period Info ---\nCurrent period: ${current.start} to ${current.end}\nComparison period: ${comparison.start} to ${comparison.end}`;
  }

  const parts: string[] = [];

  if (page === "finance" || page === "dashboard") {
    // Fetch transactions for both periods
    const [currentTx, comparisonTx] = await Promise.all([
      prisma.transaction.findMany({
        where: { userId, date: { gte: toDateOnly(current.start), lte: toDateOnly(current.end) } },
        orderBy: { date: "desc" },
        select: { date: true, type: true, category: true, amountEur: true, description: true },
      }),
      prisma.transaction.findMany({
        where: { userId, date: { gte: toDateOnly(comparison.start), lte: toDateOnly(comparison.end) } },
        orderBy: { date: "desc" },
        select: { date: true, type: true, category: true, amountEur: true, description: true },
      }),
    ]);

    const summarize = (txs: typeof currentTx, label: string) => {
      let income = 0, expenses = 0;
      const byCategory: Record<string, number> = {};
      for (const tx of txs) {
        const amt = tx.amountEur ?? 0;
        if (tx.type === "INCOME") income += amt;
        else if (tx.type === "EXPENSE") {
          expenses += Math.abs(amt);
          if (tx.category) byCategory[tx.category] = (byCategory[tx.category] ?? 0) + Math.abs(amt);
        }
      }
      const topCats = Object.entries(byCategory)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([cat, amt]) => `${cat}: EUR ${amt.toFixed(0)}`)
        .join(", ");
      return `${label} (${txs.length} transactions): income EUR ${income.toFixed(0)}, expenses EUR ${expenses.toFixed(0)}, net EUR ${(income - expenses).toFixed(0)}. Top categories: ${topCats || "none"}`;
    };

    parts.push(summarize(currentTx, `CURRENT PERIOD (${current.start} to ${current.end})`));
    parts.push(summarize(comparisonTx, `COMPARISON PERIOD (${comparison.start} to ${comparison.end})`));
  }

  if (page === "my-day" || page === "dashboard") {
    const [currentLogs, comparisonLogs, currentGarmin, comparisonGarmin] = await Promise.all([
      prisma.dailyLog.findMany({
        where: { userId, date: { gte: toDateOnly(current.start), lte: toDateOnly(current.end) } },
        orderBy: { date: "desc" },
      }),
      prisma.dailyLog.findMany({
        where: { userId, date: { gte: toDateOnly(comparison.start), lte: toDateOnly(comparison.end) } },
        orderBy: { date: "desc" },
      }),
      prisma.garminDaily.findMany({
        where: { userId, date: { gte: toDateOnly(current.start), lte: toDateOnly(current.end) } },
        orderBy: { date: "desc" },
      }),
      prisma.garminDaily.findMany({
        where: { userId, date: { gte: toDateOnly(comparison.start), lte: toDateOnly(comparison.end) } },
        orderBy: { date: "desc" },
      }),
    ]);

    const summarizeLogs = (logs: typeof currentLogs, label: string) => {
      if (logs.length === 0) return `${label}: no data`;
      const avgMood = logs.reduce((s, l) => s + (l.moodDelta ?? 0), 0) / logs.length;
      const avgEnergy = logs.filter(l => l.energyLevel != null).reduce((s, l) => s + (l.energyLevel ?? 0), 0) / (logs.filter(l => l.energyLevel != null).length || 1);
      const avgStress = logs.filter(l => l.stressLevel != null).reduce((s, l) => s + (l.stressLevel ?? 0), 0) / (logs.filter(l => l.stressLevel != null).length || 1);
      return `${label} (${logs.length} days): avg mood_delta=${avgMood.toFixed(1)}, avg energy=${avgEnergy.toFixed(1)}, avg stress=${avgStress.toFixed(1)}`;
    };

    const summarizeGarmin = (data: typeof currentGarmin, label: string) => {
      if (data.length === 0) return `${label}: no data`;
      const avgSteps = data.reduce((s, g) => s + (g.steps ?? 0), 0) / data.length;
      const avgSleep = data.filter(g => g.sleepSeconds != null).reduce((s, g) => s + (g.sleepSeconds ?? 0), 0) / (data.filter(g => g.sleepSeconds != null).length || 1);
      const avgHrv = data.filter(g => g.hrvLastNight != null).reduce((s, g) => s + (g.hrvLastNight ?? 0), 0) / (data.filter(g => g.hrvLastNight != null).length || 1);
      const avgRestHr = data.filter(g => g.restingHr != null).reduce((s, g) => s + (g.restingHr ?? 0), 0) / (data.filter(g => g.restingHr != null).length || 1);
      return `${label} (${data.length} days): avg steps=${Math.round(avgSteps)}, avg sleep=${(avgSleep / 3600).toFixed(1)}h, avg HRV=${avgHrv.toFixed(0)}ms, avg resting HR=${avgRestHr.toFixed(0)}`;
    };

    parts.push(summarizeLogs(currentLogs, `CURRENT PERIOD Daily Log (${current.start} to ${current.end})`));
    parts.push(summarizeLogs(comparisonLogs, `COMPARISON PERIOD Daily Log (${comparison.start} to ${comparison.end})`));
    parts.push(summarizeGarmin(currentGarmin, `CURRENT PERIOD Garmin (${current.start} to ${current.end})`));
    parts.push(summarizeGarmin(comparisonGarmin, `COMPARISON PERIOD Garmin (${comparison.start} to ${comparison.end})`));
  }

  if (page === "gym" || page === "dashboard") {
    const [currentWorkouts, comparisonWorkouts] = await Promise.all([
      prisma.gymWorkout.findMany({
        where: { userId, date: { gte: toDateOnly(current.start), lte: toDateOnly(current.end) } },
        include: { exercises: { include: { sets: { select: { weightKg: true, reps: true } } } } },
      }),
      prisma.gymWorkout.findMany({
        where: { userId, date: { gte: toDateOnly(comparison.start), lte: toDateOnly(comparison.end) } },
        include: { exercises: { include: { sets: { select: { weightKg: true, reps: true } } } } },
      }),
    ]);

    const summarizeWorkouts = (workouts: typeof currentWorkouts, label: string) => {
      if (workouts.length === 0) return `${label}: no workouts`;
      let totalVolume = 0;
      for (const w of workouts) {
        for (const ex of w.exercises) {
          for (const s of ex.sets) totalVolume += (s.weightKg ?? 0) * (s.reps ?? 0);
        }
      }
      const avgDuration = workouts.reduce((s, w) => s + (w.durationMinutes ?? 0), 0) / workouts.length;
      return `${label} (${workouts.length} workouts): total volume=${Math.round(totalVolume)}kg, avg duration=${Math.round(avgDuration)}min`;
    };

    parts.push(summarizeWorkouts(currentWorkouts, `CURRENT PERIOD Gym (${current.start} to ${current.end})`));
    parts.push(summarizeWorkouts(comparisonWorkouts, `COMPARISON PERIOD Gym (${comparison.start} to ${comparison.end})`));
  }

  if (page === "investments") {
    // Investments don't have per-day data typically, use the general context
    const { getPageContext } = await import("@/actions/chat");
    const ctx = await getPageContext(page);
    parts.push(ctx);
    parts.push(`\nCurrent period: ${current.start} to ${current.end}\nComparison period: ${comparison.start} to ${comparison.end}`);
  }

  if (page === "list") {
    const [currentFood, comparisonFood] = await Promise.all([
      prisma.foodLog.findMany({
        where: { userId, date: { gte: toDateOnly(current.start), lte: toDateOnly(current.end) } },
        select: { date: true, calories: true, proteinG: true, description: true },
      }),
      prisma.foodLog.findMany({
        where: { userId, date: { gte: toDateOnly(comparison.start), lte: toDateOnly(comparison.end) } },
        select: { date: true, calories: true, proteinG: true, description: true },
      }),
    ]);

    const summarizeFood = (logs: typeof currentFood, label: string) => {
      if (logs.length === 0) return `${label}: no data`;
      const totalCal = logs.reduce((s, l) => s + (l.calories ?? 0), 0);
      const totalProtein = logs.reduce((s, l) => s + (l.proteinG ?? 0), 0);
      const days = new Set(logs.map(l => dateToString(l.date))).size;
      return `${label} (${logs.length} entries, ${days} days): total ${totalCal.toFixed(0)} kcal, ${totalProtein.toFixed(0)}g protein, avg ${days > 0 ? (totalCal / days).toFixed(0) : 0} kcal/day`;
    };

    parts.push(summarizeFood(currentFood, `CURRENT PERIOD Food (${current.start} to ${current.end})`));
    parts.push(summarizeFood(comparisonFood, `COMPARISON PERIOD Food (${comparison.start} to ${comparison.end})`));
  }

  if (parts.length === 0) {
    // Fallback to general context
    const { getPageContext } = await import("@/actions/chat");
    return getPageContext(page);
  }

  return parts.join("\n\n");
}

/**
 * Generate a single insight variant with a given prompt.
 * Returns the raw text, model used, and generation time.
 */
async function generateSingleVariant(
  promptText: string,
  page: string,
  period: string,
  language: string,
  context: string,
  userId: number,
): Promise<{ raw: string; modelUsed: string; generationMs: number }> {
  const systemContent = `You are an AI analyst for a personal dashboard. ${promptText}
Period: ${period}
Write a single concise paragraph (3-4 sentences) with specific numbers comparing current vs previous period.
Return as a JSON array with exactly ONE object: [{"domain": "${page}", "severity": "info", "title": "", "body": "your paragraph here", "comparison": ""}]
IMPORTANT: Write the paragraph in ${language}. Do NOT use English if the language is ${language}.
Return ONLY the JSON array, no other text.`;

  const userContent = `ВАЖЛИВО: Відповідай ТІЛЬКИ ${language} мовою. НЕ використовуй англійську.\nPeriod: ${period}\nAnalyze this data:\n${context}`;

  const [geminiKey, groqKey] = await Promise.all([
    getSecretValue(userId, "gemini_api_key"),
    getSecretValue(userId, "groq_api_key"),
  ]);

  const startTime = Date.now();
  let raw = "";
  let modelUsed = "none";

  // 1. Try Gemini
  if (geminiKey) {
    try {
      const googleAI = createGoogleGenerativeAI({ apiKey: geminiKey });
      const result = await generateText({
        model: googleAI("gemini-2.5-flash"),
        system: systemContent,
        messages: [{ role: "user", content: userContent }],
        abortSignal: AbortSignal.timeout(60000),
      });
      raw = result.text;
      modelUsed = "gemini-2.5-flash";
    } catch (e) {
      console.error("[Insights] Gemini failed, trying Groq:", e instanceof Error ? e.message : e);
    }
  }

  // 2. Try Groq
  if (!raw && groqKey) {
    try {
      const groq = createGroq({ apiKey: groqKey });
      const result = await generateText({
        model: groq("llama-3.3-70b-versatile"),
        system: systemContent,
        messages: [{ role: "user", content: userContent }],
        abortSignal: AbortSignal.timeout(60000),
      });
      raw = result.text;
      modelUsed = "groq-llama-3.3-70b";
    } catch (e) {
      console.error("[Insights] Groq failed, falling back to Ollama:", e instanceof Error ? e.message : e);
    }
  }

  // 3. Fall back to Ollama qwen2.5:14b
  if (!raw) {
    try {
      const baseURL = process.env.OLLAMA_BASE_URL || "http://ollama:11434/v1";
      const ollamaHost = baseURL.replace(/\/v1$/, "");

      const res = await fetch(`${ollamaHost}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "qwen2.5:14b-instruct-q4_K_M",
          stream: false,
          messages: [
            { role: "system", content: systemContent },
            { role: "user", content: userContent },
          ],
        }),
        signal: AbortSignal.timeout(120000),
      });

      if (res.ok) {
        const data = await res.json();
        raw = data.message?.content || "[]";
        modelUsed = "qwen2.5-14b";
      }
    } catch (e) {
      console.error("[Insights] Ollama failed:", e instanceof Error ? e.message : e);
    }
  }

  return { raw, modelUsed, generationMs: Date.now() - startTime };
}

/**
 * Save an insight variant to the database.
 */
async function saveInsightVariant(
  userId: number,
  page: string,
  period: string,
  variant: string,
  insights: Insight[],
  promptUsed: string,
  modelUsed: string,
  generationMs: number,
): Promise<number> {
  const today = new Date().toISOString().slice(0, 10);
  const saved = await prisma.aiInsight.upsert({
    where: { userId_page_period_variant: { userId, page, period, variant } },
    update: {
      insightsJson: JSON.stringify(insights),
      promptUsed,
      model: modelUsed,
      generationMs,
      date: today,
    },
    create: {
      userId,
      page,
      period,
      variant,
      date: today,
      insightsJson: JSON.stringify(insights),
      promptUsed,
      model: modelUsed,
      generationMs,
    },
  });
  return saved.id;
}

/**
 * Shared core logic for generating AI insights.
 * Used by both the server action and the API route.
 *
 * A/B testing: when a custom prompt exists, generates BOTH default and custom
 * variants, saves both to DB, and randomly picks one (50/50) to return.
 */
export async function generateInsightsCore(
  page: string,
  periodPreset: string | undefined,
  language: string,
  userId: number,
): Promise<{ insights: Insight[]; raw: string; period: string; promptUsed: string; model: string; insightId: number | null; variant: string }> {
  const period = periodKeyFromPreset(periodPreset);
  const periodLabel = periodLabelForPreset(periodPreset);
  const comparisonPeriod = comparisonPeriodForPreset(periodPreset);

  // Check if user has a custom prompt for this page
  const customPromptPref = await prisma.userPreference.findFirst({
    where: { userId, key: `insight_prompt_${page}` },
  });

  const defaultTemplate = DEFAULT_PROMPTS[page] || DEFAULT_PROMPTS.finance;
  const defaultPromptText = resolvePrompt(defaultTemplate, periodLabel, comparisonPeriod, language);

  // Compute date ranges for period-aware context
  const dateRanges = getDateRangesForPreset(periodPreset);
  const context = await getInsightContext(page, userId, dateRanges);

  const hasCustomPrompt = !!customPromptPref?.value && customPromptPref.value.trim() !== defaultTemplate.trim();

  if (hasCustomPrompt) {
    // A/B test: generate both variants in parallel
    const customPromptText = resolvePrompt(customPromptPref!.value!, periodLabel, comparisonPeriod, language);

    const [defaultResult, customResult] = await Promise.all([
      generateSingleVariant(defaultPromptText, page, period, language, context, userId),
      generateSingleVariant(customPromptText, page, period, language, context, userId),
    ]);

    // Parse both results
    const defaultJsonMatch = defaultResult.raw.match(/\[[\s\S]*\]/);
    const defaultInsights: Insight[] = defaultJsonMatch ? parseInsightsJson(defaultJsonMatch[0], page) : [];

    const customJsonMatch = customResult.raw.match(/\[[\s\S]*\]/);
    const customInsights: Insight[] = customJsonMatch ? parseInsightsJson(customJsonMatch[0], page) : [];

    // Save both variants to DB
    const [defaultId, customId] = await Promise.all([
      saveInsightVariant(userId, page, period, "default", defaultInsights, defaultPromptText, defaultResult.modelUsed, defaultResult.generationMs),
      saveInsightVariant(userId, page, period, "custom", customInsights, customPromptText, customResult.modelUsed, customResult.generationMs),
    ]);

    // Randomly pick one to show (50/50)
    const showCustom = Math.random() < 0.5;
    const chosen = showCustom
      ? { insights: customInsights, raw: customResult.raw, promptUsed: customPromptText, model: customResult.modelUsed, insightId: customId, variant: "custom" as const }
      : { insights: defaultInsights, raw: defaultResult.raw, promptUsed: defaultPromptText, model: defaultResult.modelUsed, insightId: defaultId, variant: "default" as const };

    console.log(`[Insights A/B] page=${page} period=${period} chosen=${chosen.variant} (default: ${defaultInsights.length} insights, custom: ${customInsights.length} insights)`);

    return { ...chosen, period };
  }

  // No custom prompt — generate with default only (no A/B test)
  const result = await generateSingleVariant(defaultPromptText, page, period, language, context, userId);

  if (!result.raw) {
    return { insights: [], raw: "", period, promptUsed: defaultPromptText, model: "none", insightId: null, variant: "default" };
  }

  const jsonMatch = result.raw.match(/\[[\s\S]*\]/);
  const insights: Insight[] = jsonMatch ? parseInsightsJson(jsonMatch[0], page) : [];

  const insightId = await saveInsightVariant(userId, page, period, "default", insights, defaultPromptText, result.modelUsed, result.generationMs);

  return { insights, raw: result.raw, period, promptUsed: defaultPromptText, model: result.modelUsed, insightId, variant: "default" };
}

/**
 * Generate insights via server action (won't cancel on navigation).
 * Thin wrapper around generateInsightsCore().
 */
export async function generatePageInsightsAction(
  page: string,
  locale: string = "uk",
  periodPreset?: string,
): Promise<PageInsights> {
  const user = await requireUser();
  const language = LANG_NAMES[locale] || "Ukrainian";

  const result = await generateInsightsCore(page, periodPreset, language, user.id);

  return {
    page,
    period: result.period,
    insightId: result.insightId ?? null,
    insights: result.insights,
    generatedAt: new Date().toISOString(),
    model: result.insights.length > 0 ? result.model : "error",
    variant: result.variant,
  };
}

// ── Insight Feedback ──

export async function submitInsightFeedback(
  insightId: number,
  page: string,
  period: string,
  reaction: "like" | "dislike",
  comment?: string,
  variant?: string,
): Promise<{ success: boolean }> {
  const user = await requireUser();

  // Resolve variant from the insight if not provided
  let resolvedVariant = variant || "default";
  if (!variant) {
    const insight = await prisma.aiInsight.findUnique({ where: { id: insightId }, select: { variant: true } });
    if (insight) resolvedVariant = insight.variant || "default";
  }

  // One feedback per user per insight — replace previous
  await prisma.insightFeedback.deleteMany({
    where: { userId: user.id, insightId },
  });

  await prisma.insightFeedback.create({
    data: {
      insightId,
      userId: user.id,
      page,
      period,
      variant: resolvedVariant,
      reaction,
      comment: reaction === "dislike" ? (comment || null) : null,
      processed: false,
    },
  });

  return { success: true };
}

export async function getInsightFeedback(
  insightId: number,
): Promise<{ reaction: string | null }> {
  const user = await requireUser();
  const fb = await prisma.insightFeedback.findFirst({
    where: { userId: user.id, insightId },
    orderBy: { createdAt: "desc" },
  });
  return { reaction: fb?.reaction ?? null };
}

// ── Feedback Stats Dashboard ──

export type FeedbackPageStats = {
  page: string;
  likes: number;
  dislikes: number;
  lastFeedback: string | null;
};

export type PromptChange = {
  page: string;
  changedAt: string;
  details: string;
};

export async function getInsightFeedbackStats(): Promise<{
  pageStats: FeedbackPageStats[];
  promptChanges: PromptChange[];
}> {
  const user = await requireUser();

  // Feedback stats grouped by page
  const feedbacks = await prisma.insightFeedback.findMany({
    where: { userId: user.id },
    select: { page: true, reaction: true, createdAt: true },
    orderBy: { createdAt: "desc" },
  });

  const statsMap: Record<string, { likes: number; dislikes: number; lastFeedback: Date | null }> = {};
  for (const fb of feedbacks) {
    if (!statsMap[fb.page]) {
      statsMap[fb.page] = { likes: 0, dislikes: 0, lastFeedback: null };
    }
    const s = statsMap[fb.page];
    if (fb.reaction === "like") s.likes++;
    else if (fb.reaction === "dislike") s.dislikes++;
    if (!s.lastFeedback || fb.createdAt > s.lastFeedback) {
      s.lastFeedback = fb.createdAt;
    }
  }

  const pages = ["finance", "investments", "my-day", "gym", "exercises", "list"];
  const pageStats: FeedbackPageStats[] = pages.map((page) => ({
    page,
    likes: statsMap[page]?.likes ?? 0,
    dislikes: statsMap[page]?.dislikes ?? 0,
    lastFeedback: statsMap[page]?.lastFeedback?.toISOString() ?? null,
  }));

  // Prompt change history from audit_log
  const auditRows = await prisma.auditLog.findMany({
    where: {
      userEmail: user.email,
      action: "prompt_changed",
    },
    orderBy: { createdAt: "desc" },
    take: 20,
  });

  const promptChanges: PromptChange[] = auditRows.map((row) => ({
    page: row.details?.split("|")[0]?.trim() ?? "unknown",
    changedAt: row.createdAt?.toISOString() ?? "",
    details: row.details ?? "",
  }));

  return { pageStats, promptChanges };
}

// ── A/B Test Stats ──

export type ABTestPageStats = {
  page: string;
  defaultLikes: number;
  defaultDislikes: number;
  defaultTotal: number;
  defaultWinRate: number;
  customLikes: number;
  customDislikes: number;
  customTotal: number;
  customWinRate: number;
  hasCustomPrompt: boolean;
};

export async function getABTestStats(): Promise<ABTestPageStats[]> {
  const user = await requireUser();
  const pages = ["finance", "investments", "my-day", "gym", "exercises", "list"];

  const feedbacks = await prisma.insightFeedback.findMany({
    where: { userId: user.id },
    select: { page: true, variant: true, reaction: true },
  });

  // Check which pages have custom prompts
  const customPromptKeys = pages.map((p) => `insight_prompt_${p}`);
  const customPrefs = await prisma.userPreference.findMany({
    where: { userId: user.id, key: { in: customPromptKeys } },
    select: { key: true, value: true },
  });
  const customPromptPages = new Set(
    customPrefs.filter((p) => p.value && p.value.trim().length > 0).map((p) => p.key.replace("insight_prompt_", ""))
  );

  const statsMap: Record<string, { dL: number; dD: number; cL: number; cD: number }> = {};
  for (const fb of feedbacks) {
    if (!statsMap[fb.page]) statsMap[fb.page] = { dL: 0, dD: 0, cL: 0, cD: 0 };
    const s = statsMap[fb.page];
    const isCustom = fb.variant === "custom";
    if (fb.reaction === "like") {
      if (isCustom) s.cL++; else s.dL++;
    } else if (fb.reaction === "dislike") {
      if (isCustom) s.cD++; else s.dD++;
    }
  }

  return pages.map((page) => {
    const s = statsMap[page] || { dL: 0, dD: 0, cL: 0, cD: 0 };
    const defaultTotal = s.dL + s.dD;
    const customTotal = s.cL + s.cD;
    return {
      page,
      defaultLikes: s.dL,
      defaultDislikes: s.dD,
      defaultTotal,
      defaultWinRate: defaultTotal > 0 ? Math.round((s.dL / defaultTotal) * 100) : 0,
      customLikes: s.cL,
      customDislikes: s.cD,
      customTotal,
      customWinRate: customTotal > 0 ? Math.round((s.cL / customTotal) * 100) : 0,
      hasCustomPrompt: customPromptPages.has(page),
    };
  });
}

export async function resetInsightPrompt(page: string): Promise<void> {
  const user = await requireUser();
  // Delete custom prompt — system will fall back to DEFAULT_PROMPTS
  await prisma.userPreference.deleteMany({
    where: { userId: user.id, key: `insight_prompt_${page}` },
  });

  // Log the reset to audit_log
  await prisma.auditLog.create({
    data: {
      userEmail: user.email,
      action: "prompt_changed",
      details: `${page} | reset to default`,
    },
  });
}
