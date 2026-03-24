"use server";

import { prisma } from "@/lib/db";
import { updateTag } from "next/cache";
import { CACHE_TAGS } from "@/lib/cache-tags";
import { requireUser } from "@/lib/current-user";
import {
  parseImportBuffer,
  detectFormat,
  type ParsedTransaction,
  type ImportFormat,
} from "@/lib/import-parsers";
import { z, ZodError } from "zod";
import { importTransactionItemSchema } from "@/lib/validations";
import { toDateOnly, dateToString } from "@/lib/date-utils";

// ---------- Parse uploaded file ----------

export async function parseImportFile(formData: FormData): Promise<{
  transactions: ParsedTransaction[];
  format: ImportFormat;
  error?: string;
}> {
  const file = formData.get("file") as File | null;
  if (!file) {
    return { transactions: [], format: "csv", error: "No file provided" };
  }

  const ext = (file.name.split(".").pop() ?? "").toLowerCase();

  if (!["csv"].includes(ext)) {
    return {
      transactions: [],
      format: "csv",
      error: `Unsupported format: .${ext}. Currently only CSV is supported.`,
    };
  }

  try {
    const buffer = await file.arrayBuffer();
    const format = detectFormat(buffer);
    const transactions = parseImportBuffer(buffer, format);

    if (transactions.length === 0) {
      return {
        transactions: [],
        format,
        error: "No valid transactions found in the file. Check the file format and column headers.",
      };
    }

    return { transactions, format };
  } catch (err) {
    return {
      transactions: [],
      format: "csv",
      error: `Parse error: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

// ---------- Bulk import ----------

export async function importTransactions(
  transactions: ParsedTransaction[],
  defaultAccount?: string,
): Promise<{ imported: number; errors: number; errorMessages: string[] }> {
  try {
    z.array(importTransactionItemSchema).min(1).max(10000).parse(transactions);
    if (defaultAccount !== undefined) z.string().parse(defaultAccount);
  } catch (e) {
    if (e instanceof ZodError) return { imported: 0, errors: 0, errorMessages: ["Invalid input"] };
    throw e;
  }
  const user = await requireUser();
  let imported = 0;
  let errors = 0;
  const errorMessages: string[] = [];
  const account = defaultAccount || "";

  // Map currency codes to symbols used in DB (currencyOriginal field)
  const currencyMap: Record<string, string> = {
    EUR: "EUR",
    UAH: "UAH",
    USD: "USD",
    PLN: "PLN",
    GBP: "GBP",
    CZK: "CZK",
  };

  // Pre-fetch NBU EUR + USD rates for all unique dates in a single query
  const uniqueDates = [...new Set(transactions.map((tx) => tx.date))];
  const allRates = await prisma.nbuRate.findMany({
    where: { currencyCode: { in: ["EUR", "USD"] }, date: { lte: toDateOnly(uniqueDates.reduce((a, b) => (a > b ? a : b), uniqueDates[0] ?? "1970-01-01")) } },
    orderBy: { date: "desc" },
  });

  // Build lookup: for each date, find the closest rate on or before that date
  const eurRates = allRates.filter((r) => r.currencyCode === "EUR");
  const usdRates = allRates.filter((r) => r.currencyCode === "USD");
  const eurRateCache = new Map<string, number>();
  const usdRateCache = new Map<string, number>();
  for (const date of uniqueDates) {
    const eur = eurRates.find((r) => dateToString(r.date) <= date);
    if (eur) eurRateCache.set(date, eur.rate);
    const usd = usdRates.find((r) => dateToString(r.date) <= date);
    if (usd) usdRateCache.set(date, usd.rate);
  }

  // Prepare all transaction data, collecting valid ones for batch insert
  interface TxData {
    date: Date; year: number; month: number; type: string; account: string;
    category: string; amountOriginal: number; currencyOriginal: string;
    amountEur: number; nbuRateEurUsed: number | null; description: string | null;
    owner: null; source: string; userId: number;
  }
  const validRows: TxData[] = [];

  for (const tx of transactions) {
    try {
      const d = new Date(tx.date);
      if (isNaN(d.getTime())) {
        throw new Error(`Invalid date: ${tx.date}`);
      }

      const txAccount = tx.account || account;
      const currency = currencyMap[tx.currency] || tx.currency || "EUR";

      // Convert non-EUR currencies to EUR using pre-fetched NBU rates
      let amountEur = tx.amount;
      let nbuRateEurUsed: number | null = null;
      if (currency === "UAH") {
        const eurRate = eurRateCache.get(tx.date);
        if (eurRate && eurRate > 0) {
          amountEur = tx.amount / eurRate;
          nbuRateEurUsed = eurRate;
        }
      } else if (currency === "USD") {
        const eurRate = eurRateCache.get(tx.date);
        const usdRate = usdRateCache.get(tx.date);
        if (eurRate && eurRate > 0 && usdRate) {
          amountEur = (tx.amount * usdRate) / eurRate;
          nbuRateEurUsed = eurRate;
        }
      }

      validRows.push({
        date: toDateOnly(tx.date),
        year: d.getFullYear(),
        month: d.getMonth() + 1,
        type: tx.type,
        account: txAccount,
        category: tx.category || "Other",
        amountOriginal: tx.amount,
        currencyOriginal: currency,
        amountEur: Math.round(amountEur * 100) / 100,
        nbuRateEurUsed,
        description: tx.description || null,
        owner: null,
        source: "file_import",
        userId: user.id,
      });
    } catch (err) {
      errors++;
      if (errorMessages.length < 10) {
        errorMessages.push(
          `Row "${tx.description || tx.date}": ${err instanceof Error ? err.message : String(err)}`
        );
      }
    }
  }

  // Batch insert all valid transactions in one query
  if (validRows.length > 0) {
    const result = await prisma.transaction.createMany({ data: validRows });
    imported = result.count;
  }

  updateTag(CACHE_TAGS.finance);
  return { imported, errors, errorMessages };
}

// ---------- AI Categorization ----------

export async function aiCategorizeTransactions(
  descriptions: string[],
): Promise<{ categories: string[]; error?: string }> {
  const user = await requireUser();

  // Get Gemini API key (decrypted)
  const { getSecretValue } = await import("@/actions/settings");
  const geminiApiKey = await getSecretValue(user.id, "gemini_api_key");
  if (!geminiApiKey) {
    return { categories: descriptions.map(() => "Other"), error: "Gemini API key not configured. Go to Settings > Integrations > AI." };
  }

  // Get existing categories
  const existingCats = await prisma.transaction.findMany({
    where: { userId: user.id },
    select: { category: true },
    distinct: ["category"],
  });
  const categoryList = existingCats.map((c) => c.category).filter(Boolean).join(", ");

  const prompt = `You are a transaction categorizer. Given a list of transaction descriptions, assign each one to the most fitting category from this list: ${categoryList}.

If none fit well, use "Other".

Return ONLY a JSON array of strings (categories), one per description, in the same order. No explanations.

Descriptions:
${descriptions.map((d, i) => `${i + 1}. ${d}`).join("\n")}`;

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": geminiApiKey },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.1 },
        }),
      },
    );

    if (!res.ok) {
      return { categories: descriptions.map(() => "Other"), error: `Gemini API error: ${res.status}` };
    }

    const data = await res.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";

    // Extract JSON array from response
    const match = text.match(/\[[\s\S]*\]/);
    if (!match) {
      return { categories: descriptions.map(() => "Other"), error: "AI response format error" };
    }

    const parsed = JSON.parse(match[0]) as string[];
    // Ensure same length
    const result = descriptions.map((_, i) => parsed[i] || "Other");
    return { categories: result };
  } catch (err) {
    return { categories: descriptions.map(() => "Other"), error: `AI error: ${err instanceof Error ? err.message : String(err)}` };
  }
}
