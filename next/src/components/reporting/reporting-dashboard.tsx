"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CalendarIcon, FileTextIcon, AlertCircleIcon, ChevronDownIcon, ChevronRightIcon } from "lucide-react";
import { EmptyState } from "@/components/shared/empty-state";

type Declaration = {
  id: string;
  country: string;
  type: string;
  period: string;
  year: number;
  status: string;
  submittedAt: Date | null;
  receipt: { status: string; receiptNumber: string | null } | null;
};

type Deadline = {
  id: string;
  country: string;
  type: string;
  period: string;
  dueDate: Date;
  description: string;
};

interface ReportingDashboardProps {
  overview: {
    declarations: Declaration[];
    deadlines: Deadline[];
    totalIncomeUA: number;
    totalIncomeES: number;
    currentYear: number;
  };
}

const statusColors: Record<string, string> = {
  draft: "bg-gray-500/15 text-gray-600",
  signed: "bg-blue-500/15 text-blue-600",
  submitted: "bg-yellow-500/15 text-yellow-600",
  accepted: "bg-green-500/15 text-green-600",
  rejected: "bg-red-500/15 text-red-600",
};

function CountrySection({
  country,
  flag,
  declarations,
  deadlines,
  totalIncome,
  currencySymbol,
  year,
  t,
}: {
  country: string;
  flag: string;
  declarations: Declaration[];
  deadlines: Deadline[];
  totalIncome: number;
  currencySymbol: string;
  year: number;
  t: (key: string) => string;
}) {
  const [open, setOpen] = useState(true);
  const formatDate = (d: Date) => new Date(d).toLocaleDateString();
  const daysUntil = (d: Date) => Math.ceil((new Date(d).getTime() - Date.now()) / 86400000);

  return (
    <Card>
      <CardHeader
        className="cursor-pointer select-none"
        onClick={() => setOpen(!open)}
      >
        <CardTitle className="text-base flex items-center gap-2">
          {open ? <ChevronDownIcon className="size-4" /> : <ChevronRightIcon className="size-4" />}
          {flag} {country}
          <Badge variant="secondary" className="ml-auto text-xs">
            {declarations.length} {t("declarations")} · {totalIncome.toLocaleString("en")} {currencySymbol}
          </Badge>
        </CardTitle>
      </CardHeader>
      {open && (
        <CardContent className="space-y-4">
          {/* Deadlines */}
          {deadlines.length > 0 && (
            <div>
              <h4 className="text-sm font-medium mb-2 flex items-center gap-1">
                <CalendarIcon className="size-3.5" /> {t("deadlines")}
              </h4>
              <div className="space-y-1.5">
                {deadlines.map((d) => {
                  const days = daysUntil(d.dueDate);
                  return (
                    <div key={d.id} className="flex items-center justify-between py-1.5 text-sm border-b last:border-0">
                      <span>{d.description} <span className="text-muted-foreground">({d.type})</span></span>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground">{formatDate(d.dueDate)}</span>
                        <Badge variant={days <= 7 ? "destructive" : days <= 30 ? "secondary" : "default"} className="text-[10px] whitespace-nowrap">
                          {days <= 0 ? t("overdue") : `${days} ${t("days_left")}`}
                        </Badge>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Declarations */}
          <div>
            <h4 className="text-sm font-medium mb-2 flex items-center gap-1">
              <FileTextIcon className="size-3.5" /> {t("declarations")} {year}
            </h4>
            {declarations.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("no_declarations")}</p>
            ) : (
              <div className="space-y-1.5">
                {declarations.map((d) => (
                  <div key={d.id} className="flex items-center justify-between py-1.5 text-sm border-b last:border-0">
                    <div>
                      <span className="font-medium">{d.type}</span>
                      <span className="ml-2 text-muted-foreground">{d.period}</span>
                      <Badge className={`ml-2 text-[10px] ${statusColors[d.status] || ""}`}>{t(`status_${d.status}`)}</Badge>
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {d.submittedAt ? formatDate(d.submittedAt) : ""}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </CardContent>
      )}
    </Card>
  );
}

export function ReportingDashboard({ overview }: ReportingDashboardProps) {
  const t = useTranslations("reporting");
  const uaDeclarations = overview.declarations.filter((d) => d.country === "UA");
  const esDeclarations = overview.declarations.filter((d) => d.country === "ES");
  const uaDeadlines = overview.deadlines.filter((d) => d.country === "UA");
  const esDeadlines = overview.deadlines.filter((d) => d.country === "ES");

  return (
    <div className="space-y-4">
      <h1 className="text-xl sm:text-2xl font-bold">{t("title")}</h1>

      {/* KPI Summary */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card size="sm">
          <CardContent>
            <div className="text-xs text-muted-foreground">{t("declarations")} {overview.currentYear}</div>
            <div className="text-lg font-semibold">{overview.declarations.length}</div>
          </CardContent>
        </Card>
        <Card size="sm">
          <CardContent>
            <div className="text-xs text-muted-foreground">{t("upcoming_deadlines")}</div>
            <div className="text-lg font-semibold text-amber-600">{overview.deadlines.length}</div>
          </CardContent>
        </Card>
        <Card size="sm">
          <CardContent>
            <div className="text-xs text-muted-foreground">{t("income_ua")}</div>
            <div className="text-lg font-semibold">UAH {overview.totalIncomeUA.toLocaleString("en")}</div>
          </CardContent>
        </Card>
        <Card size="sm">
          <CardContent>
            <div className="text-xs text-muted-foreground">{t("income_es")}</div>
            <div className="text-lg font-semibold">EUR {overview.totalIncomeES.toLocaleString("en")}</div>
          </CardContent>
        </Card>
      </div>

      {/* UA Section */}
      <CountrySection
        country={t("ukraine_fop")}
        flag="🇺🇦"
        declarations={uaDeclarations}
        deadlines={uaDeadlines}
        totalIncome={overview.totalIncomeUA}
        currencySymbol="UAH"
        year={overview.currentYear}
        t={t}
      />

      {/* ES Section */}
      <CountrySection
        country={t("spain_irpf")}
        flag="🇪🇸"
        declarations={esDeclarations}
        deadlines={esDeadlines}
        totalIncome={overview.totalIncomeES}
        currencySymbol="EUR"
        year={overview.currentYear}
        t={t}
      />

      {/* Empty state */}
      {overview.declarations.length === 0 && overview.deadlines.length === 0 && (
        <Card className="p-8">
          <EmptyState
            icon={AlertCircleIcon}
            title={t("no_data_hint")}
            action={
              <a href="/settings/integrations/tax-ua" className="inline-flex items-center justify-center rounded-md text-sm font-medium border bg-background hover:bg-accent px-3 py-1.5">
                {t("configure")}
              </a>
            }
          />
        </Card>
      )}
    </div>
  );
}
