"use server";

import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/current-user";
import { calculateIrpf, type IrpfInput, type IrpfComparison } from "@/lib/reporting/irpf-calculator";
import type { ParsedNomina } from "@/lib/reporting/nomina-parser";
import type { BrokerTaxReport } from "@/lib/reporting/broker-parsers";
import type { ParsedCertificado } from "@/lib/reporting/certificado-parser";

// ─── Tax Documents ───

export async function getEsTaxDocuments(year?: number) {
  const user = await requireUser();
  const where: Record<string, unknown> = { userId: user.id, country: "ES" };
  if (year) where.year = year;
  return prisma.taxDocument.findMany({
    where,
    orderBy: [{ year: "desc" }, { month: "asc" }],
  });
}

export async function deleteEsTaxDocument(id: string) {
  const user = await requireUser();
  return prisma.taxDocument.deleteMany({
    where: { id, userId: user.id },
  });
}

// ─── ES Tax Overview ───

export interface EsNominaMonth {
  period: string;
  month: number;
  year: number;
  grossPay: number;
  baseIrpf: number;
  irpfPct: number;
  irpfWithheld: number;
  baseSS: number;
  ssTotal: number;
  netPay: number;
  bonus: number;
  fileName: string | null;
}

export interface EsInvestmentSummary {
  broker: string;
  dividends: number;
  interestIncome: number;
  realizedGains: number;
  realizedLosses: number;
  withheldTax: number;
  fees: number;
}

export interface EsDocumentSummary {
  id: string;
  docType: string;
  source: string | null;
  period: string;
  year: number;
  month: number | null;
  fileName: string | null;
  createdAt: string;
  summary: string; // short description of content
}

export interface EsTaxOverview {
  year: number;
  // Nomina data
  nominas: EsNominaMonth[];
  totalGross: number;
  totalBaseIrpf: number;
  totalIrpfWithheld: number;
  totalSS: number;
  totalNetPay: number;
  avgIrpfRate: number;
  monthsUploaded: number;
  // Investment data
  investments: EsInvestmentSummary[];
  totalDividends: number;
  totalCapitalGains: number;
  totalCapitalLosses: number;
  totalInvestmentWithheld: number;
  // Certificado verification
  certificado: ParsedCertificado | null;
  verification: {
    hasCertificado: boolean;
    grossMatch: boolean;
    retencionesMatch: boolean;
    ssMatch: boolean;
    nominaGross: number;
    certGross: number;
    nominaRetenciones: number;
    certRetenciones: number;
    nominaSS: number;
    certSS: number;
  } | null;
  // IRPF calculation
  irpfComparison: IrpfComparison | null;
  // All uploaded documents
  documents: EsDocumentSummary[];
}

