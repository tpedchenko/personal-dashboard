/**
 * Default AI insight prompts per page.
 * Placeholders: {period}, {comparison_period}, {language}
 */
export const DEFAULT_PROMPTS: Record<string, string> = {
  finance:
    "Проаналізуй мої фінанси за {period}. Порівняй дохід і витрати з {comparison_period} (використовуй дати з Period Info). Виділи топ зміни в категоріях і дай рекомендацію. Напиши одним абзацом 3-4 речення.",
  investments:
    "Проаналізуй мій інвестиційний портфель за {period}. Порівняй NAV і P&L з {comparison_period} (використовуй дати з Period Info). Які позиції змінились найбільше? Одним абзацом 3-4 речення.",
  "my-day":
    "Проаналізуй моє здоров'я та самопочуття за {period}. Порівняй настрій, сон, стрес з {comparison_period} (використовуй дати з Period Info). Які кореляції помітні? Одним абзацом 3-4 речення.",
  gym:
    "Проаналізуй мої тренування за {period}. Порівняй об'єм, частоту з {comparison_period} (використовуй дати з Period Info). Чи є прогрес? Одним абзацом 3-4 речення.",
  exercises:
    "Проаналізуй вправи за {period}: порівняй 1RM, volume, частоту з {comparison_period} (використовуй дати з Period Info). Де прогрес, де регрес? Одним абзацом 3-4 речення.",
  list:
    "Проаналізуй мій список покупок за {period}. Порівняй з {comparison_period} (використовуй дати з Period Info). Які категорії найчастіше? Одним абзацом 3-4 речення.",
  dashboard:
    "Проаналізуй ВСІ мої дані (фінанси, здоров'я, фітнес, харчування) за {period}. Порівняй з {comparison_period} (використовуй дати з Period Info). Одним абзацом 3-5 речень.",
};

/**
 * Compute date ranges for a period preset.
 * For week/month/year, the comparison period covers the same number of elapsed days.
 * E.g., if today is March 15, "this_month" = Mar 1-15, comparison = Feb 1-15.
 */
export function getDateRangesForPreset(preset?: string): {
  current: { start: string; end: string };
  comparison: { start: string; end: string };
} {
  const now = new Date();
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  const y = now.getFullYear();
  const m = now.getMonth();
  const d = now.getDate();
  const dow = now.getDay(); // 0=Sun

  switch (preset) {
    case "this_week": {
      // Week starts Monday
      const mondayOffset = dow === 0 ? 6 : dow - 1;
      const weekStart = new Date(y, m, d - mondayOffset);
      const prevWeekStart = new Date(weekStart);
      prevWeekStart.setDate(prevWeekStart.getDate() - 7);
      const prevWeekEnd = new Date(prevWeekStart);
      prevWeekEnd.setDate(prevWeekEnd.getDate() + mondayOffset); // same day of week
      return {
        current: { start: fmt(weekStart), end: fmt(now) },
        comparison: { start: fmt(prevWeekStart), end: fmt(prevWeekEnd) },
      };
    }
    case "this_month": {
      const monthStart = new Date(y, m, 1);
      const prevMonthStart = new Date(y, m - 1, 1);
      const prevMonthSameDay = new Date(y, m - 1, Math.min(d, new Date(y, m, 0).getDate()));
      return {
        current: { start: fmt(monthStart), end: fmt(now) },
        comparison: { start: fmt(prevMonthStart), end: fmt(prevMonthSameDay) },
      };
    }
    case "this_year": {
      const yearStart = new Date(y, 0, 1);
      const prevYearStart = new Date(y - 1, 0, 1);
      const prevYearSameDay = new Date(y - 1, m, d);
      return {
        current: { start: fmt(yearStart), end: fmt(now) },
        comparison: { start: fmt(prevYearStart), end: fmt(prevYearSameDay) },
      };
    }
    default: {
      // Fallback: last 30 days vs 30 days before that
      const end = new Date(now);
      const start = new Date(now);
      start.setDate(start.getDate() - 30);
      const compEnd = new Date(start);
      compEnd.setDate(compEnd.getDate() - 1);
      const compStart = new Date(compEnd);
      compStart.setDate(compStart.getDate() - 30);
      return {
        current: { start: fmt(start), end: fmt(end) },
        comparison: { start: fmt(compStart), end: fmt(compEnd) },
      };
    }
  }
}

/** Compute a period key from a PeriodPreset name. */
export function periodKeyFromPreset(preset?: string): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  const d = now.getDate();
  switch (preset) {
    case "today":
      return `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    case "this_week": {
      const jan1 = new Date(y, 0, 1);
      const dayOfYear = Math.ceil((now.getTime() - jan1.getTime()) / 86400000) + 1;
      const weekNum = Math.ceil((dayOfYear + jan1.getDay()) / 7);
      return `${y}-W${String(weekNum).padStart(2, "0")}`;
    }
    case "prev_week": {
      const prev = new Date(now);
      prev.setDate(prev.getDate() - 7);
      const pY = prev.getFullYear();
      const jan1p = new Date(pY, 0, 1);
      const dayOfYearP = Math.ceil((prev.getTime() - jan1p.getTime()) / 86400000) + 1;
      const weekNumP = Math.ceil((dayOfYearP + jan1p.getDay()) / 7);
      return `${pY}-W${String(weekNumP).padStart(2, "0")}`;
    }
    case "this_month":
      return `${y}-${String(m + 1).padStart(2, "0")}`;
    case "prev_month": {
      const pm = m === 0 ? 12 : m;
      const py = m === 0 ? y - 1 : y;
      return `${py}-${String(pm).padStart(2, "0")}`;
    }
    case "this_year":
      return `${y}`;
    case "prev_year":
      return `${y - 1}`;
    default:
      return `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  }
}

/**
 * Resolve placeholders in a prompt template.
 */
export function resolvePrompt(
  template: string,
  period: string,
  comparisonPeriod: string,
  language: string = "українською",
): string {
  return template
    .replace(/\{period\}/g, period)
    .replace(/\{comparison_period\}/g, comparisonPeriod)
    .replace(/\{language\}/g, language);
}
