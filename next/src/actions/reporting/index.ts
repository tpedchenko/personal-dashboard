"use server";

import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/current-user";

// ─── Declarations ───

export async function getDeclarations() {
  const user = await requireUser();
  return prisma.taxDeclaration.findMany({
    where: { userId: user.id },
    include: { receipt: true, items: true },
    orderBy: { createdAt: "desc" },
  });
}

export async function getDeclaration(id: string) {
  const user = await requireUser();
  return prisma.taxDeclaration.findFirst({
    where: { id, userId: user.id },
    include: { receipt: true, items: true },
  });
}

export async function createDeclaration(data: {
  country: string;
  type: string;
  period: string;
  year: number;
  quarter?: number;
}) {
  const user = await requireUser();
  return prisma.taxDeclaration.create({
    data: {
      userId: user.id,
      country: data.country,
      type: data.type,
      period: data.period,
      year: data.year,
      quarter: data.quarter,
    },
  });
}

// ─── Deadlines ───

export async function getDeadlines() {
  const user = await requireUser();
  return prisma.taxDeadline.findMany({
    where: { userId: user.id },
    orderBy: { dueDate: "asc" },
  });
}

export async function getUpcomingDeadlines() {
  const user = await requireUser();
  const now = new Date();
  return prisma.taxDeadline.findMany({
    where: {
      userId: user.id,
      dueDate: { gte: now },
      completedAt: null,
    },
    orderBy: { dueDate: "asc" },
    take: 5,
  });
}

// ─── Income Records ───

export async function getIncomeRecords(year?: number) {
  const user = await requireUser();
  const where: Record<string, unknown> = { userId: user.id };
  if (year) where.year = year;
  return prisma.taxIncomeRecord.findMany({
    where,
    orderBy: { date: "desc" },
  });
}

export async function addIncomeRecord(data: {
  country: string;
  source: string;
  amount: number;
  currency: string;
  date: string;
  year: number;
  quarter?: number;
  category?: string;
  description?: string;
}) {
  const user = await requireUser();
  return prisma.taxIncomeRecord.create({
    data: {
      userId: user.id,
      ...data,
      amount: data.amount,
      date: new Date(data.date),
    },
  });
}

// ─── Dashboard Overview ───

export async function getReportingOverview() {
  const user = await requireUser();
  const currentYear = new Date().getFullYear();

  const [declarations, deadlines, incomeRecords] = await Promise.all([
    prisma.taxDeclaration.findMany({
      where: { userId: user.id, year: currentYear },
      include: { receipt: true },
      orderBy: { createdAt: "desc" },
    }),
    prisma.taxDeadline.findMany({
      where: {
        userId: user.id,
        dueDate: { gte: new Date() },
        completedAt: null,
      },
      orderBy: { dueDate: "asc" },
      take: 5,
    }),
    prisma.taxIncomeRecord.findMany({
      where: { userId: user.id, year: currentYear },
    }),
  ]);

  const totalIncomeUA = incomeRecords
    .filter((r) => r.country === "UA")
    .reduce((sum, r) => sum + Number(r.amount), 0);
  const totalIncomeES = incomeRecords
    .filter((r) => r.country === "ES")
    .reduce((sum, r) => sum + Number(r.amount), 0);

  return {
    declarations,
    deadlines,
    totalIncomeUA,
    totalIncomeES,
    currentYear,
  };
}

// ─── UA Tax Overview (extended) ───

export interface UaTaxQuarterData {
  quarter: number;
  period: string;
  income: number;
  singleTax: number;
  esv: number;
  militaryLevy: number;
  effectiveRate: number;
  status: string;
}

export interface UaTaxYearSummary {
  year: number;
  totalIncome: number;
  totalSingleTax: number;
  totalEsv: number;
  totalMilitaryLevy: number;
  totalTaxBurden: number;
  effectiveRate: number;
  quarters: UaTaxQuarterData[];
}

export interface UaTaxOverview {
  currentYear: number;
  years: UaTaxYearSummary[];
  budgetBalance: number; // positive = overpayment, negative = debt
  declarationCount: number;
}

