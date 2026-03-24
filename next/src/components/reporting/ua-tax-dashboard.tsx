"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  LineChart,
  Line,
} from "recharts";
import type { UaTaxOverview, UaTaxYearSummary } from "@/actions/reporting";
import { EmptyState } from "@/components/shared/empty-state";
import { useChartColors } from "@/hooks/use-chart-colors";

interface UaTaxDashboardProps {
  data: UaTaxOverview;
}

function formatAmount(n: number): string {
  return new Intl.NumberFormat("uk-UA", { maximumFractionDigits: 0 }).format(n);
}

function KpiCard({ label, value, suffix, color }: { label: string; value: string; suffix?: string; color?: string }) {
  return (
    <Card size="sm">
      <CardContent>
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className={`text-lg font-semibold ${color || ""}`}>
          {value}{suffix && <span className="text-sm font-normal ml-0.5">{suffix}</span>}
        </div>
      </CardContent>
    </Card>
  );
}

function YearDetails({ year }: { year: UaTaxYearSummary }) {
  const t = useTranslations("reporting");
  const { colors: CC } = useChartColors();

  const chartData = year.quarters.map((q) => ({
    name: q.period.split("-")[1] || `Q${q.quarter}`,
    income: Math.round(q.income),
    tax: Math.round(q.singleTax),
    esv: Math.round(q.esv),
    vz: Math.round(q.militaryLevy),
  }));

  return (
    <div className="space-y-4">
      {/* Quarter table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-muted-foreground">
              <th className="py-2 pr-3">{t("period_col")}</th>
              <th className="py-2 pr-3 text-right">{t("income_col")}</th>
              <th className="py-2 pr-3 text-right">{t("single_tax")}</th>
              <th className="py-2 pr-3 text-right">{t("esv")}</th>
              <th className="py-2 pr-3 text-right">{t("military_levy")}</th>
              <th className="py-2 pr-3 text-right">{t("effective_rate")}</th>
              <th className="py-2">{t("status_col")}</th>
            </tr>
          </thead>
          <tbody>
            {year.quarters.map((q) => (
              <tr key={q.period} className="border-b last:border-0">
                <td className="py-2 pr-3 font-medium">{q.period}</td>
                <td className="py-2 pr-3 text-right">{formatAmount(q.income)} UAH</td>
                <td className="py-2 pr-3 text-right">{formatAmount(q.singleTax)} UAH</td>
                <td className="py-2 pr-3 text-right">{formatAmount(q.esv)} UAH</td>
                <td className="py-2 pr-3 text-right">{formatAmount(q.militaryLevy)} UAH</td>
                <td className="py-2 pr-3 text-right">{q.effectiveRate}%</td>
                <td className="py-2">
                  <Badge variant={q.status === "accepted" ? "default" : "secondary"} className="text-[10px]">
                    {t(`status_${q.status}`)}
                  </Badge>
                </td>
              </tr>
            ))}
            {/* Year total row */}
            <tr className="font-semibold bg-muted/50">
              <td className="py-2 pr-3">{t("year_total")}</td>
              <td className="py-2 pr-3 text-right">{formatAmount(year.totalIncome)} UAH</td>
              <td className="py-2 pr-3 text-right">{formatAmount(year.totalSingleTax)} UAH</td>
              <td className="py-2 pr-3 text-right">{formatAmount(year.totalEsv)} UAH</td>
              <td className="py-2 pr-3 text-right">{formatAmount(year.totalMilitaryLevy)} UAH</td>
              <td className="py-2 pr-3 text-right">{year.effectiveRate}%</td>
              <td className="py-2"></td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Quarterly chart */}
      {chartData.length > 0 && (
        <div className="h-64">
          <figure role="img" aria-label="Графік податків по кварталах">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
              <XAxis dataKey="name" className="text-xs" />
              <YAxis className="text-xs" tickFormatter={(v) => `${Math.round(v / 1000)}k`} />
              <Tooltip
                formatter={(value) => `${formatAmount(Number(value))} UAH`}
                contentStyle={{ backgroundColor: "var(--card)", border: "1px solid var(--border)" }}
              />
              <Legend />
              <Bar dataKey="income" name={t("income_col")} fill={CC.uaIncome} />
              <Bar dataKey="tax" name={t("single_tax")} fill={CC.uaTax} />
              <Bar dataKey="esv" name={t("esv")} fill={CC.uaEsv} />
              <Bar dataKey="vz" name={t("military_levy")} fill={CC.uaVz} />
            </BarChart>
          </ResponsiveContainer>
          </figure>
        </div>
      )}
    </div>
  );
}

