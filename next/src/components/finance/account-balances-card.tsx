"use client";

import { useTranslations } from "next-intl";
import Link from "next/link";
import { WalletIcon, CreditCardIcon } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/shared/empty-state";
import type { AccountBalanceData } from "./finance-types";

export interface AccountBalancesCardProps {
  accountBalances: AccountBalanceData[];
}

export function AccountBalancesCard({ accountBalances }: AccountBalancesCardProps) {
  const t = useTranslations("finance");
  const tc = useTranslations("common");

  const grouped = new Map<string, AccountBalanceData[]>();
  for (const ab of accountBalances) {
    const group = grouped.get(ab.currency) ?? [];
    group.push(ab);
    grouped.set(ab.currency, group);
  }

  return (
    <Card size="sm">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm">
          <WalletIcon className="size-4" />
          {t("account_balances")}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {accountBalances.length === 0 ? (
          <EmptyState
            icon={CreditCardIcon}
            title={tc("no_data")}
            description={t("connect_bank_hint") || "Connect a bank account to see balances"}
            compact
          />
        ) : (
          Array.from(grouped.entries()).map(([currency, accs]) => (
            <div key={currency} className="mb-3 last:mb-0">
              <div className="mb-1.5 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                {currency}
              </div>
              <div className="space-y-1">
                {accs.map((ab) => (
                  <div
                    key={ab.name}
                    className="flex items-center justify-between text-sm py-0.5"
                  >
                    <Link
                      href={`/finance/transactions?account=${encodeURIComponent(ab.name)}`}
                      className="truncate hover:underline text-muted-foreground hover:text-foreground transition-colors"
                    >
                      {ab.name}
                    </Link>
                    <span
                      className={`font-semibold tabular-nums ${
                        ab.balance >= 0
                          ? "text-income"
                          : "text-expense"
                      }`}
                    >
                      {ab.balance.toLocaleString("en", {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}
