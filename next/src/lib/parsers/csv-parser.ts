/**
 * Generic CSV transaction parser.
 * Auto-detects columns by header name patterns.
 */

import {
  type ParsedTransaction,
  decodeText,
  detectDelimiter,
  parseCSVLines,
  parseDate,
  parseAmount,
  normalizeCurrency,
} from "./shared";

/** Known column name patterns for auto-detection. */
const COL_PATTERNS = {
  date: /^(date|дата|transaction.?date|tx.?date|value.?date|booking.?date)$/i,
  description: /^(description|desc|опис|memo|payee|назначение|details|найменування|comment)$/i,
  amount: /^(amount|сума|suma|sum|amt|value|amount.?eur|kwota)$/i,
  category: /^(category|категорія|категория|cat)$/i,
  currency: /^(currency|валюта|ccy|curr)$/i,
  type: /^(type|тип|direction)$/i,
};

interface ColumnMapping {
  date: number;
  description: number;
  amount: number;
  category: number;
  currency: number;
  type: number;
}

function detectColumns(headers: string[]): ColumnMapping {
  const mapping: ColumnMapping = {
    date: -1,
    description: -1,
    amount: -1,
    category: -1,
    currency: -1,
    type: -1,
  };

  for (let i = 0; i < headers.length; i++) {
    const h = headers[i].trim();
    for (const [key, pattern] of Object.entries(COL_PATTERNS)) {
      if (pattern.test(h) && mapping[key as keyof ColumnMapping] === -1) {
        mapping[key as keyof ColumnMapping] = i;
      }
    }
  }

  // Fallback: if no date found, try first column; if no amount, try last numeric-looking column
  if (mapping.date === -1) mapping.date = 0;
  if (mapping.amount === -1) {
    // Try to find a column index not yet used
    for (let i = headers.length - 1; i >= 0; i--) {
      if (i !== mapping.date && i !== mapping.description) {
        mapping.amount = i;
        break;
      }
    }
  }
  if (mapping.description === -1) {
    for (let i = 0; i < headers.length; i++) {
      if (i !== mapping.date && i !== mapping.amount) {
        mapping.description = i;
        break;
      }
    }
  }

  return mapping;
}

export function parseGenericCSV(buffer: ArrayBuffer): ParsedTransaction[] {
  const text = decodeText(buffer);
  const delimiter = detectDelimiter(text);
  const rows = parseCSVLines(text, delimiter);

  if (rows.length < 2) return [];

  const headers = rows[0];
  const mapping = detectColumns(headers);
  const transactions: ParsedTransaction[] = [];

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (row.length < 2) continue;

    const dateStr = parseDate(row[mapping.date] || "");
    if (!dateStr) continue;

    const rawAmount = parseAmount(row[mapping.amount] || "0");
    if (rawAmount === 0) continue;

    const description = mapping.description >= 0 ? (row[mapping.description] || "") : "";
    const category = mapping.category >= 0 ? (row[mapping.category] || "") : "";
    const currency = mapping.currency >= 0 ? (row[mapping.currency] || "EUR") : "EUR";
    const typeRaw = mapping.type >= 0 ? (row[mapping.type] || "") : "";

    let txType: "INCOME" | "EXPENSE";
    if (typeRaw) {
      const upper = typeRaw.toUpperCase().trim();
      txType = ["INCOME", "IN", "CREDIT", "CR", "+"].includes(upper) ? "INCOME" : "EXPENSE";
    } else {
      txType = rawAmount > 0 ? "INCOME" : "EXPENSE";
    }

    transactions.push({
      date: dateStr,
      description: description.trim(),
      amount: Math.abs(rawAmount),
      type: txType,
      category: category.trim() || "Other",
      currency: normalizeCurrency(currency),
      account: "",
    });
  }

  return transactions;
}
