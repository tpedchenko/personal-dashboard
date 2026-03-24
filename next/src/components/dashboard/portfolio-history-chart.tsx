"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { useChartColors } from "@/hooks/use-chart-colors";

export interface PortfolioHistoryPoint {
  date: string;
  totalNav: number;
  totalPnl: number;
  cashEur: number;
  investedEur: number;
}

interface PortfolioHistoryChartProps {
  data: PortfolioHistoryPoint[];
  tooltipStyle: React.CSSProperties;
  labels: {
    title: string;
    capital: string;
    pnl: string;
    invested: string;
  };
}

export function PortfolioHistoryChart({ data, tooltipStyle, labels }: PortfolioHistoryChartProps) {
  const { colors: CC } = useChartColors();

  if (data.length < 2) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{labels.title}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-48 sm:h-72">
          <figure role="img" style={{ height: "100%" }} aria-label={labels.title}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis
                  dataKey="date"
                  className="text-xs"
                  tick={{ fontSize: 10 }}
                  interval="preserveStartEnd"
                  tickFormatter={(v: string) => v.slice(5)}
                />
                <YAxis className="text-xs" />
                <Tooltip
                  contentStyle={tooltipStyle}
                  formatter={(value, name) => {
                    const label = name === "totalNav" ? labels.capital
                      : name === "totalPnl" ? labels.pnl
                      : name === "investedEur" ? labels.invested
                      : String(name);
                    return [`EUR ${Number(value).toLocaleString("en", { minimumFractionDigits: 2 })}`, label];
                  }}
                  labelFormatter={(label) => String(label)}
                />
                <Legend
                  wrapperStyle={{ fontSize: 11 }}
                  formatter={(value: string) => {
                    if (value === "totalNav") return labels.capital;
                    if (value === "totalPnl") return labels.pnl;
                    if (value === "investedEur") return labels.invested;
                    return value;
                  }}
                />
                <Line
                  type="monotone"
                  dataKey="totalNav"
                  stroke={CC.income}
                  strokeWidth={2}
                  dot={false}
                  name="totalNav"
                />
                <Line
                  type="monotone"
                  dataKey="totalPnl"
                  stroke={CC.accent}
                  strokeWidth={2}
                  dot={false}
                  name="totalPnl"
                />
                <Line
                  type="monotone"
                  dataKey="investedEur"
                  stroke={CC.difference}
                  strokeWidth={1.5}
                  strokeDasharray="5 5"
                  dot={false}
                  name="investedEur"
                />
              </LineChart>
            </ResponsiveContainer>
          </figure>
        </div>
      </CardContent>
    </Card>
  );
}
