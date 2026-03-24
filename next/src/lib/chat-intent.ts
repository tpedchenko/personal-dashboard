/**
 * Lightweight keyword-based intent parser for RAG context selection.
 * Determines which data domains and time ranges are relevant to a user's question.
 */

export type DataDomain =
  | "finance"
  | "health"
  | "sleep"
  | "gym"
  | "mood"
  | "investments"
  | "food"
  | "trading"
  | "weight"
  | "tax";

export type QuestionType = "summary" | "comparison" | "trend" | "specific" | "recommendation" | "general" | "correlation";

export type ChatIntent = {
  domains: DataDomain[];
  timeRange: { start: string; end: string } | null;
  questionType: QuestionType;
};

const DOMAIN_KEYWORDS: Record<DataDomain, string[]> = {
  finance: ["витрат", "гроші", "бюджет", "транзакц", "фінанс", "дохід", "зарплат", "рахунок", "баланс", "категорі", "expense", "income", "spending", "money", "EUR"],
  health: ["крок", "пульс", "HRV", "hrv", "garmin", "здоров", "body battery", "батарея", "калорі", "стрес", "health", "steps", "heart"],
  sleep: ["сон", "спав", "sleep", "deep sleep", "глибокий сон", "rem", "нічн", "прокид", "безсонн"],
  gym: ["тренуван", "зал", "gym", "вправ", "exercise", "підход", "м'яз", "ваг", "жим", "присід", "workout", "volume"],
  mood: ["настрій", "mood", "енергі", "energy", "фокус", "focus", "самопочутт", "daily log"],
  investments: ["інвестиц", "портфель", "акці", "позиці", "NAV", "nav", "PnL", "pnl", "брокер", "IBKR", "Trading 212", "eToro", "invest", "stock", "portfolio"],
  food: ["їж", "харч", "протеїн", "protein", "калорі", "calorie", "food", "kcal", "їв", "обід", "вечер", "снідан"],
  trading: ["трейдинг", "trading", "freqtrade", "крипто", "crypto", "BTC", "ETH", "trade", "бот"],
  weight: ["вага", "weight", "жир", "fat", "BMI", "bmi", "м'язова маса", "muscle", "тіло", "body composition"],
  tax: ["податк", "tax", "декларац", "ФОП", "IRPF", "modelo", "ДПС"],
};

const TIME_PATTERNS: { pattern: RegExp; resolve: (match: RegExpMatchArray) => { start: string; end: string } }[] = [
  {
    pattern: /сьогодні|today/i,
    resolve: (_match) => {
      const d = new Date().toISOString().slice(0, 10);
      return { start: d, end: d };
    },
  },
  {
    pattern: /вчора|yesterday/i,
    resolve: (_match) => {
      const d = new Date();
      d.setDate(d.getDate() - 1);
      const s = d.toISOString().slice(0, 10);
      return { start: s, end: s };
    },
  },
  {
    pattern: /ц(ей|ього) тижн|this week/i,
    resolve: (_match) => {
      const now = new Date();
      const day = now.getDay();
      const diff = day === 0 ? 6 : day - 1;
      const monday = new Date(now);
      monday.setDate(now.getDate() - diff);
      return { start: monday.toISOString().slice(0, 10), end: now.toISOString().slice(0, 10) };
    },
  },
  {
    pattern: /минул(ий|ого) тижн|last week/i,
    resolve: (_match) => {
      const now = new Date();
      const day = now.getDay();
      const diff = day === 0 ? 6 : day - 1;
      const thisMonday = new Date(now);
      thisMonday.setDate(now.getDate() - diff);
      const lastMonday = new Date(thisMonday);
      lastMonday.setDate(thisMonday.getDate() - 7);
      const lastSunday = new Date(thisMonday);
      lastSunday.setDate(thisMonday.getDate() - 1);
      return { start: lastMonday.toISOString().slice(0, 10), end: lastSunday.toISOString().slice(0, 10) };
    },
  },
  {
    pattern: /ц(ей|ього) місяц|this month/i,
    resolve: (_match) => {
      const now = new Date();
      const start = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
      return { start, end: now.toISOString().slice(0, 10) };
    },
  },
  {
    pattern: /минул(ий|ого) місяц|last month/i,
    resolve: (_match) => {
      const now = new Date();
      const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const end = new Date(now.getFullYear(), now.getMonth(), 0);
      return { start: prev.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) };
    },
  },
  {
    pattern: /останні?\s*(\d+)\s*(дн|день|day)/i,
    resolve: (match) => {
      const now = new Date();
      const days = parseInt(match[1]);
      const start = new Date(now);
      start.setDate(now.getDate() - days);
      return { start: start.toISOString().slice(0, 10), end: now.toISOString().slice(0, 10) };
    },
  },
  {
    pattern: /останні?\s*3\s*місяц|last 3 months/i,
    resolve: (_match) => {
      const now = new Date();
      const start = new Date(now.getFullYear(), now.getMonth() - 3, 1);
      return { start: start.toISOString().slice(0, 10), end: now.toISOString().slice(0, 10) };
    },
  },
  {
    // Match specific month: "за березень", "у лютому", "in March"
    pattern: /(?:за|у|в|у)\s+(січен\w*|лют\w*|берез\w*|квітен\w*|травен\w*|червен\w*|липен\w*|серпен\w*|вересен\w*|жовтен\w*|листопад\w*|груден\w*|january|february|march|april|may|june|july|august|september|october|november|december)/i,
    resolve: (match) => {
      const monthStr = match[1].toLowerCase();
      const MONTH_MAP: Record<string, number> = {
        січ: 0, лют: 1, берез: 2, квітен: 3, травен: 4, червен: 5,
        липен: 6, серпен: 7, вересен: 8, жовтен: 9, листопад: 10, груден: 11,
        january: 0, february: 1, march: 2, april: 3, may: 4, june: 5,
        july: 6, august: 7, september: 8, october: 9, november: 10, december: 11,
      };
      let monthIndex = -1;
      for (const [prefix, idx] of Object.entries(MONTH_MAP)) {
        if (monthStr.startsWith(prefix)) {
          monthIndex = idx;
          break;
        }
      }
      if (monthIndex === -1) {
        // Fallback: last 30 days
        const now = new Date();
        const start = new Date(now);
        start.setDate(now.getDate() - 30);
        return { start: start.toISOString().slice(0, 10), end: now.toISOString().slice(0, 10) };
      }
      const now = new Date();
      // If the month hasn't happened yet this year, use last year
      const year = monthIndex > now.getMonth() ? now.getFullYear() - 1 : now.getFullYear();
      const start = new Date(year, monthIndex, 1);
      const end = new Date(year, monthIndex + 1, 0); // last day of month
      return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) };
    },
  },
];

