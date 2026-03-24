"use client";

import { useState, useMemo } from "react";
import { useTranslations } from "next-intl";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { calculateIrpf, type IrpfInput, type IrpfComparison } from "@/lib/reporting/irpf-calculator";

function formatEur(n: number): string {
  return new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(n);
}

interface IrpfSimulatorProps {
  prefilled?: {
    grossIncome: number;
    ssContributions: number;
    irpfWithheld: number;
    dividends: number;
    interestIncome: number;
    capitalGains: number;
    capitalLosses: number;
    investmentWithheld: number;
  };
  year: number;
}

export function IrpfSimulator({ prefilled, year }: IrpfSimulatorProps) {
  const t = useTranslations("reporting");
  const [grossIncome, setGrossIncome] = useState(prefilled?.grossIncome || 0);
  const [ssContributions, setSsContributions] = useState(prefilled?.ssContributions || 0);
  const [irpfWithheld, setIrpfWithheld] = useState(prefilled?.irpfWithheld || 0);
  const [situation, setSituation] = useState(2);
  const [child1Year, setChild1Year] = useState(2013);
  const [child2Year, setChild2Year] = useState(2022);
  const [child3Year, setChild3Year] = useState(0);
  const [spouseIncome, setSpouseIncome] = useState(0);
  const [dividends, setDividends] = useState(prefilled?.dividends || 0);
  const [interestIncome, setInterestIncome] = useState(prefilled?.interestIncome || 0);
  const [capitalGains, setCapitalGains] = useState(prefilled?.capitalGains || 0);
  const [capitalLosses, setCapitalLosses] = useState(prefilled?.capitalLosses || 0);
  const [investmentWithheld, setInvestmentWithheld] = useState(prefilled?.investmentWithheld || 0);

  const childrenBirthYears = useMemo(() =>
    [child1Year, child2Year, child3Year].filter(y => y > 1900),
    [child1Year, child2Year, child3Year]
  );

  const hasInvestments = dividends > 0 || interestIncome > 0 || capitalGains > 0;

  const result: IrpfComparison | null = useMemo(() => {
    if (grossIncome <= 0) return null;
    const input: IrpfInput = {
      year,
      grossIncome,
      ssContributions,
      irpfWithheld,
      comunidad: "ANDALUCIA",
      situation,
      childrenBirthYears,
      spouseIncome,
      investmentIncome: hasInvestments ? {
        dividends,
        interestIncome,
        capitalGains,
        capitalLosses,
        withheldTax: investmentWithheld,
      } : undefined,
    };
    return calculateIrpf(input);
  }, [grossIncome, ssContributions, irpfWithheld, situation, childrenBirthYears, spouseIncome,
      dividends, interestIncome, capitalGains, capitalLosses, investmentWithheld, hasInvestments, year]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t("es_simulator_title")} ({year})</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Трудовий дохід */}
        <div>
          <p className="text-sm font-medium mb-2">{t("es_work_income")}</p>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <div>
              <Label className="text-xs">{t("es_gross_label")}</Label>
              <Input type="number" value={grossIncome || ""} onChange={e => setGrossIncome(Number(e.target.value))} />
            </div>
            <div>
              <Label className="text-xs">Внески SS (Cotizaci&oacute;n SS)</Label>
              <Input type="number" value={ssContributions || ""} onChange={e => setSsContributions(Number(e.target.value))} />
            </div>
            <div>
              <Label className="text-xs">{t("es_irpf_label")}</Label>
              <Input type="number" value={irpfWithheld || ""} onChange={e => setIrpfWithheld(Number(e.target.value))} />
            </div>
          </div>
        </div>

        {/* Сімейна ситуація */}
        <div>
          <p className="text-sm font-medium mb-2">Сімейна ситуація (Situaci&oacute;n familiar)</p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div>
              <Label className="text-xs">Ситуація (Situaci&oacute;n)</Label>
              <select className="w-full h-9 rounded-md border px-3 text-sm bg-background"
                value={situation} onChange={e => setSituation(Number(e.target.value))}>
                <option value={1}>{t("es_sit_1")}</option>
                <option value={2}>{t("es_sit_2")}</option>
                <option value={3}>{t("es_sit_3")}</option>
              </select>
            </div>
            <div>
              <Label className="text-xs">{t("es_child1")}</Label>
              <Input type="number" value={child1Year || ""} onChange={e => setChild1Year(Number(e.target.value))} />
            </div>
            <div>
              <Label className="text-xs">{t("es_child2")}</Label>
              <Input type="number" value={child2Year || ""} onChange={e => setChild2Year(Number(e.target.value))} />
            </div>
            <div>
              <Label className="text-xs">Дохід дружини (Ingreso c&oacute;nyuge)</Label>
              <Input type="number" value={spouseIncome || ""} onChange={e => setSpouseIncome(Number(e.target.value))} />
            </div>
          </div>
        </div>

        {/* Інвестиційний дохід */}
        <div>
          <p className="text-sm font-medium mb-2">{t("es_investment_section")}</p>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <div>
              <Label className="text-xs">{t("es_dividends_label")}</Label>
              <Input type="number" value={dividends || ""} onChange={e => setDividends(Number(e.target.value))} />
            </div>
            <div>
              <Label className="text-xs">{t("es_interest_label")}</Label>
              <Input type="number" value={interestIncome || ""} onChange={e => setInterestIncome(Number(e.target.value))} />
            </div>
            <div>
              <Label className="text-xs">{t("es_gains_label")}</Label>
              <Input type="number" value={capitalGains || ""} onChange={e => setCapitalGains(Number(e.target.value))} />
            </div>
            <div>
              <Label className="text-xs">Втрати капіталу (P&eacute;rdidas)</Label>
              <Input type="number" value={capitalLosses || ""} onChange={e => setCapitalLosses(Number(e.target.value))} />
            </div>
            <div>
              <Label className="text-xs">{t("es_inv_withheld")}</Label>
              <Input type="number" value={investmentWithheld || ""} onChange={e => setInvestmentWithheld(Number(e.target.value))} />
            </div>
          </div>
        </div>

        {/* Результат */}
        {result && (
          <div className="border-t pt-4">
            <div className="flex items-center gap-2 mb-3">
              <p className="text-sm font-medium">{t("es_result_label")}</p>
              <Badge variant={result.recommendation === "CONJUNTA" ? "default" : "secondary"}>
                {result.recommendation === "CONJUNTA" ? t("es_conjunta") : t("es_individual")}
                {result.savingsAmount > 0 && ` — економія ${formatEur(result.savingsAmount)}`}
              </Badge>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Індивідуальна */}
              <div className="space-y-1 text-sm">
                <p className="font-medium">{t("es_individual")}</p>
                <div className="flex justify-between"><span className="text-muted-foreground">{t("es_tax_base")}</span><span>{formatEur(result.individual.baseImponibleGeneral)}</span></div>
                {result.individual.baseImponibleAhorro > 0 && (
                  <div className="flex justify-between"><span className="text-muted-foreground">{t("es_savings_base")}</span><span>{formatEur(result.individual.baseImponibleAhorro)}</span></div>
                )}
                <div className="flex justify-between"><span className="text-muted-foreground">{t("es_minimum")}</span><span>{formatEur(result.individual.minimoTotal)}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">{t("es_full_quota")}</span><span>{formatEur(result.individual.cuotaIntegra)}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">{t("es_retenciones")}</span><span>-{formatEur(result.individual.retencionesAplicadas)}</span></div>
                <div className="flex justify-between font-bold border-t pt-1">
                  <span>{result.individual.resultadoDeclaracion >= 0 ? t("es_to_pay_label") : t("es_refund_label")}</span>
                  <span className={result.individual.resultadoDeclaracion >= 0 ? "text-expense" : "text-income"}>
                    {formatEur(Math.abs(result.individual.resultadoDeclaracion))}
                  </span>
                </div>
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>{t("es_effective_rate_label")}</span><span>{result.individual.tipoEfectivo}%</span>
                </div>
              </div>

              {/* Спільна */}
              <div className="space-y-1 text-sm">
                <p className="font-medium">{t("es_conjunta")}</p>
                <div className="flex justify-between"><span className="text-muted-foreground">{t("es_tax_base")}</span><span>{formatEur(result.conjunta.baseImponibleGeneral)}</span></div>
                {result.conjunta.baseImponibleAhorro > 0 && (
                  <div className="flex justify-between"><span className="text-muted-foreground">{t("es_savings_base")}</span><span>{formatEur(result.conjunta.baseImponibleAhorro)}</span></div>
                )}
                <div className="flex justify-between"><span className="text-muted-foreground">{t("es_minimum")}</span><span>{formatEur(result.conjunta.minimoTotal)}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">{t("es_full_quota")}</span><span>{formatEur(result.conjunta.cuotaIntegra)}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">{t("es_retenciones")}</span><span>-{formatEur(result.conjunta.retencionesAplicadas)}</span></div>
                <div className="flex justify-between font-bold border-t pt-1">
                  <span>{result.conjunta.resultadoDeclaracion >= 0 ? t("es_to_pay_label") : t("es_refund_label")}</span>
                  <span className={result.conjunta.resultadoDeclaracion >= 0 ? "text-expense" : "text-income"}>
                    {formatEur(Math.abs(result.conjunta.resultadoDeclaracion))}
                  </span>
                </div>
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>{t("es_effective_rate_label")}</span><span>{result.conjunta.tipoEfectivo}%</span>
                </div>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
