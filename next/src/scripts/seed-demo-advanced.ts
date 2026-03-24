/**
 * Seed script: generates demo data for the "demo@example.com" user.
 *
 * Run: npx tsx src/scripts/seed-demo-advanced.ts
 *
 * Uses upsert with unique constraints so re-runs are safe (no duplicates).
 */

import { PrismaClient } from "../generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

import type { ParsedNomina, NominaComponent } from "../lib/reporting/nomina-parser";
import type { ParsedCertificado } from "../lib/reporting/certificado-parser";
import type { BrokerTaxReport, BrokerTaxTransaction } from "../lib/reporting/broker-parsers";

const DEMO_EMAIL = "demo@example.com";

function createPrisma() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set");
  }
  const adapter = new PrismaPg({ connectionString, max: 3 });
  return new PrismaClient({ adapter });
}

const prisma = createPrisma();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// ---------------------------------------------------------------------------
// 1. Broker Positions
// ---------------------------------------------------------------------------

interface PositionSeed {
  broker: string;
  symbol: string;
  name: string;
  quantity: number;
  avgCost: number;
  marketPrice: number;
  currency: string;
  assetClass: string;
}

const POSITIONS: PositionSeed[] = [
  // IBKR
  { broker: "IBKR", symbol: "AAPL",  name: "Apple Inc.",            quantity: 50,  avgCost: 150,   marketPrice: 158.42,  currency: "USD", assetClass: "STK" },
  { broker: "IBKR", symbol: "MSFT",  name: "Microsoft Corp.",       quantity: 30,  avgCost: 380,   marketPrice: 395.10,  currency: "USD", assetClass: "STK" },
  { broker: "IBKR", symbol: "NVDA",  name: "NVIDIA Corp.",          quantity: 20,  avgCost: 850,   marketPrice: 912.35,  currency: "USD", assetClass: "STK" },
  { broker: "IBKR", symbol: "VOO",   name: "Vanguard S&P 500 ETF", quantity: 15,  avgCost: 480,   marketPrice: 497.80,  currency: "USD", assetClass: "ETF" },
  { broker: "IBKR", symbol: "AMZN",  name: "Amazon.com Inc.",       quantity: 10,  avgCost: 178,   marketPrice: 185.60,  currency: "USD", assetClass: "STK" },
  // TRADING212
  { broker: "TRADING212", symbol: "VWCE", name: "Vanguard FTSE All-World UCITS ETF", quantity: 100, avgCost: 105, marketPrice: 108.25, currency: "EUR", assetClass: "ETF" },
  { broker: "TRADING212", symbol: "IUSA", name: "iShares Core S&P 500 UCITS ETF",    quantity: 200, avgCost: 42,  marketPrice: 43.80,  currency: "EUR", assetClass: "ETF" },
  { broker: "TRADING212", symbol: "CSPX", name: "iShares Core S&P 500 UCITS ETF (Acc)", quantity: 25, avgCost: 520, marketPrice: 534.50, currency: "EUR", assetClass: "ETF" },
];

async function seedPositions(userId: number) {
  console.log("  Seeding BrokerPositions...");
  for (const p of POSITIONS) {
    const marketValue = round2(p.quantity * p.marketPrice);
    const unrealizedPnl = round2(p.quantity * (p.marketPrice - p.avgCost));
    await prisma.brokerPosition.upsert({
      where: {
        userId_broker_symbol: { userId, broker: p.broker, symbol: p.symbol },
      },
      update: {
        name: p.name,
        quantity: p.quantity,
        avgCost: p.avgCost,
        marketPrice: p.marketPrice,
        marketValue,
        unrealizedPnl,
        realizedPnl: 0,
        currency: p.currency,
        assetClass: p.assetClass,
      },
      create: {
        userId,
        broker: p.broker,
        symbol: p.symbol,
        name: p.name,
        quantity: p.quantity,
        avgCost: p.avgCost,
        marketPrice: p.marketPrice,
        marketValue,
        unrealizedPnl,
        realizedPnl: 0,
        currency: p.currency,
        assetClass: p.assetClass,
      },
    });
  }
  console.log(`    -> ${POSITIONS.length} positions upserted`);
}

