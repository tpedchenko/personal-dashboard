"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { useTranslations } from "next-intl";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  UploadIcon, TrashIcon, CheckCircleIcon, XCircleIcon,
  FileTextIcon, FileSpreadsheetIcon,
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, PieChart, Pie, Cell,
} from "recharts";
import type { EsTaxOverview } from "@/actions/reporting/es-tax";
import { IrpfSimulator } from "./irpf-simulator";
import { useChartColors } from "@/hooks/use-chart-colors";

interface EsTaxDashboardProps {
  overview: EsTaxOverview;
  onRefresh: () => void;
}

const MONTHS = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
const PIE_COLORS = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899"];

function formatEur(n: number): string {
  return new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(n);
}

function KpiCard({ title, value, subtitle, color }: {
  title: string; value: string; subtitle?: string; color?: string;
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-xs text-muted-foreground">{title}</p>
        <p className={`text-xl font-bold ${color || ""}`}>{value}</p>
        {subtitle && <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>}
      </CardContent>
    </Card>
  );
}

function UploadZone({ id, title, hint, accept, uploading, uploadingLabel, onFiles }: {
  id: string; title: string; hint: string; accept: string;
  uploading: boolean; uploadingLabel: string; onFiles: (files: FileList) => void;
}) {
  return (
    <div
      className="border-2 border-dashed rounded-lg p-4 text-center cursor-pointer hover:border-primary/50 transition-colors"
      onClick={() => document.getElementById(id)?.click()}
      onDragOver={e => { e.preventDefault(); e.currentTarget.classList.add("border-primary"); }}
      onDragLeave={e => e.currentTarget.classList.remove("border-primary")}
      onDrop={e => { e.preventDefault(); e.currentTarget.classList.remove("border-primary"); onFiles(e.dataTransfer.files); }}
    >
      <UploadIcon className="size-6 mx-auto mb-1 text-muted-foreground" />
      <p className="text-sm text-muted-foreground">{uploading ? uploadingLabel : title}</p>
      <p className="text-xs text-muted-foreground mt-0.5">{hint}</p>
      <input id={id} type="file" accept={accept} multiple className="hidden"
        onChange={e => e.target.files && onFiles(e.target.files)} />
    </div>
  );
}

