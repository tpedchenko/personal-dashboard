"use client";

import { useTranslations } from "next-intl";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  PencilIcon,
  TrashIcon,
  ExternalLinkIcon,
  TimerIcon,
  CheckCircleIcon,
  ShoppingCartIcon,
  XCircleIcon,
  SearchIcon,
} from "lucide-react";
import { type BigPurchaseData } from "@/actions/finance/shopping";

const STATUS_VARIANT: Record<string, "default" | "secondary" | "outline" | "destructive"> = {
  investigating: "outline",
  cooling_off: "secondary",
  ready: "default",
  purchased: "default",
  cancelled: "destructive",
};

interface ShoppingCardProps {
  item: BigPurchaseData;
  isPending: boolean;
  onEdit: (item: BigPurchaseData) => void;
  onStartCooling: (item: BigPurchaseData) => void;
  onConfirm: (item: BigPurchaseData) => void;
  onMarkPurchased: (item: BigPurchaseData) => void;
  onCancel: (item: BigPurchaseData) => void;
  onDelete: (item: BigPurchaseData) => void;
}

function formatTimeRemaining(endsAt: string): string {
  const now = new Date();
  const end = new Date(endsAt);
  const diff = end.getTime() - now.getTime();

  if (diff <= 0) return "0d";

  const days = Math.floor(diff / 86400000);
  const hours = Math.floor((diff % 86400000) / 3600000);

  if (days > 0) return `${days}d ${hours}h`;
  return `${hours}h`;
}

export function ShoppingCard({
  item,
  isPending,
  onEdit,
  onStartCooling,
  onConfirm,
  onMarkPurchased,
  onCancel,
  onDelete,
}: ShoppingCardProps) {
  const t = useTranslations("big_purchases");

  const isTerminal = item.status === "purchased" || item.status === "cancelled";

  return (
    <Card className={isTerminal ? "opacity-60" : ""}>
      <CardContent className="p-4 space-y-3">
        {/* Header */}
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h3 className="font-semibold truncate">{item.name}</h3>
            {item.category && (
              <p className="text-sm text-muted-foreground capitalize truncate">
                {t.has(`cat_${item.category}`)
                  ? t(`cat_${item.category}` as Parameters<typeof t>[0])
                  : item.category}
              </p>
            )}
          </div>
          <Badge variant={STATUS_VARIANT[item.status] || "outline"}>
            {t(`status_${item.status}`)}
          </Badge>
        </div>

        {/* Price */}
        {item.estimatedPrice != null && (
          <div className="flex items-baseline gap-1.5">
            <span className="text-xl font-bold tabular-nums">
              {item.estimatedPrice.toFixed(2)}
            </span>
            <span className="text-sm text-muted-foreground">{item.currency}</span>
          </div>
        )}

        {/* Description */}
        {item.description && (
          <p className="text-sm text-muted-foreground line-clamp-2">{item.description}</p>
        )}

        {/* Cooling timer */}
        {item.status === "cooling_off" && item.coolingEndsAt && (
          <div className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm">
            <TimerIcon className="h-4 w-4 text-muted-foreground shrink-0" />
            {item.coolingComplete ? (
              <span className="text-green-600 dark:text-green-400 font-medium">
                {t("cooling_complete")}
              </span>
            ) : (
              <span>
                {t("cooling_remaining", { time: formatTimeRemaining(item.coolingEndsAt) })}
              </span>
            )}
          </div>
        )}

        {/* Investigate notes preview */}
        {item.investigateNotes && (
          <div className="rounded-md border px-3 py-2">
            <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground mb-1">
              <SearchIcon className="h-3 w-3" />
              {t("research_notes")}
            </div>
            <p className="text-sm line-clamp-3">{item.investigateNotes}</p>
          </div>
        )}

        {/* Status info */}
        <div className="space-y-1 text-sm text-muted-foreground">
          {item.purchasedAt && (
            <div className="flex justify-between">
              <span>{t("purchased_on")}:</span>
              <span>{new Date(item.purchasedAt).toLocaleDateString()}</span>
            </div>
          )}
          {item.confirmedAt && !item.purchasedAt && (
            <div className="flex justify-between">
              <span>{t("confirmed_on")}:</span>
              <span>{new Date(item.confirmedAt).toLocaleDateString()}</span>
            </div>
          )}
        </div>

        {/* Action buttons based on status */}
        {!isTerminal && (
          <div className="flex flex-wrap gap-1.5 pt-1 border-t">
            {item.status === "investigating" && (
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5"
                onClick={() => onStartCooling(item)}
                disabled={isPending}
              >
                <TimerIcon className="h-3.5 w-3.5" />
                {t("start_cooling")}
              </Button>
            )}

            {item.status === "cooling_off" && item.coolingComplete && (
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5"
                onClick={() => onConfirm(item)}
                disabled={isPending}
              >
                <CheckCircleIcon className="h-3.5 w-3.5" />
                {t("confirm_need")}
              </Button>
            )}

            {item.status === "ready" && (
              <Button
                variant="default"
                size="sm"
                className="gap-1.5"
                onClick={() => onMarkPurchased(item)}
                disabled={isPending}
              >
                <ShoppingCartIcon className="h-3.5 w-3.5" />
                {t("mark_purchased")}
              </Button>
            )}

            <Button
              variant="ghost"
              size="sm"
              className="gap-1.5 text-destructive hover:text-destructive"
              onClick={() => onCancel(item)}
              disabled={isPending}
            >
              <XCircleIcon className="h-3.5 w-3.5" />
              {t("cancel_item")}
            </Button>
          </div>
        )}

        {/* Bottom actions */}
        <div className="flex items-center justify-end gap-1 pt-1 border-t">
          {item.url && (
            <a
              href={item.url}
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
            onClick={() => onEdit(item)}
            disabled={isPending}
          >
            <PencilIcon className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-destructive hover:text-destructive"
            onClick={() => onDelete(item)}
            disabled={isPending}
          >
            <TrashIcon className="h-4 w-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