// ---------------------------------------------------------------------------
// 2. Broker Account Summaries
// ---------------------------------------------------------------------------

interface AccountSummarySeed {
  broker: string;
  accountId: string;
  netLiquidation: number;
  totalCashValue: number;
  grossPositionValue: number;
  unrealizedPnl: number;
  realizedPnl: number;
  currency: string;
}

const ACCOUNT_SUMMARIES: AccountSummarySeed[] = [
  {
    broker: "IBKR",
    accountId: "DEMO-IBKR-001",
    netLiquidation: 45000,
    totalCashValue: 5000,
    grossPositionValue: 40000,
    unrealizedPnl: 3200,
    realizedPnl: 850,
    currency: "USD",
  },
  {
    broker: "TRADING212",
    accountId: "DEMO-T212-001",
    netLiquidation: 18000,
    totalCashValue: 1500,
    grossPositionValue: 16500,
    unrealizedPnl: 850,
    realizedPnl: 120,
    currency: "EUR",
  },
];

async function seedAccountSummaries(userId: number) {
  console.log("  Seeding BrokerAccountSummaries...");
  for (const a of ACCOUNT_SUMMARIES) {
    await prisma.brokerAccountSummary.upsert({
      where: {
        userId_broker_accountId: {
          userId,
          broker: a.broker,
          accountId: a.accountId,
        },
      },
      update: {
        netLiquidation: a.netLiquidation,
        totalCashValue: a.totalCashValue,
        grossPositionValue: a.grossPositionValue,
        unrealizedPnl: a.unrealizedPnl,
        realizedPnl: a.realizedPnl,
        currency: a.currency,
      },
      create: {
        userId,
        broker: a.broker,
        accountId: a.accountId,
        netLiquidation: a.netLiquidation,
        totalCashValue: a.totalCashValue,
        grossPositionValue: a.grossPositionValue,
        unrealizedPnl: a.unrealizedPnl,
        realizedPnl: a.realizedPnl,
        currency: a.currency,
      },
    });
  }
  console.log(`    -> ${ACCOUNT_SUMMARIES.length} account summaries upserted`);
}

// ---------------------------------------------------------------------------
// 3. Trading Strategies
// ---------------------------------------------------------------------------

interface StrategySeed {
  name: string;
  strategyFile: string;
  exchange: string;
  stakeAmount: string;
  maxOpenTrades: number;
  stoploss: number;
  dryRun: boolean;
  isActive: boolean;
}

const STRATEGIES: StrategySeed[] = [
  {
    name: "Conservative DCA",
    strategyFile: "DCAStrategy",
    exchange: "kraken",
    stakeAmount: "50",
    maxOpenTrades: 3,
    stoploss: -0.05,
    dryRun: true,
    isActive: false,
  },
  {
    name: "Trend Follow Live",
    strategyFile: "TrendFollowStrategy",
    exchange: "kraken",
    stakeAmount: "100",
    maxOpenTrades: 5,
    stoploss: -0.10,
    dryRun: false,
    isActive: true,
  },
  {
    name: "Grid Scalper",
    strategyFile: "GridStrategy",
    exchange: "kraken",
    stakeAmount: "25",
    maxOpenTrades: 2,
    stoploss: -0.06,
    dryRun: true,
    isActive: false,
  },
];

async function seedStrategies(userId: number) {
  console.log("  Seeding TradingStrategies...");
  for (const s of STRATEGIES) {
    await prisma.tradingStrategy.upsert({
      where: {
        userId_name: { userId, name: s.name },
      },
      update: {
        strategyFile: s.strategyFile,
        exchange: s.exchange,
        stakeAmount: s.stakeAmount,
        maxOpenTrades: s.maxOpenTrades,
        stoploss: s.stoploss,
        dryRun: s.dryRun,
        isActive: s.isActive,
      },
      create: {
        userId,
        name: s.name,
        strategyFile: s.strategyFile,
        exchange: s.exchange,
        stakeAmount: s.stakeAmount,
        maxOpenTrades: s.maxOpenTrades,
        stoploss: s.stoploss,
        dryRun: s.dryRun,
        isActive: s.isActive,
      },
    });
  }
  console.log(`    -> ${STRATEGIES.length} strategies upserted`);
}

