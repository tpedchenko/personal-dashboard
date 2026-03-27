"use server";

import { getFinanceInsightContext, getListInsightContext } from "./finance";
import { getHealthInsightContext, getGymInsightContext } from "./health";

type DateRange = { start: string; end: string };

/**
 * Fetch period-specific context for AI insights.
 * Queries data for BOTH the current and comparison periods separately,
 * so the AI can see actual differences between periods.
 */
export async function getInsightContext(
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
    const financeParts = await getFinanceInsightContext(userId, current, comparison);
    parts.push(...financeParts);
  }

  if (page === "my-day" || page === "dashboard") {
    const healthParts = await getHealthInsightContext(userId, current, comparison);
    parts.push(...healthParts);
  }

  if (page === "gym" || page === "dashboard") {
    const gymParts = await getGymInsightContext(userId, current, comparison);
    parts.push(...gymParts);
  }

  if (page === "investments") {
    // Investments don't have per-day data typically, use the general context
    const { getPageContext } = await import("@/actions/chat-context/index");
    const ctx = await getPageContext(page);
    parts.push(ctx);
    parts.push(`\nCurrent period: ${current.start} to ${current.end}\nComparison period: ${comparison.start} to ${comparison.end}`);
  }

  if (page === "list") {
    const listParts = await getListInsightContext(userId, current, comparison);
    parts.push(...listParts);
  }

  if (parts.length === 0) {
    // Fallback to general context
    const { getPageContext } = await import("@/actions/chat-context/index");
    return getPageContext(page);
  }

  return parts.join("\n\n");
}
