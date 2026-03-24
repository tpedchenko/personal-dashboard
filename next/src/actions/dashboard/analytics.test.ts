import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/db", () => ({ prisma: {} }));
vi.mock("@/lib/current-user", () => ({ requireUser: vi.fn() }));
vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
vi.mock("next/headers", () => ({ cookies: vi.fn() }));

import { pearsonR } from "./utils";

describe("pearsonR", () => {
  it("returns 1 for perfect positive correlation", () => {
    const xs = [1, 2, 3, 4, 5];
    const ys = [2, 4, 6, 8, 10];
    expect(pearsonR(xs, ys)).toBe(1);
  });

  it("returns -1 for perfect negative correlation", () => {
    const xs = [1, 2, 3, 4, 5];
    const ys = [10, 8, 6, 4, 2];
    expect(pearsonR(xs, ys)).toBe(-1);
  });

  it("returns 0 for no correlation (orthogonal data)", () => {
    // Symmetric data with no linear trend
    const xs = [1, 2, 3, 4, 5];
    const ys = [2, 4, 6, 4, 2];
    expect(pearsonR(xs, ys)).toBe(0);
  });

  it("returns 0 for fewer than 3 data points", () => {
    expect(pearsonR([1, 2], [3, 4])).toBe(0);
    expect(pearsonR([], [])).toBe(0);
    expect(pearsonR([1], [1])).toBe(0);
  });

  it("returns 0 when all xs are the same (zero variance)", () => {
    const xs = [5, 5, 5, 5];
    const ys = [1, 2, 3, 4];
    expect(pearsonR(xs, ys)).toBe(0);
  });

  it("returns 0 when all ys are the same (zero variance)", () => {
    const xs = [1, 2, 3, 4];
    const ys = [5, 5, 5, 5];
    expect(pearsonR(xs, ys)).toBe(0);
  });

  it("rounds to 3 decimal places", () => {
    const xs = [1, 2, 3, 4, 5, 6];
    const ys = [1, 3, 2, 5, 4, 6];
    const r = pearsonR(xs, ys);
    const decimalPlaces = r.toString().split(".")[1]?.length ?? 0;
    expect(decimalPlaces).toBeLessThanOrEqual(3);
  });

  it("computes a known correlation value", () => {
    // Known dataset: r ≈ 0.886
    const xs = [1, 2, 3, 4, 5];
    const ys = [1, 2, 1.3, 3.75, 2.25];
    const r = pearsonR(xs, ys);
    expect(r).toBe(0.627);
  });
});
