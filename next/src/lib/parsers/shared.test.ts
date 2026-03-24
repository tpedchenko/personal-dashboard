import { describe, it, expect } from "vitest";
import {
  parseDate,
  parseAmount,
  normalizeCurrency,
  detectDelimiter,
  parseCSVLines,
} from "./shared";

// ---------------------------------------------------------------------------
// parseDate
// ---------------------------------------------------------------------------
describe("parseDate", () => {
  it("parses ISO format YYYY-MM-DD", () => {
    expect(parseDate("2024-01-15")).toBe("2024-01-15");
  });

  it("parses ISO with time YYYY-MM-DD HH:MM:SS", () => {
    expect(parseDate("2024-03-05 14:30:00")).toBe("2024-03-05");
  });

  it("pads single-digit month/day in ISO", () => {
    expect(parseDate("2024-3-5")).toBe("2024-03-05");
  });

  it("parses European DD.MM.YYYY", () => {
    expect(parseDate("15.01.2024")).toBe("2024-01-15");
  });

  it("parses European with single digits", () => {
    expect(parseDate("5.3.2024")).toBe("2024-03-05");
  });

  it("parses DD/MM/YYYY slash format", () => {
    expect(parseDate("25/12/2023")).toBe("2023-12-25");
  });

  it("returns null for empty string", () => {
    expect(parseDate("")).toBeNull();
  });

  it("returns null for unrecognized format", () => {
    expect(parseDate("not-a-date")).toBeNull();
  });

  it("trims whitespace", () => {
    expect(parseDate("  2024-06-01  ")).toBe("2024-06-01");
  });
});

// ---------------------------------------------------------------------------
// parseAmount
// ---------------------------------------------------------------------------
describe("parseAmount", () => {
  it("parses simple integer", () => {
    expect(parseAmount("100")).toBe(100);
  });

  it("parses negative amount", () => {
    expect(parseAmount("-250.50")).toBe(-250.5);
  });

  it("parses European comma decimal: 1234,56", () => {
    expect(parseAmount("1234,56")).toBe(1234.56);
  });

  it("parses thousands with dot, decimal with comma: 1.234,56", () => {
    expect(parseAmount("1.234,56")).toBe(1234.56);
  });

  it("parses US format: 1,234.56", () => {
    expect(parseAmount("1,234.56")).toBe(1234.56);
  });

  it("handles spaces as thousands separator: 1 234,56", () => {
    expect(parseAmount("1 234,56")).toBe(1234.56);
  });

  it("handles non-breaking space \\u00a0", () => {
    expect(parseAmount("1\u00a0234,56")).toBe(1234.56);
  });

  it("returns 0 for empty string", () => {
    expect(parseAmount("")).toBe(0);
  });

  it("returns 0 for non-numeric input", () => {
    expect(parseAmount("abc")).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// normalizeCurrency
// ---------------------------------------------------------------------------
describe("normalizeCurrency", () => {
  it("normalizes EUR code", () => {
    expect(normalizeCurrency("EUR")).toBe("EUR");
  });

  it("normalizes euro symbol", () => {
    expect(normalizeCurrency("€")).toBe("EUR");
  });

  it("normalizes UAH", () => {
    expect(normalizeCurrency("UAH")).toBe("UAH");
  });

  it("normalizes hryvnia symbol ₴", () => {
    expect(normalizeCurrency("₴")).toBe("UAH");
  });

  it("normalizes dollar sign", () => {
    expect(normalizeCurrency("$")).toBe("USD");
  });

  it("normalizes lowercase", () => {
    expect(normalizeCurrency("eur")).toBe("EUR");
  });

  it("normalizes PLN", () => {
    expect(normalizeCurrency("PLN")).toBe("PLN");
  });

  it("returns unknown currency as-is", () => {
    expect(normalizeCurrency("CHF")).toBe("CHF");
  });

  it("returns EUR for empty string", () => {
    expect(normalizeCurrency("")).toBe("EUR");
  });
});

// ---------------------------------------------------------------------------
// detectDelimiter
// ---------------------------------------------------------------------------
describe("detectDelimiter", () => {
  it("detects comma delimiter", () => {
    const csv = "date,amount,desc\n2024-01-01,100,test";
    expect(detectDelimiter(csv)).toBe(",");
  });

  it("detects semicolon delimiter", () => {
    const csv = "date;amount;desc\n2024-01-01;100;test";
    expect(detectDelimiter(csv)).toBe(";");
  });

  it("detects tab delimiter", () => {
    const csv = "date\tamount\tdesc\n2024-01-01\t100\ttest";
    expect(detectDelimiter(csv)).toBe("\t");
  });

  it("detects pipe delimiter", () => {
    const csv = "date|amount|desc\n2024-01-01|100|test";
    expect(detectDelimiter(csv)).toBe("|");
  });

  it("defaults to comma when ambiguous", () => {
    expect(detectDelimiter("hello")).toBe(",");
  });
});

// ---------------------------------------------------------------------------
// parseCSVLines
// ---------------------------------------------------------------------------
describe("parseCSVLines", () => {
  it("parses basic CSV", () => {
    const text = "a,b,c\n1,2,3";
    const result = parseCSVLines(text, ",");
    expect(result).toEqual([
      ["a", "b", "c"],
      ["1", "2", "3"],
    ]);
  });

  it("handles quoted fields", () => {
    const text = 'a,"hello, world",c\n1,2,3';
    const result = parseCSVLines(text, ",");
    expect(result[0]).toEqual(["a", "hello, world", "c"]);
  });

  it("handles escaped quotes inside quoted fields", () => {
    const text = 'a,"say ""hello""",c';
    const result = parseCSVLines(text, ",");
    expect(result[0]).toEqual(["a", 'say "hello"', "c"]);
  });

  it("handles semicolon delimiter", () => {
    const text = "a;b;c\n1;2;3";
    const result = parseCSVLines(text, ";");
    expect(result).toEqual([
      ["a", "b", "c"],
      ["1", "2", "3"],
    ]);
  });

  it("handles newlines within quoted fields", () => {
    const text = 'a,"line1\nline2",c\n1,2,3';
    const result = parseCSVLines(text, ",");
    expect(result[0]).toEqual(["a", "line1\nline2", "c"]);
    expect(result[1]).toEqual(["1", "2", "3"]);
  });

  it("skips empty lines", () => {
    const text = "a,b\n\n1,2";
    const result = parseCSVLines(text, ",");
    expect(result).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });

  it("trims whitespace from fields", () => {
    const text = " a , b , c ";
    const result = parseCSVLines(text, ",");
    expect(result[0]).toEqual(["a", "b", "c"]);
  });
});