// ---------------------------------------------------------------------------
// 4. Tax Documents — Nominas (12 months of 2025)
// ---------------------------------------------------------------------------

function buildNomina(month: number, year: number = 2025): ParsedNomina {
  const isBonus = month === 6 || month === 12;
  // Salary grows ~5% per year from 2024 base
  const yearFactor = 1 + (year - 2024) * 0.05;
  const baseSalary = round2(2400 * yearFactor);
  const plusConvenio = 350;
  const antiguedad = 120;
  const absorbible = 180;
  const ppExtra = 500;
  // Slight monthly variation (pseudo-random but deterministic)
  const jitter = (month * 7) % 13 - 6; // -6..+6
  const bonus = isBonus ? 2000 + jitter * 10 : 0;
  const grossPay = round2(baseSalary + plusConvenio + antiguedad + absorbible + ppExtra + bonus + jitter);

  const irpfPct = isBonus ? 22 : 18;
  const baseIrpf = grossPay;
  const irpfWithheld = round2(grossPay * irpfPct / 100);

  const baseSS = grossPay;
  const ssContComunes = round2(grossPay * 0.047);
  const ssMei = round2(grossPay * 0.001);
  const ssDesempleo = round2(grossPay * 0.0155);
  const ssFormacion = round2(grossPay * 0.001);
  const ssSolidaridad = round2(grossPay * 0.001);
  const ssTotal = round2(ssContComunes + ssMei + ssDesempleo + ssFormacion + ssSolidaridad);

  const chequeRestaurante = 110;
  const chequeTransporte = 45;
  const seguroMedico = 35;

  const netPay = round2(grossPay - irpfWithheld - ssTotal - chequeRestaurante - chequeTransporte - seguroMedico);
  const costEmpresa = round2(grossPay * 1.32);

  const period = `${year}-${String(month).padStart(2, "0")}`;

  const components: NominaComponent[] = [
    { code: "1",   name: "Salario Base",     amount: baseSalary },
    { code: "2",   name: "Plus Convenio",    amount: plusConvenio },
    { code: "4",   name: "Antigüedad",       amount: antiguedad },
    { code: "31",  name: "Absorbible",       amount: absorbible },
    { code: "34",  name: "P.P.P. Extra",     amount: ppExtra },
  ];
  if (bonus > 0) {
    components.push({ code: "125", name: "Bonus", amount: bonus });
  }
  components.push(
    { code: "304", name: "Cheque Restaurante", amount: chequeRestaurante },
    { code: "305", name: "Cheque Transporte",  amount: chequeTransporte },
    { code: "128", name: "Seguro médico",      amount: seguroMedico },
  );

  return {
    employer: "DEMO CORP SL",
    employerNif: "B99999999",
    workerName: "DEMO USER",
    workerNie: "X9999999A",
    period,
    year,
    month,
    baseSalary,
    plusConvenio,
    antiguedad,
    absorbible,
    ppExtra,
    bonus,
    grossPay,
    baseIrpf,
    irpfPct,
    irpfWithheld,
    baseSS,
    ssContComunes,
    ssMei,
    ssDesempleo,
    ssFormacion,
    ssSolidaridad,
    ssTotal,
    chequeRestaurante,
    chequeTransporte,
    seguroMedico,
    netPay,
    costEmpresa,
    components,
  };
}

