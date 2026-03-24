import { describe, it, expect } from "vitest";
import { parseGenericCSV } from "./csv-parser";

function toBuffer(text: string): ArrayBuffer {
  return new TextEncoder().encode(text).buffer as ArrayBuffer;
}

describe("parseGenericCSV", () => {
  it("parses basic CSV with standard headers", () => {
    const csv = "date,description,amount\n2024-01-15,Salary,5000";
    const result = parseGenericCSV(toBuffer(csv));
    expect(result).toHaveLength(1);
    expect(result[0].date).toBe("2024-01-15");
    expect(result[0].description).toBe("Salary");
    expect(result[0].amount).toBe(5000);
    expect(result[0].type).toBe("INCOME");
  });

  it("detects expense from negative amount", () => {
    const csv = "date,description,amount\n2024-02-10,Coffee,-4.50";
    const result = parseGenericCSV(toBuffer(csv));
    expect(result[0].type).toBe("EXPENSE");
    expect(result[0].amount).toBe(4.5);
  });

  it("uses type column when present", () => {
    const csv = "date,description,amount,type\n2024-01-01,Refund,100,INCOME";
    const result = parseGenericCSV(toBuffer(csv));
    expect(result[0].type).toBe("INCOME");
  });

  it("recognizes credit/CR as income type", () => {
    const csv = "date,description,amount,type\n2024-01-01,Payment,50,CR";
    const result = parseGenericCSV(toBuffer(csv));
    expect(result[0].type).toBe("INCOME");
  });

  it("uses category column when present", () => {
    const csv = "date,description,amount,category\n2024-01-01,Rent,-1200,Housing";
    const result = parseGenericCSV(toBuffer(csv));
    expect(result[0].category).toBe("Housing");
  });

  it("defaults to Other when no category column", () => {
    const csv = "date,description,amount\n2024-01-01,Something,-50";
    const result = parseGenericCSV(toBuffer(csv));
    expect(result[0].category).toBe("Other");
  });

  it("uses currency column when present", () => {
    const csv = "date,description,amount,currency\n2024-01-01,Food,-30,UAH";
    const result = parseGenericCSV(toBuffer(csv));
    expect(result[0].currency).toBe("UAH");
  });

  it("defaults to EUR when no currency column", () => {
    const csv = "date,description,amount\n2024-01-01,Food,-30";
    const result = parseGenericCSV(toBuffer(csv));
    expect(result[0].currency).toBe("EUR");
  });

  it("parses semicolon-delimited CSV", () => {
    const csv = "date;description;amount\n2024-06-01;Test;-99.99";
    const result = parseGenericCSV(toBuffer(csv));
    expect(result).toHaveLength(1);
    expect(result[0].amount).toBe(99.99);
  });

  it("skips rows with unparseable date", () => {
    const csv = "date,description,amount\nbaddate,Test,-100\n2024-01-01,Good,50";
    const result = parseGenericCSV(toBuffer(csv));
    expect(result).toHaveLength(1);
    expect(result[0].description).toBe("Good");
  });

  it("skips rows with zero amount", () => {
    const csv = "date,description,amount\n2024-01-01,Free,0";
    const result = parseGenericCSV(toBuffer(csv));
    expect(result).toHaveLength(0);
  });

  it("returns empty for header-only input", () => {
    const csv = "date,description,amount\n";
    const result = parseGenericCSV(toBuffer(csv));
    expect(result).toEqual([]);
  });

  it("handles European date format in generic CSV", () => {
    const csv = "date,description,amount\n25.12.2023,Christmas,-500";
    const result = parseGenericCSV(toBuffer(csv));
    expect(result[0].date).toBe("2023-12-25");
  });
});
