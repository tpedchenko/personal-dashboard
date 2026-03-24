"use client";

import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { useChartColors } from "@/hooks/use-chart-colors";

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

export interface IncomeExpensesChartProps {
  chartData: { name: string; income: number; expenses: number; expensesByCategory?: Record<string, number> }[];
  titleLabel: string;
  tooltipStyle: React.CSSProperties;
  incomeLabel?: string;
  expensesLabel?: string;
}

/* ------------------------------------------------------------------ */
/* Category colors                                                     */
/* ------------------------------------------------------------------ */

const CATEGORY_COLORS = [
  "#ef4444", "#f97316", "#f59e0b", "#84cc16", "#22c55e",
  "#14b8a6", "#06b6d4", "#3b82f6", "#8b5cf6", "#ec4899",
];

/* ------------------------------------------------------------------ */
/* Component                                                           */
/* ------------------------------------------------------------------ */

export function IncomeExpensesChart({
  chartData,
  titleLabel,
  tooltipStyle,
  incomeLabel = "Income",
  expensesLabel = "Expenses",
}: IncomeExpensesChartProps) {
  const { colors: CC } = useChartColors();

  // Collect all unique expense categories across all months
  const allCategories = useMemo(() => {
    const catSet = new Set<string>();
    for (const d of chartData) {
      if (d.expensesByCategory) {
        for (const cat of Object.keys(d.expensesByCategory)) catSet.add(cat);
      }
    }
    return Array.from(catSet);
  }, [chartData]);

  // Flatten data: income bar + stacked expense category bars
  const flatData = useMemo(() => {
    return chartData.map((d) => {
      const row: Record<string, string | number> = { name: d.name, income: d.income };
      if (d.expensesByCategory && allCategories.length > 0) {
        for (const cat of allCategories) {
          row[`exp_${cat}`] = d.expensesByCategory[cat] ?? 0;
        }
      } else {
        row.expenses = d.expenses;
      }
      return row;
    });
  }, [chartData, allCategories]);

  const hasCategories = allCategories.length > 0;

  const totalIncome = chartData.reduce((s, d) => s + d.income, 0);
  const totalExpenses = chartData.reduce((s, d) => s + d.expenses, 0);
  const totalDiff = Math.round((totalIncome - totalExpenses) * 100) / 100;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center justify-between">
          <span>{titleLabel}</span>
          <span className={`text-sm font-medium ${totalDiff >= 0 ? "text-green-500" : "text-red-500"}`}>
            {totalDiff >= 0 ? "+" : ""}{totalDiff.toLocaleString("en")} EUR
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-48 sm:h-72">
          <figure role="img" style={{ height: "100%" }} aria-label="Графік доходів та витрат">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={flatData}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
              <XAxis dataKey="name" className="text-xs" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
              <YAxis className="text-xs" />
              <Tooltip
                contentStyle={tooltipStyle}
                formatter={(value, name) => {
                  const label = name === "income" ? incomeLabel
                    : name === "expenses" ? expensesLabel
                    : String(name).startsWith("exp_") ? String(name).slice(4)
                    : String(name);
                  return [`EUR ${Number(value).toLocaleString("en")}`, label];
                }}
              />
              <Legend
                wrapperStyle={{ fontSize: 11 }}
                formatter={(value: string) => {
                  if (value === "income") return incomeLabel;
                  if (value === "expenses") return expensesLabel;
                  if (value.startsWith("exp_")) return value.slice(4);
                  return value;
                }}
              />
              <Bar dataKey="income" fill={CC.income} radius={[4, 4, 0, 0]} name="income" />
              {hasCategories ? (
                allCategories.map((cat, i) => (
                  <Bar
                    key={cat}
                    dataKey={`exp_${cat}`}
                    stackId="expenses"
                    fill={CATEGORY_COLORS[i % CATEGORY_COLORS.length]}
                    name={`exp_${cat}`}
                  />
                ))
              ) : (
                <Bar dataKey="expenses" fill={CC.expense} radius={[4, 4, 0, 0]} name="expenses" />
              )}
            </BarChart>
          </ResponsiveContainer>
          </figure>
        </div>
      </CardContent>
    </Card>
  );
}