async function seedNominas(userId: number) {
  const years = [2024, 2025];
  console.log(`  Seeding TaxDocuments — Nominas (${years.length} years × 12 months)...`);
  for (const year of years) {
    for (let m = 1; m <= 12; m++) {
      const nomina = buildNomina(m, year);
      const period = `${year}-${String(m).padStart(2, "0")}`;
      await prisma.taxDocument.upsert({
        where: {
          userId_country_docType_period_source: {
            userId,
            country: "ES",
            docType: "NOMINA",
            period,
            source: "DEMO CORP SL",
          },
        },
        update: {
          year,
          month: m,
          fileName: `nomina_demo_${year}_${String(m).padStart(2, "0")}.pdf`,
          parsedJson: JSON.stringify(nomina),
        },
        create: {
          userId,
          country: "ES",
          docType: "NOMINA",
          source: "DEMO CORP SL",
          period,
          year,
          month: m,
          fileName: `nomina_demo_${year}_${String(m).padStart(2, "0")}.pdf`,
          parsedJson: JSON.stringify(nomina),
        },
      });
    }
  }
  console.log(`    -> ${years.length * 12} nominas upserted`);
}

// ---------------------------------------------------------------------------
// 5. Tax Document — Certificado de Retenciones
// ---------------------------------------------------------------------------

async function seedCertificado(userId: number) {
  const years = [2024, 2025];
  console.log(`  Seeding TaxDocuments — Certificados (${years.length} years)...`);

  for (const year of years) {
    let totalGross = 0;
    let totalIrpf = 0;
    let totalSS = 0;
    for (let m = 1; m <= 12; m++) {
      const n = buildNomina(m, year);
      totalGross += n.grossPay;
      totalIrpf += n.irpfWithheld;
      totalSS += n.ssTotal;
    }
    totalGross = round2(totalGross);
    totalIrpf = round2(totalIrpf);
    totalSS = round2(totalSS);

    const cert: ParsedCertificado = {
      year,
      workerNie: "X9999999A",
      workerName: "DEMO USER",
      employerNif: "B99999999",
      employerName: "DEMO CORP SL",
      dinerariasIntegro: totalGross,
      dinerariasRetenciones: totalIrpf,
      especieValoracion: 35 * 12,
      especieIngresos: 10,
      especieRepercutidos: 32,
      gastosDeducibles: totalSS,
      dietas: 0,
      rentasExentas: 0,
      cuotaSindical: 0,
      aportPensiones: 0,
      totalGross: round2(totalGross + 35 * 12),
      totalRetenciones: round2(totalIrpf + 10),
      effectiveRate: round2(((totalIrpf + 10) / (totalGross + 35 * 12)) * 100),
    };

    await prisma.taxDocument.upsert({
      where: {
        userId_country_docType_period_source: {
          userId,
          country: "ES",
          docType: "CERTIFICADO_RETENCIONES",
          period: `${year}-ANNUAL`,
          source: "DEMO CORP SL",
        },
      },
      update: {
        year,
        month: null,
        fileName: `certificado_retenciones_demo_${year}.pdf`,
        parsedJson: JSON.stringify(cert),
      },
      create: {
        userId,
        country: "ES",
        docType: "CERTIFICADO_RETENCIONES",
        source: "DEMO CORP SL",
        period: `${year}-ANNUAL`,
        year,
        month: null,
        fileName: `certificado_retenciones_demo_${year}.pdf`,
        parsedJson: JSON.stringify(cert),
      },
    });
  }
  console.log(`    -> ${years.length} certificados upserted`);
}

// ---------------------------------------------------------------------------
// 6. Tax Documents — Broker Reports
// ---------------------------------------------------------------------------

