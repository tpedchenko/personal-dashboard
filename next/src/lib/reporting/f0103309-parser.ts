/**
 * Parser for Ukrainian FOP tax declaration F0103309.
 * Extracts key financial data from XML returned by DPS API.
 *
 * Key fields in F0103309 (cumulative totals):
 * - R01G01: Income (дохід) — cumulative for year
 * - R01G03: Single tax (єдиний податок) — cumulative
 * - R02G01: ESV (єдиний соціальний внесок) — cumulative
 * - R03G01: Military levy (військовий збір) — cumulative
 */

export interface F0103309Data {
  /** Declaration period info */
  year: number;
  quarter: number;
  period: string; // "2025-Q1", "2025-H1", "2025-9M", "2025-ANNUAL"

  /** Cumulative amounts (narostayuchym pidsumkom) */
  income: number; // R01G01 — total income
  singleTax: number; // R01G03 — single tax (EP)
  esv: number; // R02G01 — social contribution
  militaryLevy: number; // R03G01 — military levy (VZ)

  /** Calculated quarterly amounts */
  quarterlyIncome: number;
  quarterlySingleTax: number;
  quarterlyEsv: number;
  quarterlyMilitaryLevy: number;

  /** Effective tax rate */
  effectiveRate: number;

  /** All extracted fields */
  fields: Record<string, string>;
}

/**
 * Parse F0103309 XML content and extract financial data.
 */
export function parseF0103309(xml: string): F0103309Data {
  const fields: Record<string, string> = {};

  // Extract all R-coded fields (e.g., R01G01, R01G03, R02G01, R03G01)
  const fieldRegex = /<(R\d{2}G\d{2})[^>]*>([^<]*)<\/\1>/g;
  let match;
  while ((match = fieldRegex.exec(xml)) !== null) {
    fields[match[1]] = match[2].trim();
  }

  // Also try HBOS (header) fields for period info
  const headerRegex = /<(H\w+)[^>]*>([^<]*)<\/\1>/g;
  while ((match = headerRegex.exec(xml)) !== null) {
    fields[match[1]] = match[2].trim();
  }

  const income = parseFloat(fields["R01G01"] || "0");
  const singleTax = parseFloat(fields["R01G03"] || "0");
  const esv = parseFloat(fields["R02G01"] || "0");
  const militaryLevy = parseFloat(fields["R03G01"] || "0");

  // Determine period from XML header fields
  const year = parseInt(fields["HPERIOD_YEAR"] || fields["HZY"] || "0") ||
    new Date().getFullYear();
  const periodType = parseInt(fields["HPERIOD_TYPE"] || fields["HZT"] || "0");

  let quarter: number;
  let period: string;
  switch (periodType) {
    case 1:
      quarter = 1;
      period = `${year}-Q1`;
      break;
    case 2:
      quarter = 2;
      period = `${year}-H1`;
      break;
    case 3:
      quarter = 3;
      period = `${year}-9M`;
      break;
    case 4:
    default:
      quarter = 4;
      period = `${year}-ANNUAL`;
      break;
  }

  // Calculate effective rate
  const totalTax = singleTax + militaryLevy;
  const effectiveRate = income > 0 ? (totalTax / income) * 100 : 0;

  return {
    year,
    quarter,
    period,
    income,
    singleTax,
    esv,
    militaryLevy,
    quarterlyIncome: income, // Will be calculated from previous period
    quarterlySingleTax: singleTax,
    quarterlyEsv: esv,
    quarterlyMilitaryLevy: militaryLevy,
    effectiveRate: Math.round(effectiveRate * 100) / 100,
    fields,
  };
}

/**
 * Calculate quarterly amounts from cumulative declarations.
 * F0103309 uses cumulative totals, so Q2 = H1 - Q1, etc.
 */
export function calculateQuarterlyAmounts(
  declarations: F0103309Data[],
): F0103309Data[] {
  // Sort by quarter
  const sorted = [...declarations].sort((a, b) => a.quarter - b.quarter);

  for (let i = 0; i < sorted.length; i++) {
    if (i === 0) {
      // Q1 — cumulative IS the quarterly amount
      sorted[i].quarterlyIncome = sorted[i].income;
      sorted[i].quarterlySingleTax = sorted[i].singleTax;
      sorted[i].quarterlyEsv = sorted[i].esv;
      sorted[i].quarterlyMilitaryLevy = sorted[i].militaryLevy;
    } else {
      // Subsequent quarters: subtract previous cumulative
      const prev = sorted[i - 1];
      sorted[i].quarterlyIncome = sorted[i].income - prev.income;
      sorted[i].quarterlySingleTax = sorted[i].singleTax - prev.singleTax;
      sorted[i].quarterlyEsv = sorted[i].esv - prev.esv;
      sorted[i].quarterlyMilitaryLevy = sorted[i].militaryLevy - prev.militaryLevy;
    }
  }

  return sorted;
}
