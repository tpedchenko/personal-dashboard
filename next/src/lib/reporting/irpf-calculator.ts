/**
 * Spanish IRPF (Income Tax) calculator for 2025.
 * Supports Individual and Conjunta (joint) declarations.
 * Comunidad Autónoma: Andalucía.
 */

// ─── Tax brackets ────────────────────────────────────────────────────────────

interface TaxBracket {
  upTo: number;
  rate: number;
}

// Escala General Estatal 2025
const ESCALA_ESTATAL: TaxBracket[] = [
  { upTo: 12450, rate: 0.095 },
  { upTo: 20200, rate: 0.12 },
  { upTo: 35200, rate: 0.15 },
  { upTo: 60000, rate: 0.185 },
  { upTo: 300000, rate: 0.225 },
  { upTo: Infinity, rate: 0.245 },
];

// Escala Autonómica Andalucía 2025
const ESCALA_ANDALUCIA: TaxBracket[] = [
  { upTo: 13000, rate: 0.095 },
  { upTo: 21000, rate: 0.12 },
  { upTo: 28000, rate: 0.15 },
  { upTo: 40000, rate: 0.155 },
  { upTo: 60000, rate: 0.19 },
  { upTo: 120000, rate: 0.235 },
  { upTo: Infinity, rate: 0.255 },
];

// Escala del Ahorro 2025 (estatal + autonómica combined)
const ESCALA_AHORRO: TaxBracket[] = [
  { upTo: 6000, rate: 0.19 },
  { upTo: 50000, rate: 0.21 },
  { upTo: 200000, rate: 0.23 },
  { upTo: 300000, rate: 0.27 },
  { upTo: Infinity, rate: 0.28 },
];

function applyBrackets(base: number, brackets: TaxBracket[]): number {
  if (base <= 0) return 0;
  let tax = 0;
  let prev = 0;
  for (const bracket of brackets) {
    const taxableInBracket = Math.min(base, bracket.upTo) - prev;
    if (taxableInBracket <= 0) break;
    tax += taxableInBracket * bracket.rate;
    prev = bracket.upTo;
    if (base <= bracket.upTo) break;
  }
  return Math.round(tax * 100) / 100;
}

// ─── Reducción por rendimientos del trabajo ──────────────────────────────────

function reduccionRendimientosTrabajo(rendimientosNetos: number): number {
  if (rendimientosNetos <= 14047.5) return 6498;
  if (rendimientosNetos <= 19747.5) {
    return 6498 - 1.14 * (rendimientosNetos - 14047.5);
  }
  return 0;
}

// ─── Input/Output types ──────────────────────────────────────────────────────

export interface InvestmentIncome {
  dividends: number;
  interestIncome: number;
  capitalGains: number;
  capitalLosses: number;
  withheldTax: number;
}

export interface IrpfInput {
  year: number;
  grossIncome: number;
  ssContributions: number;
  irpfWithheld: number;
  otherDeductions?: number; // cuotas sindicales, etc.
  comunidad: string;
  situation: number; // 1, 2, or 3
  childrenBirthYears: number[];
  spouseIncome?: number; // for conjunta — spouse's income
  investmentIncome?: InvestmentIncome;
}

export interface IrpfResult {
  regime: "INDIVIDUAL" | "CONJUNTA";
  // Rendimientos del trabajo
  rendimientosIntegros: number;
  gastosDeducibles: number;
  rendimientosNetos: number;
  reduccionRendimientos: number;
  // Base imponible
  baseImponibleGeneral: number;
  baseImponibleAhorro: number;
  // Reducciones
  reduccionesPersonales: number;
  baseLiquidableGeneral: number;
  baseLiquidableAhorro: number;
  // Cuotas
  cuotaEstatal: number;
  cuotaAutonomica: number;
  cuotaAhorro: number;
  cuotaIntegra: number;
  // Mínimo personal y familiar
  minimoPersonal: number;
  minimoHijos: number;
  minimoTotal: number;
  cuotaMinimoEstatal: number;
  cuotaMinimoAutonomica: number;
  // Result
  cuotaLiquida: number;
  retencionesAplicadas: number;
  resultadoDeclaracion: number; // positive = pay, negative = refund
  tipoEfectivo: number; // effective rate %
}

export interface IrpfComparison {
  individual: IrpfResult;
  conjunta: IrpfResult;
  recommendation: "INDIVIDUAL" | "CONJUNTA";
  savingsAmount: number;
}

// ─── Calculator ──────────────────────────────────────────────────────────────