async function seedBrokerReports(userId: number) {
  const years = [2024, 2025];
  console.log(`  Seeding TaxDocuments — Broker Reports (${years.length} years)...`);

  for (const year of years) {
    const yearFactor = 1 + (year - 2024) * 0.15; // 15% growth per year

    const ibkrReport: BrokerTaxReport = {
      broker: "IBKR",
      year,
      dividends: round2(390 * yearFactor),
      interestIncome: round2(70 * yearFactor),
      realizedGains: round2(950 * yearFactor),
      realizedLosses: round2(250 * yearFactor),
      withheldTax: round2(58 * yearFactor),
      fees: round2(38 * yearFactor),
      transactions: [
        { date: `${year}-03-15`, type: "DIVIDEND", symbol: "AAPL", description: "Apple Inc. quarterly dividend", amount: round2(97 * yearFactor), currency: "USD", withheldTax: round2(14.5 * yearFactor) },
        { date: `${year}-06-14`, type: "DIVIDEND", symbol: "AAPL", description: "Apple Inc. quarterly dividend", amount: round2(97 * yearFactor), currency: "USD", withheldTax: round2(14.5 * yearFactor) },
        { date: `${year}-09-13`, type: "DIVIDEND", symbol: "MSFT", description: "Microsoft Corp. quarterly dividend", amount: round2(98 * yearFactor), currency: "USD", withheldTax: round2(14.7 * yearFactor) },
        { date: `${year}-12-14`, type: "DIVIDEND", symbol: "VOO",  description: "Vanguard S&P 500 ETF distribution", amount: round2(98 * yearFactor), currency: "USD", withheldTax: round2(14.3 * yearFactor) },
        { date: `${year}-08-20`, type: "CAPITAL_GAIN", symbol: "TSLA", description: "Tesla Inc. — sold 5 shares", amount: round2(950 * yearFactor), currency: "USD", withheldTax: 0 },
        { date: `${year}-10-05`, type: "CAPITAL_LOSS", symbol: "BABA", description: "Alibaba Group — sold 10 shares", amount: round2(250 * yearFactor), currency: "USD", withheldTax: 0 },
      ],
    };

    await prisma.taxDocument.upsert({
      where: { userId_country_docType_period_source: { userId, country: "ES", docType: "BROKER_REPORT", period: `${year}-ANNUAL`, source: "IBKR" } },
      update: { year, month: null, fileName: `ibkr_annual_report_${year}.csv`, parsedJson: JSON.stringify(ibkrReport) },
      create: { userId, country: "ES", docType: "BROKER_REPORT", source: "IBKR", period: `${year}-ANNUAL`, year, month: null, fileName: `ibkr_annual_report_${year}.csv`, parsedJson: JSON.stringify(ibkrReport) },
    });

    const t212Report: BrokerTaxReport = {
      broker: "TRADING212",
      year,
      dividends: round2(155 * yearFactor),
      interestIncome: round2(18 * yearFactor),
      realizedGains: 0,
      realizedLosses: 0,
      withheldTax: 0,
      fees: 0,
      transactions: [
        { date: `${year}-04-10`, type: "DIVIDEND", symbol: "VWCE", description: "Vanguard FTSE All-World dividend", amount: round2(82 * yearFactor), currency: "EUR", withheldTax: 0 },
        { date: `${year}-10-10`, type: "DIVIDEND", symbol: "IUSA", description: "iShares S&P 500 dividend", amount: round2(73 * yearFactor), currency: "EUR", withheldTax: 0 },
      ],
    };

    await prisma.taxDocument.upsert({
      where: { userId_country_docType_period_source: { userId, country: "ES", docType: "BROKER_REPORT", period: `${year}-ANNUAL`, source: "TRADING212" } },
      update: { year, month: null, fileName: `trading212_annual_report_${year}.csv`, parsedJson: JSON.stringify(t212Report) },
      create: { userId, country: "ES", docType: "BROKER_REPORT", source: "TRADING212", period: `${year}-ANNUAL`, year, month: null, fileName: `trading212_annual_report_${year}.csv`, parsedJson: JSON.stringify(t212Report) },
    });
  }

  console.log(`    -> ${years.length * 2} broker reports upserted`);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log("=== Seeding demo advanced data ===\n");

  const user = await prisma.user.findFirst({ where: { email: DEMO_EMAIL } });
  if (!user) {
    console.error(`ERROR: Demo user "${DEMO_EMAIL}" not found. Enter demo mode first to create the user.`);
    process.exit(1);
  }

  const userId = user.id;
  console.log(`Found demo user: id=${userId}, email=${user.email}\n`);

  await seedPositions(userId);
  await seedAccountSummaries(userId);
  await seedStrategies(userId);
  await seedNominas(userId);
  await seedCertificado(userId);
  await seedBrokerReports(userId);

  console.log("\n=== Done! All demo data seeded. ===");
}

main()
  .catch((e) => {
    console.error("Seed failed:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
