import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/db", () => ({ prisma: {} }));
vi.mock("@/lib/current-user", () => ({ requireUser: vi.fn() }));
vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
vi.mock("next/headers", () => ({ cookies: vi.fn() }));

import { previousPeriodRange } from "./utils";

describe("previousPeriodRange", () => {
  it("computes previous week for a 7-day period", () => {
    // 2024-01-08 to 2024-01-14 (7 days)
    // Previous: 2024-01-01 to 2024-01-07
    const result = previousPeriodRange("2024-01-08", "2024-01-14");
    expect(result.from).toBe("2024-01-01");
    expect(result.to).toBe("2024-01-07");
  });

  it("computes previous month for a ~30-day period", () => {
    // 2024-02-01 to 2024-02-29 (29 days)
    // Previous: 2024-01-03 to 2024-01-31
    const result = previousPeriodRange("2024-02-01", "2024-02-29");
    expect(result.from).toBe("2024-01-03");
    expect(result.to).toBe("2024-01-31");
  });

  it("computes previous period for a single day", () => {
    // 2024-03-15 to 2024-03-15 (1 day)
    // Previous: 2024-03-14 to 2024-03-14
    const result = previousPeriodRange("2024-03-15", "2024-03-15");
    expect(result.from).toBe("2024-03-14");
    expect(result.to).toBe("2024-03-14");
  });

  it("handles year boundary", () => {
    // 2024-01-01 to 2024-01-31 (31 days)
    // Previous: 2023-12-01 to 2023-12-31
    const result = previousPeriodRange("2024-01-01", "2024-01-31");
    expect(result.from).toBe("2023-12-01");
    expect(result.to).toBe("2023-12-31");
  });

  it("handles two-day period", () => {
    // 2024-06-10 to 2024-06-11 (2 days)
    // Previous: 2024-06-08 to 2024-06-09
    const result = previousPeriodRange("2024-06-10", "2024-06-11");
    expect(result.from).toBe("2024-06-08");
    expect(result.to).toBe("2024-06-09");
  });

  it("formats dates with zero-padded months and days", () => {
    const result = previousPeriodRange("2024-03-01", "2024-03-07");
    expect(result.from).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(result.to).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