function calculateForRegime(
  input: IrpfInput,
  regime: "INDIVIDUAL" | "CONJUNTA"
): IrpfResult {
  const escalaAutonomica = ESCALA_ANDALUCIA; // TODO: support other comunidades

  // 1. Rendimientos del trabajo
  const rendimientosIntegros = input.grossIncome + (regime === "CONJUNTA" ? (input.spouseIncome || 0) : 0);
  const gastosDeducibles = input.ssContributions + (input.otherDeductions || 0);
  const rendimientosNetos = Math.max(rendimientosIntegros - gastosDeducibles, 0);
  const reduccionRendimientos = reduccionRendimientosTrabajo(rendimientosNetos);

  // 2. Base imponible general
  const baseImponibleGeneral = Math.max(rendimientosNetos - reduccionRendimientos, 0);

  // 3. Base imponible del ahorro (investment income)
  let baseImponibleAhorro = 0;
  if (input.investmentIncome) {
    const inv = input.investmentIncome;
    const netCapitalGains = Math.max(inv.capitalGains - inv.capitalLosses, 0);
    // Compensation: losses can offset up to 25% of gains
    const compensation = Math.min(
      Math.abs(Math.min(inv.capitalGains - inv.capitalLosses, 0)),
      (inv.dividends + inv.interestIncome) * 0.25
    );
    baseImponibleAhorro = Math.max(
      inv.dividends + inv.interestIncome + netCapitalGains - compensation,
      0
    );
  }

  // 4. Reducciones personales
  let reduccionesPersonales = 0;
  if (regime === "CONJUNTA") {
    reduccionesPersonales += 3400; // reducción por tributación conjunta
  }

  // 5. Base liquidable
  const baseLiquidableGeneral = Math.max(baseImponibleGeneral - reduccionesPersonales, 0);
  const baseLiquidableAhorro = baseImponibleAhorro;

  // 6. Cuota íntegra (before mínimo)
  const cuotaEstatalBruta = applyBrackets(baseLiquidableGeneral, ESCALA_ESTATAL);
  const cuotaAutonomicaBruta = applyBrackets(baseLiquidableGeneral, escalaAutonomica);
  const cuotaAhorro = applyBrackets(baseLiquidableAhorro, ESCALA_AHORRO);

  // 7. Mínimo personal y familiar
  let minimoPersonal = 5550;
  if (regime === "CONJUNTA") minimoPersonal = 5550; // same in conjunta

  let minimoHijos = 0;
  const currentYear = input.year;
  const sortedChildren = [...input.childrenBirthYears].sort((a, b) => b - a); // youngest first for ordering
  for (let i = 0; i < sortedChildren.length; i++) {
    const childAge = currentYear - sortedChildren[i];
    if (childAge < 0 || childAge > 25) continue;
    // Amount depends on order
    const childOrder = i + 1;
    let amount = 0;
    if (childOrder === 1) amount = 2400;
    else if (childOrder === 2) amount = 2700;
    else if (childOrder === 3) amount = 4000;
    else amount = 4500;
    // Extra for children under 3
    if (childAge < 3) amount += 2800;
    minimoHijos += amount;
  }

  const minimoTotal = minimoPersonal + minimoHijos;

  // Apply mínimo at lowest bracket rates
  const cuotaMinimoEstatal = applyBrackets(minimoTotal, ESCALA_ESTATAL);
  const cuotaMinimoAutonomica = applyBrackets(minimoTotal, escalaAutonomica);

  // 8. Cuota íntegra after mínimo
  const cuotaEstatal = Math.max(cuotaEstatalBruta - cuotaMinimoEstatal, 0);
  const cuotaAutonomica = Math.max(cuotaAutonomicaBruta - cuotaMinimoAutonomica, 0);
  const cuotaIntegra = cuotaEstatal + cuotaAutonomica + cuotaAhorro;

  // 9. Cuota líquida (after deducciones)
  const cuotaLiquida = Math.max(cuotaIntegra, 0);

  // 10. Retenciones ya aplicadas
  const retencionesAplicadas = input.irpfWithheld + (input.investmentIncome?.withheldTax || 0);

  // 11. Resultado
  const resultadoDeclaracion = Math.round((cuotaLiquida - retencionesAplicadas) * 100) / 100;
  const tipoEfectivo = rendimientosIntegros > 0
    ? Math.round((cuotaLiquida / rendimientosIntegros) * 10000) / 100
    : 0;

  return {
    regime,
    rendimientosIntegros,
    gastosDeducibles,
    rendimientosNetos,
    reduccionRendimientos,
    baseImponibleGeneral,
    baseImponibleAhorro,
    reduccionesPersonales,
    baseLiquidableGeneral,
    baseLiquidableAhorro,
    cuotaEstatal,
    cuotaAutonomica,
    cuotaAhorro,
    cuotaIntegra,
    minimoPersonal,
    minimoHijos,
    minimoTotal,
    cuotaMinimoEstatal,
    cuotaMinimoAutonomica,
    cuotaLiquida,
    retencionesAplicadas,
    resultadoDeclaracion,
    tipoEfectivo,
  };
}

export function calculateIrpf(input: IrpfInput): IrpfComparison {
  const individual = calculateForRegime(input, "INDIVIDUAL");
  const conjunta = calculateForRegime(input, "CONJUNTA");

  // Recommendation: whichever has lower resultado (or bigger refund)
  const recommendation = conjunta.resultadoDeclaracion <= individual.resultadoDeclaracion
    ? "CONJUNTA" : "INDIVIDUAL";
  const savingsAmount = Math.round(
    (individual.resultadoDeclaracion - conjunta.resultadoDeclaracion) * 100
  ) / 100;

  return { individual, conjunta, recommendation, savingsAmount };
}