export function UaTaxDashboard({ data }: UaTaxDashboardProps) {
  const t = useTranslations("reporting");
  const { colors: CC } = useChartColors();
  const [selectedYear, setSelectedYear] = useState<number>(
    data.years.length > 0 ? data.years[data.years.length - 1].year : data.currentYear,
  );

  const currentYearData = data.years.find((y) => y.year === data.currentYear);
  const selectedYearData = data.years.find((y) => y.year === selectedYear);

  // Multi-year chart data for trend line
  const trendData = data.years.map((y) => ({
    name: String(y.year),
    income: Math.round(y.totalIncome),
    taxBurden: Math.round(y.totalTaxBurden),
    effectiveRate: y.effectiveRate,
  }));

  return (
    <div className="space-y-4">
      {/* KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <KpiCard
          label={t("total_income")}
          value={`${formatAmount(currentYearData?.totalIncome || 0)} UAH`}
        />
        <KpiCard
          label={t("single_tax")}
          value={`${formatAmount(currentYearData?.totalSingleTax || 0)} UAH`}
        />
        <KpiCard
          label={t("esv")}
          value={`${formatAmount(currentYearData?.totalEsv || 0)} UAH`}
        />
        <KpiCard
          label={t("military_levy")}
          value={`${formatAmount(currentYearData?.totalMilitaryLevy || 0)} UAH`}
        />
        <KpiCard
          label={t("effective_rate")}
          value={`${currentYearData?.effectiveRate || 0}`}
          suffix="%"
        />
        <KpiCard
          label={t("budget_balance")}
          value={data.budgetBalance >= 0 ? `+${formatAmount(data.budgetBalance)} UAH` : `-${formatAmount(Math.abs(data.budgetBalance))} UAH`}
          color={data.budgetBalance >= 0 ? "text-income" : "text-expense"}
        />
      </div>

      {/* Multi-year trend */}
      {trendData.length > 1 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("income_trend")}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-52">
              <figure role="img" aria-label="Графік тренду доходів та податків">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={trendData}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="name" className="text-xs" />
                  <YAxis className="text-xs" tickFormatter={(v) => `${Math.round(v / 1000)}k`} />
                  <Tooltip
                    formatter={(value, name) =>
                      name === "effectiveRate" ? `${value}%` : `${formatAmount(Number(value))} UAH`
                    }
                    contentStyle={{ backgroundColor: "var(--card)", border: "1px solid var(--border)" }}
                  />
                  <Legend />
                  <Line type="monotone" dataKey="income" name={t("income_col")} stroke={CC.uaIncome} strokeWidth={2} />
                  <Line type="monotone" dataKey="taxBurden" name={t("tax_burden")} stroke={CC.uaTax} strokeWidth={2} />
                </LineChart>
              </ResponsiveContainer>
              </figure>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Year selector + details */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">{t("declarations_detail")}</CardTitle>
            <div className="flex gap-1">
              {data.years.map((y) => (
                <button
                  key={y.year}
                  onClick={() => setSelectedYear(y.year)}
                  className={`px-2.5 py-1 rounded-md text-sm transition-colors ${
                    selectedYear === y.year
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted hover:bg-muted/80"
                  }`}
                >
                  {y.year}
                </button>
              ))}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {selectedYearData ? (
            <YearDetails year={selectedYearData} />
          ) : (
            <EmptyState title={t("no_data_for_year")} />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
