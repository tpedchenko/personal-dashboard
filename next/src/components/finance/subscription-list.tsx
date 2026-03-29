"use client";

import { useTranslations } from "next-intl";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PencilIcon, TrashIcon, ExternalLinkIcon } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { type SubscriptionData } from "@/actions/finance/subscriptions";

interface SubscriptionListProps {
  subscriptions: SubscriptionData[];
  isPending: boolean;
  onEdit: (sub: SubscriptionData) => void;
  onDelete: (sub: SubscriptionData) => void;
  onToggleActive: (sub: SubscriptionData) => void;
}

const CYCLE_LABELS: Record<string, string> = {
  monthly: "monthly",
  yearly: "yearly",
  weekly: "weekly",
};

export function SubscriptionList({
  subscriptions,
  isPending,
  onEdit,
  onDelete,
  onToggleActive,
}: SubscriptionListProps) {
  const t = useTranslations("subscriptions");

  if (subscriptions.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-muted-foreground">
          {t("no_subscriptions")}
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {subscriptions.map((sub) => (
        <Card
          key={sub.id}
          className={sub.isActive ? "" : "opacity-60"}
        >
          <CardContent className="p-4 space-y-3">
            {/* Header: name + provider */}
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <h3 className="font-semibold truncate">{sub.name}</h3>
                <p className="text-sm text-muted-foreground truncate">{sub.provider}</p>
              </div>
              <Badge variant={sub.isActive ? "default" : "secondary"}>
                {sub.isActive ? t("active") : t("inactive")}
              </Badge>
            </div>

            {/* Amount + billing cycle */}
            <div className="flex items-baseline gap-1.5">
              <span className="text-xl font-bold tabular-nums">
                {sub.amount.toFixed(2)}
              </span>
              <span className="text-sm text-muted-foreground">
                {sub.currency}
              </span>
              <span className="text-sm text-muted-foreground">
                / {t(CYCLE_LABELS[sub.billingCycle] as Parameters<typeof t>[0] ?? "monthly")}
              </span>
            </div>

            {/* Details */}
            <div className="space-y-1 text-sm text-muted-foreground">
              {sub.category && (
                <div className="flex justify-between">
                  <span>{t("category")}:</span>
                  <span className="capitalize">
                    {t.has(sub.category) ? t(sub.category as Parameters<typeof t>[0]) : sub.category}
                  </span>
                </div>
              )}
              {sub.nextBilling && (
                <div className="flex justify-between">
                  <span>{t("next_billing")}:</span>
                  <span>{sub.nextBilling}</span>
                </div>
              )}
              {sub.notes && (
                <p className="pt-1 text-xs italic">{sub.notes}</p>
              )}
            </div>

            {/* Actions */}
            <div className="flex items-center justify-between pt-1 border-t">
              <div className="flex items-center gap-2">
                <Switch
                  checked={sub.isActive}
                  onCheckedChange={() => onToggleActive(sub)}
                  disabled={isPending}
                  aria-label={sub.isActive ? t("active") : t("inactive")}
                />
              </div>
              <div className="flex items-center gap-1">
                {sub.url && (
                  <a
                    href={sub.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                  >
                    <ExternalLinkIcon className="h-4 w-4" />
                  </a>
                )}
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => onEdit(sub)}
                  disabled={isPending}
                >
                  <PencilIcon className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-destructive hover:text-destructive"
                  onClick={() => onDelete(sub)}
                  disabled={isPending}
                >
                  <TrashIcon className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