const CORRELATION_KEYWORDS = ["чому", "why", "причина", "зв'язок", "correlation", "впливає", "affect", "через що", "від чого", "пов'язан", "залежить", "зумовлен", "причин"];
const CORRELATION_DOMAINS: DataDomain[] = ["health", "mood", "sleep", "gym", "finance"];

const COMPARISON_KEYWORDS = ["порівняй", "порівняння", "compare", "vs", "проти", "різниця", "difference"];
const TREND_KEYWORDS = ["тренд", "trend", "динамік", "зміни", "змінив", "зростає", "падає", "прогрес", "progress"];
const RECOMMENDATION_KEYWORDS = ["порадь", "рекомендац", "покращ", "як покращити", "що робити", "recommend", "improve", "advice", "порада"];

/**
 * Parse a user message into a ChatIntent for RAG context selection.
 */
export function parseIntent(message: string): ChatIntent {
  const lower = message.toLowerCase();

  // Detect domains
  const domains: DataDomain[] = [];
  for (const [domain, keywords] of Object.entries(DOMAIN_KEYWORDS)) {
    if (keywords.some((kw) => lower.includes(kw.toLowerCase()))) {
      domains.push(domain as DataDomain);
    }
  }

  // If no specific domain detected, include most common ones
  if (domains.length === 0) {
    domains.push("finance", "health", "mood");
  }

  // Auto-add related domains
  if (domains.includes("gym") && !domains.includes("weight")) domains.push("weight");
  if (domains.includes("sleep") && !domains.includes("health")) domains.push("health");
  if (domains.includes("mood") && !domains.includes("health")) domains.push("health");

  // Detect time range
  let timeRange: ChatIntent["timeRange"] = null;
  for (const tp of TIME_PATTERNS) {
    const match = message.match(tp.pattern);
    if (match) {
      timeRange = tp.resolve(match);
      break;
    }
  }

  // Detect question type
  let questionType: QuestionType = "summary";
  if (CORRELATION_KEYWORDS.some((kw) => lower.includes(kw))) {
    questionType = "correlation";
    // Expand domains to include all correlation-relevant domains
    for (const d of CORRELATION_DOMAINS) {
      if (!domains.includes(d)) domains.push(d);
    }
  } else if (COMPARISON_KEYWORDS.some((kw) => lower.includes(kw))) {
    questionType = "comparison";
  } else if (TREND_KEYWORDS.some((kw) => lower.includes(kw))) {
    questionType = "trend";
  } else if (RECOMMENDATION_KEYWORDS.some((kw) => lower.includes(kw))) {
    questionType = "recommendation";
  }

  return { domains, timeRange, questionType };
}
