import { describe, it, expect } from "vitest";
import { parseMonobankCSV, isMonobankFormat } from "./monobank-parser";

function toBuffer(text: string): ArrayBuffer {
  return new TextEncoder().encode(text).buffer as ArrayBuffer;
}

const MONO_HEADER =
  "Дата і час операції;Деталі операції;MCC;Сума в валюті картки (UAH);Валюта;Сума в валюті операції;Валюта;Курс;Сума комісій (UAH);Сума кешбеку (UAH);Залишок;Відповідальний";

describe("isMonobankFormat", () => {
  it("recognizes monobank header", () => {
    const buf = toBuffer(MONO_HEADER + "\n");
    expect(isMonobankFormat(buf)).toBe(true);
  });

  it("rejects non-monobank header", () => {
    const buf = toBuffer("date,amount,description\n");
    expect(isMonobankFormat(buf)).toBe(false);
  });
});

describe("parseMonobankCSV", () => {
  it("parses a sample monobank CSV with expense", () => {
    const csv = [
      MONO_HEADER,
      '15.03.2024 12:30:00;Silpo supermarket;5411;-250,50;UAH;-250,50;UAH;1;0;0;10000;',
    ].join("\n");

    const result = parseMonobankCSV(toBuffer(csv));
    expect(result).toHaveLength(1);
    expect(result[0].date).toBe("2024-03-15");
    expect(result[0].description).toBe("Silpo supermarket");
    expect(result[0].amount).toBe(250.5);
    expect(result[0].type).toBe("EXPENSE");
    expect(result[0].category).toBe("Food / Groceries");
    expect(result[0].currency).toBe("UAH");
    expect(result[0].account).toBe("Monobank");
    expect(result[0].mcc).toBe("5411");
  });

  it("parses income transaction (positive amount)", () => {
    const csv = [
      MONO_HEADER,
      '10.01.2024 09:00:00;Salary payment;6012;50000,00;UAH;50000,00;UAH;1;0;0;60000;',
    ].join("\n");

    const result = parseMonobankCSV(toBuffer(csv));
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe("INCOME");
    expect(result[0].amount).toBe(50000);
  });

  it("assigns category based on MCC", () => {
    const csv = [
      MONO_HEADER,
      '01.02.2024 18:00:00;Uber ride;4121;-150,00;UAH;-150,00;UAH;1;0;0;9000;',
    ].join("\n");

    const result = parseMonobankCSV(toBuffer(csv));
    expect(result[0].category).toBe("Transport");
  });

  it("assigns Other for unknown MCC", () => {
    const csv = [
      MONO_HEADER,
      '01.02.2024 18:00:00;Something;9999;-100,00;UAH;-100,00;UAH;1;0;0;9000;',
    ].join("\n");

    const result = parseMonobankCSV(toBuffer(csv));
    expect(result[0].category).toBe("Other");
  });

  it("returns empty array for header-only CSV", () => {
    const result = parseMonobankCSV(toBuffer(MONO_HEADER + "\n"));
    expect(result).toEqual([]);
  });

  it("skips rows with zero amount", () => {
    const csv = [
      MONO_HEADER,
      '01.02.2024 18:00:00;Zero tx;5411;0;UAH;0;UAH;1;0;0;9000;',
    ].join("\n");

    const result = parseMonobankCSV(toBuffer(csv));
    expect(result).toHaveLength(0);
  });

  it("parses multiple transactions", () => {
    const csv = [
      MONO_HEADER,
      '15.03.2024 12:00:00;Tx one;5411;-100,00;UAH;-100,00;UAH;1;0;0;10000;',
      '16.03.2024 13:00:00;Tx two;5812;-200,00;UAH;-200,00;UAH;1;0;0;9800;',
    ].join("\n");

    const result = parseMonobankCSV(toBuffer(csv));
    expect(result).toHaveLength(2);
    expect(result[0].date).toBe("2024-03-15");
    expect(result[1].date).toBe("2024-03-16");
    expect(result[1].category).toBe("Food / Restaurants");
  });
});