export async function getEsTaxOverview(year?: number): Promise<EsTaxOverview> {
  const user = await requireUser();
  const targetYear = year || new Date().getFullYear();

  const docs = await prisma.taxDocument.findMany({
    where: { userId: user.id, country: "ES", year: targetYear },
    orderBy: [{ month: "asc" }],
  });

  // Single-pass: parse each document once, classify by type
  const nominas: EsNominaMonth[] = [];
  const investments: EsInvestmentSummary[] = [];
  let certificado: ParsedCertificado | null = null;
  const parsedCache = new Map<string, ParsedNomina | BrokerTaxReport | ParsedCertificado>();

  for (const doc of docs) {
    if (!doc.parsedJson) continue;
    const parsed = JSON.parse(doc.parsedJson);
    parsedCache.set(doc.id, parsed);

    if (doc.docType === "NOMINA") {
      const p = parsed as ParsedNomina;
      nominas.push({
        period: p.period, month: p.month, year: p.year,
        grossPay: p.grossPay, baseIrpf: p.baseIrpf, irpfPct: p.irpfPct,
        irpfWithheld: p.irpfWithheld, baseSS: p.baseSS, ssTotal: p.ssTotal,
        netPay: p.netPay, bonus: p.bonus, fileName: doc.fileName,
      });
    } else if (doc.docType === "BROKER_REPORT") {
      const r = parsed as BrokerTaxReport;
      investments.push({
        broker: r.broker, dividends: r.dividends, interestIncome: r.interestIncome,
        realizedGains: r.realizedGains, realizedLosses: r.realizedLosses,
        withheldTax: r.withheldTax, fees: r.fees,
      });
    } else if (doc.docType === "CERTIFICADO_RETENCIONES" && !certificado) {
      certificado = parsed as ParsedCertificado;
    }
  }

  const totalGross = nominas.reduce((s, n) => s + n.grossPay, 0);
  const totalBaseIrpf = nominas.reduce((s, n) => s + n.baseIrpf, 0);
  const totalIrpfWithheld = nominas.reduce((s, n) => s + n.irpfWithheld, 0);
  const totalSS = nominas.reduce((s, n) => s + n.ssTotal, 0);
  const totalNetPay = nominas.reduce((s, n) => s + n.netPay, 0);
  const avgIrpfRate = totalBaseIrpf > 0 ? Math.round((totalIrpfWithheld / totalBaseIrpf) * 10000) / 100 : 0;

  const totalDividends = investments.reduce((s, i) => s + i.dividends, 0);
  const totalCapitalGains = investments.reduce((s, i) => s + i.realizedGains, 0);
  const totalCapitalLosses = investments.reduce((s, i) => s + i.realizedLosses, 0);
  const totalInvestmentWithheld = investments.reduce((s, i) => s + i.withheldTax, 0);

  // Verify certificado vs nominas
  let verification: EsTaxOverview["verification"] = null;
  if (certificado && nominas.length > 0) {
    const TOLERANCE = 1;
    const grossMatch = Math.abs(totalGross - certificado.dinerariasIntegro) < TOLERANCE;
    const retencionesMatch = Math.abs(totalIrpfWithheld - certificado.dinerariasRetenciones) < TOLERANCE;
    const ssMatch = Math.abs(totalSS - certificado.gastosDeducibles) < TOLERANCE;
    verification = {
      hasCertificado: true, grossMatch, retencionesMatch, ssMatch,
      nominaGross: totalGross, certGross: certificado.dinerariasIntegro,
      nominaRetenciones: totalIrpfWithheld, certRetenciones: certificado.dinerariasRetenciones,
      nominaSS: totalSS, certSS: certificado.gastosDeducibles,
    };
  }

  // Calculate IRPF if we have nomina data
  let irpfComparison: IrpfComparison | null = null;
  if (nominas.length > 0) {
    const input: IrpfInput = {
      year: targetYear,
      grossIncome: totalBaseIrpf,
      ssContributions: totalSS,
      irpfWithheld: totalIrpfWithheld,
      comunidad: "ANDALUCIA",
      situation: 2,
      childrenBirthYears: [2013, 2022],
      spouseIncome: 0,
      investmentIncome: investments.length > 0 ? {
        dividends: totalDividends,
        interestIncome: investments.reduce((s, i) => s + i.interestIncome, 0),
        capitalGains: totalCapitalGains,
        capitalLosses: totalCapitalLosses,
        withheldTax: totalInvestmentWithheld,
      } : undefined,
    };
    irpfComparison = calculateIrpf(input);
  }

  // Build document summaries using cached parsed data
  const documents: EsDocumentSummary[] = docs.map(doc => {
    let summary = "";
    const cached = parsedCache.get(doc.id);
    if (doc.docType === "NOMINA" && cached) {
      const p = cached as ParsedNomina;
      summary = `Gross ${p.grossPay.toFixed(2)} EUR, IRPF ${p.irpfWithheld.toFixed(2)} EUR (${p.irpfPct}%), Net ${p.netPay.toFixed(2)} EUR`;
    } else if (doc.docType === "CERTIFICADO_RETENCIONES" && cached) {
      const c = cached as ParsedCertificado;
      summary = `Gross ${c.dinerariasIntegro.toFixed(2)} EUR, Retenciones ${c.dinerariasRetenciones.toFixed(2)} EUR (${c.effectiveRate}%), SS ${c.gastosDeducibles.toFixed(2)} EUR`;
    } else if (doc.docType === "BROKER_REPORT" && cached) {
      const r = cached as BrokerTaxReport & { etorroTaxData?: { modelo720?: { categoryC?: { totalValuation: number }; categoryV?: { totalValuation: number } }; modelo721?: { totalValuation: number } } };
      const parts: string[] = [];
      // eToro tax report (Modelo 720/721) has structured data
      if (r.etorroTaxData) {
        const m720c = r.etorroTaxData.modelo720?.categoryC?.totalValuation ?? 0;
        const m720v = r.etorroTaxData.modelo720?.categoryV?.totalValuation ?? 0;
        const m721 = r.etorroTaxData.modelo721?.totalValuation ?? 0;
        if (m720c > 0) parts.push(`M720 Cash: ${m720c.toFixed(2)} EUR`);
        if (m720v > 0) parts.push(`M720 Shares: ${m720v.toFixed(2)} EUR`);
        if (m721 > 0) parts.push(`M721 Crypto: ${m721.toFixed(2)} EUR`);
      } else {
        if (r.dividends > 0) parts.push(`Div ${r.dividends.toFixed(2)} EUR`);
        if (r.realizedGains > 0) parts.push(`Gains ${r.realizedGains.toFixed(2)} EUR`);
        if (r.realizedLosses > 0) parts.push(`Losses -${r.realizedLosses.toFixed(2)} EUR`);
        if (r.withheldTax > 0) parts.push(`WHT ${r.withheldTax.toFixed(2)} EUR`);
      }
      if (r.interestIncome > 0 && !r.etorroTaxData) parts.push(`Interest ${r.interestIncome.toFixed(2)} EUR`);
      summary = parts.join(", ") || "No data";
    }
    return {
      id: doc.id,
      docType: doc.docType,
      source: doc.source,
      period: doc.period,
      year: doc.year,
      month: doc.month,
      fileName: doc.fileName,
      createdAt: doc.createdAt.toISOString(),
      summary,
    };
  });

  return {
    year: targetYear,
    nominas,
    totalGross,
    totalBaseIrpf,
    totalIrpfWithheld,
    totalSS,
    totalNetPay,
    avgIrpfRate,
    monthsUploaded: nominas.length,
    investments,
    totalDividends,
    totalCapitalGains,
    totalCapitalLosses,
    totalInvestmentWithheld,
    certificado,
    verification,
    irpfComparison,
    documents,
  };
}

// ─── Save/Load Simulation ───

export async function saveIrpfSimulation(
  year: number,
  regime: string,
  input: IrpfInput,
  result: Record<string, unknown>,
) {
  const user = await requireUser();
  return prisma.taxSimulation.upsert({
    where: {
      userId_year_regime: { userId: user.id, year, regime },
    },
    create: {
      userId: user.id,
      year,
      regime,
      inputJson: JSON.stringify(input),
      resultJson: JSON.stringify(result),
      comunidad: input.comunidad,
    },
    update: {
      inputJson: JSON.stringify(input),
      resultJson: JSON.stringify(result),
      comunidad: input.comunidad,
    },
  });
}
