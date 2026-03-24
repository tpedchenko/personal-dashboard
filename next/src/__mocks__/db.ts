import { vi } from "vitest";

export const prisma = {
  budgetConfig: { findFirst: vi.fn(), update: vi.fn(), create: vi.fn() },
  mandatoryCategory: { findMany: vi.fn(), create: vi.fn(), delete: vi.fn() },
  transaction: { aggregate: vi.fn(), groupBy: vi.fn(), findMany: vi.fn() },
  garminDaily: { aggregate: vi.fn(), findMany: vi.fn() },
  withingsMeasurement: { findFirst: vi.fn() },
  gymWorkout: { count: vi.fn(), aggregate: vi.fn(), findMany: vi.fn() },
  dailyLog: { aggregate: vi.fn(), findMany: vi.fn() },
  foodLog: { aggregate: vi.fn() },
  $queryRaw: vi.fn(),
};
