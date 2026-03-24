"use client";

import { useState, useCallback, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ChevronDownIcon, ChevronRightIcon, ChevronLeftIcon } from "lucide-react";
import { EsTaxDashboard } from "./es-tax-dashboard";
import { getEsTaxOverview, type EsTaxOverview } from "@/actions/reporting/es-tax";

interface EsTaxSectionProps {
  initialData: EsTaxOverview;
}

export function EsTaxSection({ initialData }: EsTaxSectionProps) {
  const [open, setOpen] = useState(true);
  const [data, setData] = useState(initialData);
  const [year, setYear] = useState(initialData.year);
  const [, startTransition] = useTransition();
  const router = useRouter();

  const loadYear = useCallback((y: number) => {
    setYear(y);
    startTransition(async () => {
      const fresh = await getEsTaxOverview(y);
      setData(fresh);
    });
  }, []);

  const handleRefresh = useCallback(() => {
    startTransition(async () => {
      const fresh = await getEsTaxOverview(year);
      setData(fresh);
    });
    router.refresh();
  }, [router, year]);

  const currentYear = new Date().getFullYear();

  return (
    <Card>
      <CardHeader
        className="cursor-pointer select-none"
        onClick={() => setOpen(!open)}
      >
        <CardTitle className="text-base flex items-center gap-2">
          {open ? <ChevronDownIcon className="size-4" /> : <ChevronRightIcon className="size-4" />}
          🇪🇸 Іспанія — IRPF {year}
          <div className="ml-auto flex items-center gap-1" onClick={e => e.stopPropagation()}>
            {[currentYear - 2, currentYear - 1, currentYear].map(y => (
              <Button
                key={y}
                variant={y === year ? "default" : "outline"}
                size="sm"
                className="h-7 px-2.5 text-xs"
                onClick={() => loadYear(y)}
              >
                {y}
              </Button>
            ))}
            {data.monthsUploaded > 0 && (
              <span className="text-xs text-muted-foreground ml-2">
                {data.monthsUploaded}/12 nóminas
              </span>
            )}
          </div>
        </CardTitle>
      </CardHeader>
      {open && (
        <div className="px-6 pb-6">
          <EsTaxDashboard overview={data} onRefresh={handleRefresh} />
        </div>
      )}
    </Card>
  );
}
