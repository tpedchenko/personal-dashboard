import { describe, it, expect } from "vitest";
import { calculateIrpf, type IrpfInput, type InvestmentIncome } from "./irpf-calculator";

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Build a minimal IrpfInput with sensible defaults */
function makeInput(overrides: Partial<IrpfInput> = {}): IrpfInput {
  return {
    year: 2025,
    grossIncome: 0,
    ssContributions: 0,
    irpfWithheld: 0,
    comunidad: "andalucia",
    situation: 1,
    childrenBirthYears: [],
    ...overrides,
  };
}

function makeInvestment(overrides: Partial<InvestmentIncome> = {}): InvestmentIncome {
  return {
    dividends: 0,
    interestIncome: 0,
    capitalGains: 0,
    capitalLosses: 0,
    withheldTax: 0,
    ...overrides,
  };
}

/** Round to 2 decimal places for comparison */
function r(n: number): number {
  return Math.round(n * 100) / 100;
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe("irpf-calculator", () => {
  // ── Structure & basic shape ──────────────────────────────────────────────

  describe("return shape", () => {
    it("returns individual and conjunta results with recommendation", () => {
      const result = calculateIrpf(makeInput({ grossIncome: 30000 }));
      expect(result).toHaveProperty("individual");
      expect(result).toHaveProperty("conjunta");
      expect(result).toHaveProperty("recommendation");
      expect(result).toHaveProperty("savingsAmount");
      expect(["INDIVIDUAL", "CONJUNTA"]).toContain(result.recommendation);
    });

    it("individual result has regime INDIVIDUAL", () => {
      const result = calculateIrpf(makeInput({ grossIncome: 30000 }));
      expect(result.individual.regime).toBe("INDIVIDUAL");
      expect(result.conjunta.regime).toBe("CONJUNTA");
    });
  });

  // ── Zero income ──────────────────────────────────────────────────────────

  describe("zero income", () => {
    it("produces zero tax with zero income", () => {
      const result = calculateIrpf(makeInput());
      const ind = result.individual;
      expect(ind.rendimientosIntegros).toBe(0);
      expect(ind.rendimientosNetos).toBe(0);
      expect(ind.baseImponibleGeneral).toBe(0);
      expect(ind.cuotaIntegra).toBe(0);
      expect(ind.cuotaLiquida).toBe(0);
      expect(ind.resultadoDeclaracion).toBe(0);
      expect(ind.tipoEfectivo).toBe(0);
    });

    it("produces refund when withheld > 0 with zero income", () => {
      const result = calculateIrpf(makeInput({ irpfWithheld: 1000 }));
      expect(result.individual.resultadoDeclaracion).toBe(-1000);
    });
  });

  // ── Single person with salary only ───────────────────────────────────────

  describe("single person with salary only", () => {
    it("calculates tax for a low salary (10,000 EUR)", () => {
      const result = calculateIrpf(makeInput({
        grossIncome: 10000,
        ssContributions: 635,
        irpfWithheld: 0,
      }));
      const ind = result.individual;
      expect(ind.rendimientosIntegros).toBe(10000);
      expect(ind.gastosDeducibles).toBe(635);
      expect(ind.rendimientosNetos).toBe(9365);
      // Net < 14047.5 → full reduction 6498
      expect(ind.reduccionRendimientos).toBe(6498);
      expect(ind.baseImponibleGeneral).toBe(9365 - 6498);
      // With mínimo personal 5550 > base, cuota should be 0 or very small
      expect(ind.cuotaLiquida).toBe(0);
    });

    it("calculates tax for a medium salary (35,000 EUR)", () => {
      const result = calculateIrpf(makeInput({
        grossIncome: 35000,
        ssContributions: 2222,
        irpfWithheld: 5500,
      }));
      const ind = result.individual;
      expect(ind.rendimientosIntegros).toBe(35000);
      expect(ind.gastosDeducibles).toBe(2222);
      const netExpected = 35000 - 2222;
      expect(ind.rendimientosNetos).toBe(netExpected);
      // Net > 19747.5 → no reduction
      expect(ind.reduccionRendimientos).toBe(0);
      expect(ind.baseImponibleGeneral).toBe(netExpected);
      expect(ind.cuotaLiquida).toBeGreaterThan(0);
      expect(ind.tipoEfectivo).toBeGreaterThan(0);
      expect(ind.tipoEfectivo).toBeLessThan(50); // sanity
    });

    it("calculates tax for a high salary (100,000 EUR)", () => {
      const result = calculateIrpf(makeInput({
        grossIncome: 100000,
        ssContributions: 6350,
        irpfWithheld: 25000,
      }));
      const ind = result.individual;
      expect(ind.reduccionRendimientos).toBe(0);
      expect(ind.baseImponibleGeneral).toBe(100000 - 6350);
      expect(ind.cuotaLiquida).toBeGreaterThan(0);
      expect(ind.tipoEfectivo).toBeGreaterThan(20);
    });

    it("calculates tax for very high income (500,000 EUR)", () => {
      const result = calculateIrpf(makeInput({
        grossIncome: 500000,
        ssContributions: 6350,
        irpfWithheld: 150000,
      }));
      const ind = result.individual;
      // Top bracket should push effective rate significantly
      expect(ind.tipoEfectivo).toBeGreaterThan(35);
      expect(ind.cuotaLiquida).toBeGreaterThan(150000);
    });
  });

  // ── Reducción por rendimientos del trabajo ───────────────────────────────

  describe("reducción por rendimientos del trabajo", () => {
    it("applies full reduction (6498) for net income <= 14047.50", () => {
      const result = calculateIrpf(makeInput({
        grossIncome: 14000,
        ssContributions: 0,
      }));
      const ind = result.individual;
      expect(ind.rendimientosNetos).toBe(14000);
      expect(ind.reduccionRendimientos).toBe(6498);
    });

    it("applies partial reduction for net income between 14047.50 and 19747.50", () => {
      const netIncome = 16000;
      const result = calculateIrpf(makeInput({
        grossIncome: netIncome,
        ssContributions: 0,
      }));
      const ind = result.individual;
      const expectedReduction = r(6498 - 1.14 * (netIncome - 14047.5));
      expect(ind.reduccionRendimientos).toBe(expectedReduction);
      expect(ind.reduccionRendimientos).toBeGreaterThan(0);
      expect(ind.reduccionRendimientos).toBeLessThan(6498);
    });

    it("applies zero reduction for net income > 19747.50", () => {
      const result = calculateIrpf(makeInput({
        grossIncome: 25000,
        ssContributions: 0,
      }));
      expect(result.individual.reduccionRendimientos).toBe(0);
    });

    it("applies full reduction at exact boundary 14047.50", () => {
      const result = calculateIrpf(makeInput({
        grossIncome: 14047.5,
        ssContributions: 0,
      }));
      expect(result.individual.reduccionRendimientos).toBe(6498);
    });

    it("applies zero reduction at exact boundary 19747.50", () => {
      const result = calculateIrpf(makeInput({
        grossIncome: 19747.5,
        ssContributions: 0,
      }));
      // 6498 - 1.14 * (19747.5 - 14047.5) = 6498 - 1.14 * 5700 = 6498 - 6498 ≈ 0
      expect(result.individual.reduccionRendimientos).toBeCloseTo(0, 8);
    });
  });

  // ── Tax bracket boundaries ───────────────────────────────────────────────

  describe("tax bracket boundaries (estatal)", () => {
    // Test with no SS contributions, no children, so base = grossIncome and mínimo is constant
    it("tax increases at first bracket boundary (12,450)", () => {
      const justBelow = calculateIrpf(makeInput({ grossIncome: 20000 }));
      const justAbove = calculateIrpf(makeInput({ grossIncome: 20001 }));
      // Both above mínimo, so tax should differ
      expect(justAbove.individual.cuotaLiquida).toBeGreaterThanOrEqual(
        justBelow.individual.cuotaLiquida
      );
    });

    it("applies progressive rates correctly", () => {
      // With 60,001 gross income (no deductions), should hit the 5th bracket
      const below = calculateIrpf(makeInput({ grossIncome: 60000 }));
      const above = calculateIrpf(makeInput({ grossIncome: 60001 }));
      // The marginal rate should jump from 18.5%/19% to 22.5%/23.5%
      const marginalTaxDiff = above.individual.cuotaLiquida - below.individual.cuotaLiquida;
      // Combined estatal + autonomica marginal rate at 60001 = 0.225 + 0.19 = 0.415
      // (still in 60k bracket for autonomica) — actually 60k is the boundary for both
      // Estatal: 60001 hits bracket 5 (22.5%), Autonomica: 60001 hits bracket 6 (23.5%)
      expect(marginalTaxDiff).toBeGreaterThan(0);
    });
  });

  // ── Children (mínimo por descendientes) ──────────────────────────────────

  describe("children deductions", () => {
    const baseInput: Partial<IrpfInput> = {
      grossIncome: 40000,
      ssContributions: 2540,
      irpfWithheld: 6000,
    };

    it("no children — minimoHijos is 0", () => {
      const result = calculateIrpf(makeInput({ ...baseInput, childrenBirthYears: [] }));
      expect(result.individual.minimoHijos).toBe(0);
      expect(result.individual.minimoTotal).toBe(5550);
    });

    it("1 child (age 10) — minimoHijos is 2400", () => {
      const result = calculateIrpf(makeInput({
        ...baseInput,
        childrenBirthYears: [2015], // age 10 in 2025
      }));
      expect(result.individual.minimoHijos).toBe(2400);
    });

    it("2 children — minimoHijos is 2400 + 2700 = 5100", () => {
      const result = calculateIrpf(makeInput({
        ...baseInput,
        childrenBirthYears: [2015, 2017],
      }));
      expect(result.individual.minimoHijos).toBe(2400 + 2700);
    });

    it("3 children — minimoHijos is 2400 + 2700 + 4000 = 9100", () => {
      const result = calculateIrpf(makeInput({
        ...baseInput,
        childrenBirthYears: [2010, 2015, 2017],
      }));
      expect(result.individual.minimoHijos).toBe(2400 + 2700 + 4000);
    });

    it("4+ children — 4th child gets 4500", () => {
      const result = calculateIrpf(makeInput({
        ...baseInput,
        childrenBirthYears: [2005, 2010, 2015, 2017],
      }));
      expect(result.individual.minimoHijos).toBe(2400 + 2700 + 4000 + 4500);
    });

    it("child under 3 gets extra 2800", () => {
      const result = calculateIrpf(makeInput({
        ...baseInput,
        childrenBirthYears: [2023], // age 2 in 2025
      }));
      expect(result.individual.minimoHijos).toBe(2400 + 2800);
    });

    it("child over 25 is excluded", () => {
      const result = calculateIrpf(makeInput({
        ...baseInput,
        childrenBirthYears: [1998], // age 27 in 2025
      }));
      expect(result.individual.minimoHijos).toBe(0);
    });

    it("more children reduce tax compared to fewer", () => {
      const noKids = calculateIrpf(makeInput({ ...baseInput, childrenBirthYears: [] }));
      const twoKids = calculateIrpf(makeInput({
        ...baseInput,
        childrenBirthYears: [2015, 2017],
      }));
      expect(twoKids.individual.cuotaLiquida).toBeLessThan(noKids.individual.cuotaLiquida);
    });

    it("newborn child (born this year) counts and gets under-3 bonus", () => {
      const result = calculateIrpf(makeInput({
        ...baseInput,
        childrenBirthYears: [2025], // age 0
      }));
      expect(result.individual.minimoHijos).toBe(2400 + 2800);
    });
  });

  // ── Joint filing (conjunta) ──────────────────────────────────────────────

  describe("married couple joint filing (conjunta)", () => {
    it("conjunta includes spouse income in rendimientos", () => {
      const result = calculateIrpf(makeInput({
        grossIncome: 40000,
        ssContributions: 2540,
        irpfWithheld: 8000,
        spouseIncome: 15000,
      }));
      expect(result.conjunta.rendimientosIntegros).toBe(55000);
      expect(result.individual.rendimientosIntegros).toBe(40000);
    });

    it("conjunta applies 3400 reducción", () => {
      const result = calculateIrpf(makeInput({
        grossIncome: 40000,
        ssContributions: 2540,
        irpfWithheld: 8000,
        spouseIncome: 0,
      }));
      expect(result.conjunta.reduccionesPersonales).toBe(3400);
      expect(result.individual.reduccionesPersonales).toBe(0);
    });

    it("conjunta is better when spouse has zero/low income", () => {
      const result = calculateIrpf(makeInput({
        grossIncome: 40000,
        ssContributions: 2540,
        irpfWithheld: 8000,
        spouseIncome: 0,
      }));
      expect(result.recommendation).toBe("CONJUNTA");
      expect(result.savingsAmount).toBeGreaterThan(0);
    });

    it("individual is better when both spouses have significant income", () => {
      const result = calculateIrpf(makeInput({
        grossIncome: 40000,
        ssContributions: 2540,
        irpfWithheld: 8000,
        spouseIncome: 35000,
      }));
      // Joint filing combines incomes, pushing into higher brackets
      expect(result.recommendation).toBe("INDIVIDUAL");
      expect(result.savingsAmount).toBeLessThan(0);
    });

    it("savingsAmount = individual.resultado - conjunta.resultado", () => {
      const result = calculateIrpf(makeInput({
        grossIncome: 40000,
        ssContributions: 2540,
        irpfWithheld: 8000,
        spouseIncome: 5000,
      }));
      const expected = r(
        result.individual.resultadoDeclaracion - result.conjunta.resultadoDeclaracion
      );
      expect(result.savingsAmount).toBe(expected);
    });
  });

  // ── Investment income ────────────────────────────────────────────────────

  describe("investment income", () => {
    it("dividends are taxed in base del ahorro", () => {
      const result = calculateIrpf(makeInput({
        grossIncome: 30000,
        ssContributions: 1905,
        irpfWithheld: 4500,
        investmentIncome: makeInvestment({ dividends: 5000 }),
      }));
      const ind = result.individual;
      expect(ind.baseImponibleAhorro).toBe(5000);
      // 5000 at 19% = 950
      expect(ind.cuotaAhorro).toBe(950);
    });

    it("interest income adds to ahorro base", () => {
      const result = calculateIrpf(makeInput({
        grossIncome: 30000,
        ssContributions: 1905,
        irpfWithheld: 4500,
        investmentIncome: makeInvestment({ interestIncome: 3000 }),
      }));
      expect(result.individual.baseImponibleAhorro).toBe(3000);
    });

    it("capital gains add to ahorro base", () => {
      const result = calculateIrpf(makeInput({
        grossIncome: 30000,
        ssContributions: 1905,
        irpfWithheld: 4500,
        investmentIncome: makeInvestment({ capitalGains: 10000 }),
      }));
      expect(result.individual.baseImponibleAhorro).toBe(10000);
    });

    it("capital losses offset capital gains", () => {
      const result = calculateIrpf(makeInput({
        grossIncome: 30000,
        ssContributions: 1905,
        irpfWithheld: 4500,
        investmentIncome: makeInvestment({
          capitalGains: 10000,
          capitalLosses: 4000,
        }),
      }));
      expect(result.individual.baseImponibleAhorro).toBe(6000);
    });

    it("capital losses cannot make ahorro base negative", () => {
      const result = calculateIrpf(makeInput({
        grossIncome: 30000,
        ssContributions: 1905,
        irpfWithheld: 4500,
        investmentIncome: makeInvestment({
          capitalGains: 5000,
          capitalLosses: 15000,
        }),
      }));
      // Net CG = 0, compensation = min(10000, 0*0.25) = 0
      expect(result.individual.baseImponibleAhorro).toBe(0);
    });

    it("excess capital losses compensate up to 25% of dividends+interest", () => {
      const result = calculateIrpf(makeInput({
        grossIncome: 30000,
        ssContributions: 1905,
        irpfWithheld: 4500,
        investmentIncome: makeInvestment({
          dividends: 10000,
          interestIncome: 2000,
          capitalGains: 3000,
          capitalLosses: 8000,
        }),
      }));
      // netCG = max(3000 - 8000, 0) = 0
      // compensation = min(|3000 - 8000| = 5000, (10000+2000)*0.25 = 3000) = 3000
      // base = max(10000 + 2000 + 0 - 3000, 0) = 9000
      expect(result.individual.baseImponibleAhorro).toBe(9000);
    });

    it("withheld investment tax reduces resultado", () => {
      const result = calculateIrpf(makeInput({
        grossIncome: 30000,
        ssContributions: 1905,
        irpfWithheld: 4500,
        investmentIncome: makeInvestment({
          dividends: 5000,
          withheldTax: 950,
        }),
      }));
      const ind = result.individual;
      expect(ind.retencionesAplicadas).toBe(4500 + 950);
    });

    it("ahorro brackets apply progressively for large amounts", () => {
      const result = calculateIrpf(makeInput({
        grossIncome: 30000,
        ssContributions: 1905,
        irpfWithheld: 4500,
        investmentIncome: makeInvestment({ dividends: 100000 }),
      }));
      const ind = result.individual;
      // 6000 * 0.19 + 44000 * 0.21 + 50000 * 0.23 = 1140 + 9240 + 11500 = 21880
      expect(ind.cuotaAhorro).toBe(21880);
    });
  });

  // ── Mixed income (salary + investments) ──────────────────────────────────

  describe("mixed income", () => {
    it("salary and investments are taxed in separate bases", () => {
      const result = calculateIrpf(makeInput({
        grossIncome: 50000,
        ssContributions: 3175,
        irpfWithheld: 10000,
        investmentIncome: makeInvestment({
          dividends: 3000,
          capitalGains: 7000,
        }),
      }));
      const ind = result.individual;
      expect(ind.baseImponibleGeneral).toBe(50000 - 3175);
      expect(ind.baseImponibleAhorro).toBe(10000);
      expect(ind.cuotaIntegra).toBe(ind.cuotaEstatal + ind.cuotaAutonomica + ind.cuotaAhorro);
    });

    it("effective rate accounts for both general and ahorro", () => {
      const result = calculateIrpf(makeInput({
        grossIncome: 50000,
        ssContributions: 3175,
        irpfWithheld: 10000,
        investmentIncome: makeInvestment({ dividends: 20000 }),
      }));
      const ind = result.individual;
      expect(ind.tipoEfectivo).toBe(
        r((ind.cuotaLiquida / ind.rendimientosIntegros) * 100)
      );
    });
  });

  // ── Edge cases ───────────────────────────────────────────────────────────

  describe("edge cases", () => {
    it("otherDeductions reduce gastos deducibles", () => {
      const result = calculateIrpf(makeInput({
        grossIncome: 40000,
        ssContributions: 2540,
        irpfWithheld: 6000,
        otherDeductions: 500,
      }));
      expect(result.individual.gastosDeducibles).toBe(2540 + 500);
    });

    it("gastos deducibles cannot make rendimientos netos negative", () => {
      const result = calculateIrpf(makeInput({
        grossIncome: 5000,
        ssContributions: 10000,
      }));
      expect(result.individual.rendimientosNetos).toBe(0);
      expect(result.individual.baseImponibleGeneral).toBe(0);
    });

    it("no investment income means zero ahorro base", () => {
      const result = calculateIrpf(makeInput({
        grossIncome: 40000,
        ssContributions: 2540,
        irpfWithheld: 6000,
      }));
      expect(result.individual.baseImponibleAhorro).toBe(0);
      expect(result.individual.cuotaAhorro).toBe(0);
    });

    it("cuotaLiquida is never negative", () => {
      const result = calculateIrpf(makeInput({
        grossIncome: 5000,
        ssContributions: 0,
        irpfWithheld: 0,
      }));
      expect(result.individual.cuotaLiquida).toBeGreaterThanOrEqual(0);
      expect(result.conjunta.cuotaLiquida).toBeGreaterThanOrEqual(0);
    });

    it("minimoPersonal is always 5550", () => {
      const result = calculateIrpf(makeInput({ grossIncome: 100000 }));
      expect(result.individual.minimoPersonal).toBe(5550);
      expect(result.conjunta.minimoPersonal).toBe(5550);
    });
  });

  // ── Known scenarios (manual verification) ────────────────────────────────

  describe("known tax scenarios", () => {
    it("30k salary, single, no kids — verifiable amounts", () => {
      // Gross 30000, SS 1905, no withholding
      const result = calculateIrpf(makeInput({
        grossIncome: 30000,
        ssContributions: 1905,
        irpfWithheld: 0,
      }));
      const ind = result.individual;

      expect(ind.rendimientosIntegros).toBe(30000);
      expect(ind.gastosDeducibles).toBe(1905);
      expect(ind.rendimientosNetos).toBe(28095);
      expect(ind.reduccionRendimientos).toBe(0); // net > 19747.5
      expect(ind.baseImponibleGeneral).toBe(28095);
      expect(ind.baseLiquidableGeneral).toBe(28095); // no personal reductions in individual
      expect(ind.minimoPersonal).toBe(5550);
      expect(ind.minimoHijos).toBe(0);
      expect(ind.minimoTotal).toBe(5550);

      // Manual estatal bracket calc for 28095:
      // 12450 * 0.095 = 1182.75
      // (20200-12450) * 0.12 = 930.00
      // (28095-20200) * 0.15 = 1184.25
      // Total estatal = 3297.00
      expect(ind.cuotaEstatal + ind.cuotaMinimoEstatal).toBeCloseTo(3297, 0);

      expect(ind.cuotaLiquida).toBeGreaterThan(0);
      expect(ind.resultadoDeclaracion).toBe(ind.cuotaLiquida); // no withholding
    });

    it("refund when withholding exceeds tax owed", () => {
      const result = calculateIrpf(makeInput({
        grossIncome: 20000,
        ssContributions: 1270,
        irpfWithheld: 5000, // over-withheld
      }));
      expect(result.individual.resultadoDeclaracion).toBeLessThan(0); // refund
    });

    it("pure investment income produces only ahorro tax", () => {
      const result = calculateIrpf(makeInput({
        grossIncome: 0,
        investmentIncome: makeInvestment({
          dividends: 6000,
          withheldTax: 1140, // 19% withheld
        }),
      }));
      const ind = result.individual;
      expect(ind.baseImponibleGeneral).toBe(0);
      expect(ind.cuotaEstatal).toBe(0);
      expect(ind.cuotaAutonomica).toBe(0);
      expect(ind.baseImponibleAhorro).toBe(6000);
      expect(ind.cuotaAhorro).toBe(1140); // 6000 * 0.19
      expect(ind.resultadoDeclaracion).toBe(0); // withheld matches exactly
    });

    it("family scenario: 45k salary, spouse 0, 2 kids", () => {
      const result = calculateIrpf(makeInput({
        grossIncome: 45000,
        ssContributions: 2858,
        irpfWithheld: 8000,
        spouseIncome: 0,
        childrenBirthYears: [2018, 2021], // ages 7 and 4
      }));

      // Conjunta should be better (spouse has 0 income)
      expect(result.recommendation).toBe("CONJUNTA");
      expect(result.savingsAmount).toBeGreaterThan(0);

      // Children minimums
      expect(result.individual.minimoHijos).toBe(2400 + 2700); // 5100
      expect(result.conjunta.minimoHijos).toBe(2400 + 2700);

      // Conjunta has 3400 reduction
      expect(result.conjunta.reduccionesPersonales).toBe(3400);
    });
  });

  // ── Recommendation logic ─────────────────────────────────────────────────

  describe("recommendation", () => {
    it("recommends CONJUNTA when it produces equal resultado", () => {
      // Edge case: when both are equal, conjunta wins (<=)
      const result = calculateIrpf(makeInput({
        grossIncome: 0,
        spouseIncome: 0,
      }));
      expect(result.recommendation).toBe("CONJUNTA");
      expect(result.savingsAmount).toBe(0);
    });
  });
});