export async function getUaTaxOverview(): Promise<UaTaxOverview> {
  const user = await requireUser();
  const currentYear = new Date().getFullYear();

  // Get all UA declarations with items for 2022-current year
  const declarations = await prisma.taxDeclaration.findMany({
    where: {
      userId: user.id,
      country: "UA",
      type: "F0103309",
      year: { gte: 2022 },
    },
    include: { items: true, receipt: true },
    orderBy: [{ year: "asc" }, { quarter: "asc" }],
  });

  // Group by year
  const yearMap = new Map<number, typeof declarations>();
  for (const d of declarations) {
    const arr = yearMap.get(d.year) || [];
    arr.push(d);
    yearMap.set(d.year, arr);
  }

  const years: UaTaxYearSummary[] = [];

  for (const [year, yearDecls] of yearMap) {
    const quarters: UaTaxQuarterData[] = [];

    // Sort by quarter and calculate quarterly amounts from cumulative
    const sorted = yearDecls.sort((a, b) => (a.quarter || 0) - (b.quarter || 0));

    for (let i = 0; i < sorted.length; i++) {
      const d = sorted[i];
      const items = d.items;

      const income = parseFloat(items.find((it) => it.key === "R01G01")?.value || "0");
      const singleTax = parseFloat(items.find((it) => it.key === "R01G03")?.value || "0");
      const esv = parseFloat(items.find((it) => it.key === "R02G01")?.value || "0");
      const militaryLevy = parseFloat(items.find((it) => it.key === "R03G01")?.value || "0");

      // Calculate quarterly difference from cumulative
      let qIncome = income;
      let qSingleTax = singleTax;
      let qEsv = esv;
      let qMilitaryLevy = militaryLevy;

      if (i > 0) {
        const prev = sorted[i - 1];
        const prevItems = prev.items;
        qIncome -= parseFloat(prevItems.find((it) => it.key === "R01G01")?.value || "0");
        qSingleTax -= parseFloat(prevItems.find((it) => it.key === "R01G03")?.value || "0");
        qEsv -= parseFloat(prevItems.find((it) => it.key === "R02G01")?.value || "0");
        qMilitaryLevy -= parseFloat(prevItems.find((it) => it.key === "R03G01")?.value || "0");
      }

      const periodLabels: Record<number, string> = { 1: "Q1", 2: "H1", 3: "9M", 4: "Annual" };
      quarters.push({
        quarter: d.quarter || 0,
        period: `${year}-${periodLabels[d.quarter || 0] || "Q?"}`,
        income: qIncome,
        singleTax: qSingleTax,
        esv: qEsv,
        militaryLevy: qMilitaryLevy,
        effectiveRate: qIncome > 0 ? Math.round(((qSingleTax + qMilitaryLevy) / qIncome) * 10000) / 100 : 0,
        status: d.status,
      });
    }

    // Year totals from the last (most cumulative) declaration
    const lastDecl = sorted[sorted.length - 1];
    const lastItems = lastDecl?.items || [];
    const totalIncome = parseFloat(lastItems.find((it) => it.key === "R01G01")?.value || "0");
    const totalSingleTax = parseFloat(lastItems.find((it) => it.key === "R01G03")?.value || "0");
    const totalEsv = parseFloat(lastItems.find((it) => it.key === "R02G01")?.value || "0");
    const totalMilitaryLevy = parseFloat(lastItems.find((it) => it.key === "R03G01")?.value || "0");
    const totalTaxBurden = totalSingleTax + totalEsv + totalMilitaryLevy;

    years.push({
      year,
      totalIncome,
      totalSingleTax,
      totalEsv,
      totalMilitaryLevy,
      totalTaxBurden,
      effectiveRate: totalIncome > 0 ? Math.round((totalTaxBurden / totalIncome) * 10000) / 100 : 0,
      quarters,
    });
  }

  return {
    currentYear,
    years,
    budgetBalance: 0, // Will be populated from DPS balance API
    declarationCount: declarations.length,
  };
}
