/**
 * Shared types and utilities for transaction import parsers.
 */

export interface ParsedTransaction {
  date: string;            // YYYY-MM-DD
  description: string;
  amount: number;          // always positive
  type: "INCOME" | "EXPENSE";
  category: string;
  currency: string;        // EUR, UAH, USD
  account: string;
  mcc?: string;
  balance?: number;
}

export type ImportFormat = "csv" | "monobank";

/** Try decoding bytes with several encodings (for raw ArrayBuffer input). */
export function decodeText(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);

  // Check for UTF-8 BOM
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    return new TextDecoder("utf-8").decode(bytes.slice(3));
  }

  // Try UTF-8 first
  try {
    const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    return text;
  } catch {
    // Fallback to windows-1251 (common for Ukrainian CSV exports)
  }

  try {
    return new TextDecoder("windows-1251", { fatal: false }).decode(bytes);
  } catch {
    return new TextDecoder("utf-8", { fatal: false }).decode(bytes);
  }
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Auto-detect delimiter from the first few lines. */
export function detectDelimiter(text: string): string {
  const firstLines = text.split("\n").slice(0, 5).join("\n");
  const candidates = [",", ";", "\t", "|"];
  let best = ",";
  let bestCount = 0;

  for (const sep of candidates) {
    const count = (firstLines.match(new RegExp(escapeRegex(sep), "g")) || []).length;
    if (count > bestCount) {
      bestCount = count;
      best = sep;
    }
  }
  return best;
}

/** Parse a CSV string into rows of string arrays. Handles quoted fields. */
export function parseCSVLines(text: string, delimiter: string): string[][] {
  const rows: string[][] = [];
  const lines = text.split("\n");
  let currentRow: string[] = [];
  let currentField = "";
  let inQuotes = false;

  for (const line of lines) {
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (inQuotes) {
        if (ch === '"') {
          if (i + 1 < line.length && line[i + 1] === '"') {
            currentField += '"';
            i++;
          } else {
            inQuotes = false;
          }
        } else {
          currentField += ch;
        }
      } else {
        if (ch === '"') {
          inQuotes = true;
        } else if (ch === delimiter) {
          currentRow.push(currentField.trim());
          currentField = "";
        } else if (ch === "\r") {
          // skip
        } else {
          currentField += ch;
        }
      }
    }

    if (inQuotes) {
      // Line continues (quoted field with newline)
      currentField += "\n";
    } else {
      currentRow.push(currentField.trim());
      currentField = "";
      if (currentRow.length > 1 || (currentRow.length === 1 && currentRow[0] !== "")) {
        rows.push(currentRow);
      }
      currentRow = [];
    }
  }

  // Flush remaining
  if (currentRow.length > 0 || currentField.length > 0) {
    currentRow.push(currentField.trim());
    if (currentRow.some((f) => f !== "")) {
      rows.push(currentRow);
    }
  }

  return rows;
}

/** Try parsing a date string in various formats, return YYYY-MM-DD or null. */
export function parseDate(raw: string): string | null {
  if (!raw) return null;
  const s = raw.trim();

  // YYYY-MM-DD or YYYY-MM-DD HH:MM:SS
  const isoMatch = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (isoMatch) {
    return `${isoMatch[1]}-${isoMatch[2].padStart(2, "0")}-${isoMatch[3].padStart(2, "0")}`;
  }

  // DD.MM.YYYY (common European/Ukrainian format)
  const euMatch = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})/);
  if (euMatch) {
    return `${euMatch[3]}-${euMatch[2].padStart(2, "0")}-${euMatch[1].padStart(2, "0")}`;
  }

  // DD/MM/YYYY
  const slashMatch = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (slashMatch) {
    return `${slashMatch[3]}-${slashMatch[2].padStart(2, "0")}-${slashMatch[1].padStart(2, "0")}`;
  }

  return null;
}

/** Parse an amount string like "1 234,56" or "-1,234.56" into a number. */
export function parseAmount(raw: string): number {
  if (!raw) return 0;
  let s = raw.trim().replace(/\s/g, "").replace(/\u00a0/g, "");

  // If both comma and dot present, determine which is decimal separator
  const lastComma = s.lastIndexOf(",");
  const lastDot = s.lastIndexOf(".");

  if (lastComma > lastDot) {
    // Comma is decimal separator: 1.234,56 -> 1234.56
    s = s.replace(/\./g, "").replace(",", ".");
  } else if (lastDot > lastComma) {
    // Dot is decimal separator: 1,234.56 -> 1234.56
    s = s.replace(/,/g, "");
  } else {
    // Only one type or none
    s = s.replace(",", ".");
  }

  return parseFloat(s) || 0;
}

export function normalizeCurrency(raw: string): string {
  const s = raw.trim().toUpperCase();
  const map: Record<string, string> = {
    "EUR": "EUR", "\u20AC": "EUR",
    "UAH": "UAH", "\u20B4": "UAH", "UKR": "UAH",
    "USD": "USD", "$": "USD",
    "PLN": "PLN", "Z\u0141": "PLN",
    "GBP": "GBP", "\u00A3": "GBP",
    "CZK": "CZK",
  };
  return map[s] || s || "EUR";
}
