/**
 * Transaction import parsers — barrel export.
 */

export type { ParsedTransaction, ImportFormat } from "./shared";
export { parseGenericCSV } from "./csv-parser";
export { isMonobankFormat, parseMonobankCSV } from "./monobank-parser";

import type { ImportFormat, ParsedTransaction } from "./shared";
import { parseGenericCSV } from "./csv-parser";
import { isMonobankFormat, parseMonobankCSV } from "./monobank-parser";

export function detectFormat(buffer: ArrayBuffer): ImportFormat {
  if (isMonobankFormat(buffer)) return "monobank";
  return "csv";
}

export function parseImportBuffer(buffer: ArrayBuffer, format?: ImportFormat): ParsedTransaction[] {
  const fmt = format || detectFormat(buffer);
  switch (fmt) {
    case "monobank":
      return parseMonobankCSV(buffer);
    case "csv":
    default:
      return parseGenericCSV(buffer);
  }
}