export function EsTaxDashboard({ overview: initialOverview, onRefresh }: EsTaxDashboardProps) {
  const t = useTranslations("reporting");
  const { colors: CC } = useChartColors();
  const [overview, setOverview] = useState(initialOverview);
  const [uploading, setUploading] = useState<"nomina" | "broker" | "certificado" | null>(null);

  // Sync with parent when year/data changes
  useEffect(() => {
    setOverview(initialOverview);
  }, [initialOverview]);

  const reloadData = useCallback(async () => {
    const { getEsTaxOverview } = await import("@/actions/reporting/es-tax");
    const fresh = await getEsTaxOverview(overview.year);
    setOverview(fresh);
    onRefresh();
  }, [onRefresh, overview.year]);

  const uploadFiles = useCallback(async (files: FileList, docType: string, source?: string) => {
    setUploading(docType === "NOMINA" ? "nomina" : docType === "CERTIFICADO_RETENCIONES" ? "certificado" : "broker");
    try {
      for (const file of Array.from(files)) {
        const formData = new FormData();
        formData.append("file", file);
        formData.append("docType", docType);
        if (source) formData.append("source", source);
        formData.append("year", String(overview.year));

        const resp = await fetch("/api/upload/tax-document", { method: "POST", body: formData });
        if (!resp.ok) {
          const err = await resp.json();
          alert(`Error uploading ${file.name}: ${err.error}`);
        }
      }
      await reloadData();
    } finally {
      setUploading(null);
    }
  }, [reloadData, overview.year]);

  const handleNominaUpload = useCallback((files: FileList) => {
    uploadFiles(files, "NOMINA");
  }, [uploadFiles]);

  const handleCertificadoUpload = useCallback((files: FileList) => {
    uploadFiles(files, "CERTIFICADO_RETENCIONES");
  }, [uploadFiles]);

  const handleBrokerUpload = useCallback((files: FileList) => {
    for (const file of Array.from(files)) {
      const name = file.name.toLowerCase();
      let source = "UNKNOWN";
      if (name.includes("ibkr") || name.includes("interactive")) source = "IBKR";
      else if (name.includes("trading212") || name.includes("212")) source = "TRADING212";
      else if (name.includes("etorro") || name.includes("etoro")) source = "ETORRO";
      const fl = new DataTransfer();
      fl.items.add(file);
      uploadFiles(fl.files, "BROKER_REPORT", source);
    }
  }, [uploadFiles]);

  const handleDelete = useCallback(async (id: string) => {
    const { deleteEsTaxDocument } = await import("@/actions/reporting/es-tax");
    await deleteEsTaxDocument(id);
    onRefresh();
  }, [onRefresh]);

  const { nominas, irpfComparison: irpf, investments, documents, verification, certificado } = overview;

  const monthlyData = Array.from({ length: 12 }, (_, i) => {
    const m = nominas.find(n => n.month === i + 1);
    return { name: MONTHS[i], bruto: m?.grossPay || 0, irpf: m?.irpfWithheld || 0, ss: m?.ssTotal || 0, neto: m?.netPay || 0 };
  });

  const pieData = nominas.length > 0 ? [
    { name: "Salario", value: nominas.reduce((s, n) => s + n.grossPay - n.bonus, 0) },
    { name: "Bonus", value: nominas.reduce((s, n) => s + n.bonus, 0) },
    ...(overview.totalDividends > 0 ? [{ name: "Dividendos", value: overview.totalDividends }] : []),
    ...(overview.totalCapitalGains > 0 ? [{ name: "Capital Gains", value: overview.totalCapitalGains }] : []),
  ].filter(d => d.value > 0) : [];

  return (
    <div className="space-y-4">
      {/* Two upload zones side by side */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <UploadZone
          id="es-nomina-upload"
          title={t("es_nominas_title")}
          hint={t("es_nominas_hint")}
          accept=".pdf"
          uploading={uploading === "nomina"}
          uploadingLabel={t("es_uploading")}
          onFiles={handleNominaUpload}
        />
        <UploadZone
          id="es-broker-upload"
          title={t("es_broker_title")}
          hint={t("es_broker_hint")}
          accept=".pdf,.csv,.txt"
          uploading={uploading === "broker"}
          uploadingLabel={t("es_uploading")}
          onFiles={handleBrokerUpload}
        />
      </div>

      {/* Certificado upload */}
      <UploadZone
        id="es-certificado-upload"
        title={t("es_certificado_title")}
        hint={t("es_certificado_hint")}
        accept=".pdf"
        uploading={uploading === "certificado"}
        uploadingLabel={t("es_uploading")}
        onFiles={handleCertificadoUpload}
      />

      {/* Verification: certificado vs nominas */}
      {verification && (
        <Card className={`border ${verification.grossMatch && verification.retencionesMatch && verification.ssMatch ? "border-green-500/30" : "border-amber-500/30"}`}>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              {verification.grossMatch && verification.retencionesMatch && verification.ssMatch ? "✅" : "⚠️"} {t("es_verification_title")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 gap-3 text-xs">
              <div className={`p-2 rounded ${verification.grossMatch ? "bg-green-500/10" : "bg-red-500/10"}`}>
                <p className="text-muted-foreground">Bruto</p>
                <p>Nóminas: {verification.nominaGross.toFixed(2)} EUR</p>
                <p>Cert: {verification.certGross.toFixed(2)} EUR</p>
                <p className="font-medium">{verification.grossMatch ? "✅ Match" : `❌ Різниця: ${(verification.nominaGross - verification.certGross).toFixed(2)} EUR`}</p>
              </div>
              <div className={`p-2 rounded ${verification.retencionesMatch ? "bg-green-500/10" : "bg-red-500/10"}`}>
                <p className="text-muted-foreground">Retenciones (IRPF)</p>
                <p>Nóminas: {verification.nominaRetenciones.toFixed(2)} EUR</p>
                <p>Cert: {verification.certRetenciones.toFixed(2)} EUR</p>
                <p className="font-medium">{verification.retencionesMatch ? "✅ Match" : `❌ Різниця: ${(verification.nominaRetenciones - verification.certRetenciones).toFixed(2)} EUR`}</p>
              </div>
              <div className={`p-2 rounded ${verification.ssMatch ? "bg-green-500/10" : "bg-red-500/10"}`}>
                <p className="text-muted-foreground">Seguridad Social</p>
                <p>Nóminas: {verification.nominaSS.toFixed(2)} EUR</p>
                <p>Cert: {verification.certSS.toFixed(2)} EUR</p>
                <p className="font-medium">{verification.ssMatch ? "✅ Match" : `❌ Різниця: ${(verification.nominaSS - verification.certSS).toFixed(2)} EUR`}</p>
              </div>
            </div>
            {certificado && (
              <div className="mt-2 text-[10px] text-muted-foreground">
                Dietas: {certificado.dietas.toFixed(2)} EUR | Rentas exentas: {certificado.rentasExentas.toFixed(2)} EUR | Ефективна ставка: {certificado.effectiveRate}%
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Documents Summary */}
      {documents.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("es_docs_title")} ({documents.length})</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-xs text-muted-foreground">
                    <th className="text-left py-2">{t("es_doc_type")}</th>
                    <th className="text-left">{t("es_doc_file")}</th>
                    <th className="text-left">{t("es_doc_period")}</th>
                    <th className="text-left">{t("es_doc_content")}</th>
                    <th className="text-left">{t("es_doc_date")}</th>
                    <th className="text-center w-10"></th>
                  </tr>
                </thead>
                <tbody>
                  {documents.map(doc => (
                    <tr key={doc.id} className="border-b border-dashed">
                      <td className="py-1.5">
                        <Badge variant="secondary" className="text-xs">
                          {doc.docType === "NOMINA" ? "Nómina" : doc.docType === "CERTIFICADO_RETENCIONES" ? "Certificado" : doc.source || "Broker"}
                        </Badge>
                      </td>
                      <td className="text-xs max-w-[200px] truncate" title={doc.fileName || ""}>
                        {doc.docType === "NOMINA" ? <FileTextIcon className="size-3 inline mr-1" /> : <FileSpreadsheetIcon className="size-3 inline mr-1" />}
                        {doc.fileName || "—"}
                      </td>
                      <td className="text-xs">{doc.period}</td>
                      <td className="text-xs text-muted-foreground max-w-[250px] truncate" title={doc.summary}>
                        {doc.summary}
                      </td>
                      <td className="text-xs text-muted-foreground">
                        {new Date(doc.createdAt).toLocaleDateString("uk-UA")}
                      </td>
                      <td className="text-center">
                        <Button variant="ghost" size="sm" className="h-6 w-6 p-0"
                          onClick={() => handleDelete(doc.id)}>
                          <TrashIcon className="size-3 text-red-400" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {nominas.length === 0 && investments.length === 0 && (
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground">
            <p>{t("es_no_data")}</p>
          </CardContent>
        </Card>
      )}

      {/* KPI Cards */}
      {nominas.length > 0 && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2">
            <KpiCard title={t("es_gross_income")} value={formatEur(overview.totalGross)} subtitle={`${overview.monthsUploaded}/12 ${t("es_months")}`} />
            <KpiCard title={t("es_irpf_withheld")} value={formatEur(overview.totalIrpfWithheld)} subtitle={`${overview.avgIrpfRate}%`} />
            <KpiCard title={t("es_ss_contributions")} value={formatEur(overview.totalSS)} />
            <KpiCard title={t("es_net_pay")} value={formatEur(overview.totalNetPay)} color="text-income" />
            {irpf && (
              <>
                <KpiCard title={t("es_effective_rate")} value={`${irpf.individual.tipoEfectivo}%`} subtitle="Individual" />
                <KpiCard
                  title={irpf.individual.resultadoDeclaracion >= 0 ? t("es_to_pay") : t("es_refund")}
                  value={formatEur(Math.abs(irpf.individual.resultadoDeclaracion))}
                  color={irpf.individual.resultadoDeclaracion >= 0 ? "text-expense" : "text-income"}
                  subtitle={irpf.recommendation === "CONJUNTA" ? `Conjunta: ${formatEur(Math.abs(irpf.conjunta.resultadoDeclaracion))}` : undefined}
                />
              </>
            )}
          </div>

          {/* IRPF Comparison */}
          {irpf && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  {t("es_comparison_title")}
                  <Badge variant={irpf.recommendation === "CONJUNTA" ? "default" : "secondary"} className="ml-auto">
                    {irpf.recommendation} {irpf.savingsAmount > 0 && `(${formatEur(irpf.savingsAmount)} {t("es_savings")})`}
                  </Badge>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b"><th className="text-left py-2">{t("es_indicator")}</th><th className="text-right py-2">Individual</th><th className="text-right py-2">Conjunta</th></tr>
                    </thead>
                    <tbody>
                      {([
                        ["Rendimientos íntegros", irpf.individual.rendimientosIntegros, irpf.conjunta.rendimientosIntegros],
                        ["Gastos deducibles (SS)", irpf.individual.gastosDeducibles, irpf.conjunta.gastosDeducibles],
                        ["Reducción rendimientos", irpf.individual.reduccionRendimientos, irpf.conjunta.reduccionRendimientos],
                        ["Base imponible general", irpf.individual.baseImponibleGeneral, irpf.conjunta.baseImponibleGeneral],
                        ["Mínimo personal+familiar", irpf.individual.minimoTotal, irpf.conjunta.minimoTotal],
                        ["Cuota estatal", irpf.individual.cuotaEstatal, irpf.conjunta.cuotaEstatal],
                        ["Cuota autonómica", irpf.individual.cuotaAutonomica, irpf.conjunta.cuotaAutonomica],
                        ...(irpf.individual.cuotaAhorro > 0 ? [["Cuota ahorro", irpf.individual.cuotaAhorro, irpf.conjunta.cuotaAhorro] as [string, number, number]] : []),
                        ["Cuota íntegra", irpf.individual.cuotaIntegra, irpf.conjunta.cuotaIntegra],
                        ["Retenciones aplicadas", irpf.individual.retencionesAplicadas, irpf.conjunta.retencionesAplicadas],
                      ] as [string, number, number][]).map(([label, ind, con]) => (
                        <tr key={label} className="border-b border-dashed">
                          <td className="py-1.5">{label}</td>
                          <td className="text-right">{formatEur(ind)}</td>
                          <td className="text-right">{formatEur(con)}</td>
                        </tr>
                      ))}
                      <tr className="font-bold border-t-2">
                        <td className="py-2">{t("es_result")}</td>
                        <td className={`text-right ${irpf.individual.resultadoDeclaracion >= 0 ? "text-expense" : "text-income"}`}>
                          {irpf.individual.resultadoDeclaracion >= 0 ? "+" : ""}{formatEur(irpf.individual.resultadoDeclaracion)}
                        </td>
                        <td className={`text-right ${irpf.conjunta.resultadoDeclaracion >= 0 ? "text-expense" : "text-income"}`}>
                          {irpf.conjunta.resultadoDeclaracion >= 0 ? "+" : ""}{formatEur(irpf.conjunta.resultadoDeclaracion)}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Charts row: Monthly Income (2/3) + Income Structure Pie (1/3) */}
          <div className={`grid gap-3 ${pieData.length > 1 ? "grid-cols-1 lg:grid-cols-3" : ""}`}>
            <Card className={pieData.length > 1 ? "lg:col-span-2" : ""}>
              <CardHeader><CardTitle className="text-base">{t("es_monthly_income")}</CardTitle></CardHeader>
              <CardContent>
                <figure role="img" aria-label="Графік доходу по місяцях (Іспанія)">
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={monthlyData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="name" />
                    <YAxis tickFormatter={v => `${(Number(v) / 1000).toFixed(0)}k EUR`} />
                    <Tooltip formatter={(v) => formatEur(Number(v))} />
                    <Legend />
                    <Bar dataKey="neto" name="Neto" fill={CC.esNeto} stackId="a" />
                    <Bar dataKey="irpf" name="IRPF" fill={CC.esIrpf} stackId="a" />
                    <Bar dataKey="ss" name="SS" fill={CC.esSs} stackId="a" />
                  </BarChart>
                </ResponsiveContainer>
                </figure>
              </CardContent>
            </Card>

            {pieData.length > 1 && (
              <Card>
                <CardHeader><CardTitle className="text-base">{t("es_income_structure")}</CardTitle></CardHeader>
                <CardContent>
                  <figure role="img" aria-label="Графік структури доходу">
                  <ResponsiveContainer width="100%" height={300}>
                    <PieChart>
                      <Pie data={pieData} cx="50%" cy="50%" outerRadius={80} dataKey="value"
                        label={({ name, percent }) => `${name} ${((percent || 0) * 100).toFixed(0)}%`}>
                        {pieData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                      </Pie>
                      <Tooltip formatter={(v) => formatEur(Number(v))} />
                    </PieChart>
                  </ResponsiveContainer>
                  </figure>
                </CardContent>
              </Card>
            )}
          </div>

          {/* Nominas Table */}
          <Card>
            <CardHeader><CardTitle className="text-base">{t("es_nominas_table")} {overview.year}</CardTitle></CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-xs text-muted-foreground">
                      <th className="text-left py-2">{t("es_month")}</th><th className="text-right">Bruto</th>
                      <th className="text-right">Base IRPF</th><th className="text-right">IRPF %</th>
                      <th className="text-right">IRPF</th><th className="text-right">SS</th>
                      <th className="text-right">Neto</th><th className="text-center"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {Array.from({ length: 12 }, (_, i) => {
                      const m = nominas.find(n => n.month === i + 1);
                      return (
                        <tr key={i} className="border-b border-dashed">
                          <td className="py-1.5">{MONTHS[i]}</td>
                          <td className="text-right">{m ? formatEur(m.grossPay) : "—"}</td>
                          <td className="text-right">{m ? formatEur(m.baseIrpf) : "—"}</td>
                          <td className="text-right">{m ? `${m.irpfPct}%` : "—"}</td>
                          <td className="text-right">{m ? formatEur(m.irpfWithheld) : "—"}</td>
                          <td className="text-right">{m ? formatEur(m.ssTotal) : "—"}</td>
                          <td className="text-right">{m ? formatEur(m.netPay) : "—"}</td>
                          <td className="text-center">
                            {m ? <CheckCircleIcon className="size-4 text-green-500 inline" /> : <XCircleIcon className="size-4 text-gray-300 inline" />}
                          </td>
                        </tr>
                      );
                    })}
                    <tr className="font-bold border-t-2">
                      <td className="py-2">{t("es_total")}</td>
                      <td className="text-right">{formatEur(overview.totalGross)}</td>
                      <td className="text-right">{formatEur(overview.totalBaseIrpf)}</td>
                      <td className="text-right">{overview.avgIrpfRate}%</td>
                      <td className="text-right">{formatEur(overview.totalIrpfWithheld)}</td>
                      <td className="text-right">{formatEur(overview.totalSS)}</td>
                      <td className="text-right">{formatEur(overview.totalNetPay)}</td>
                      <td className="text-center">{overview.monthsUploaded}/12</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </>
      )}

      {/* Investment Summary */}
      {investments.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("es_investment_income")} {overview.year}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-xs text-muted-foreground">
                    <th className="text-left py-2">{t("es_broker")}</th><th className="text-right">{t("es_dividends")}</th>
                    <th className="text-right">{t("es_interest")}</th><th className="text-right">{t("es_gains")}</th>
                    <th className="text-right">{t("es_losses")}</th><th className="text-right">{t("es_withheld")}</th>
                  </tr>
                </thead>
                <tbody>
                  {investments.map(inv => (
                    <tr key={inv.broker} className="border-b border-dashed">
                      <td className="py-1.5 font-medium">{inv.broker}</td>
                      <td className="text-right">{formatEur(inv.dividends)}</td>
                      <td className="text-right">{formatEur(inv.interestIncome)}</td>
                      <td className="text-right text-income">{formatEur(inv.realizedGains)}</td>
                      <td className="text-right text-expense">{formatEur(inv.realizedLosses)}</td>
                      <td className="text-right">{formatEur(inv.withheldTax)}</td>
                    </tr>
                  ))}
                  <tr className="font-bold border-t-2">
                    <td className="py-2">{t("es_total")}</td>
                    <td className="text-right">{formatEur(overview.totalDividends)}</td>
                    <td className="text-right">{formatEur(investments.reduce((s, i) => s + i.interestIncome, 0))}</td>
                    <td className="text-right text-income">{formatEur(overview.totalCapitalGains)}</td>
                    <td className="text-right text-expense">{formatEur(overview.totalCapitalLosses)}</td>
                    <td className="text-right">{formatEur(overview.totalInvestmentWithheld)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* IRPF Simulator */}
      <IrpfSimulator
        year={overview.year}
        prefilled={nominas.length > 0 || investments.length > 0 ? {
          grossIncome: overview.totalBaseIrpf,
          ssContributions: overview.totalSS,
          irpfWithheld: overview.totalIrpfWithheld,
          dividends: overview.totalDividends,
          interestIncome: investments.reduce((s, i) => s + i.interestIncome, 0),
          capitalGains: overview.totalCapitalGains,
          capitalLosses: overview.totalCapitalLosses,
          investmentWithheld: overview.totalInvestmentWithheld,
        } : undefined}
      />
    </div>
  );
}
