"use client";

import type { ShoppingItem } from "@/generated/prisma/client";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Trash2 } from "lucide-react";

interface ShoppingItemRowProps {
  item: ShoppingItem;
  bought: boolean;
  onToggle: (id: number) => void;
  onDelete: (id: number) => void;
}

export function ShoppingItemRow({
  item,
  bought,
  onToggle,
  onDelete,
}: ShoppingItemRowProps) {
  return (
    <li className="flex items-center gap-3 rounded-lg px-3 py-2 transition-colors hover:bg-muted/50">
      <Checkbox
        checked={bought}
        onCheckedChange={() => onToggle(item.id)}
      />
      <span
        className={
          bought
            ? "text-muted-foreground flex-1 text-sm line-through"
            : "flex-1 text-sm"
        }
      >
        {item.itemName}
      </span>
      {item.quantity && item.quantity !== "1" && (
        <span className="text-muted-foreground text-xs">
          {item.quantity}
        </span>
      )}
      <Button
        variant="ghost"
        size="icon-xs"
        onClick={() => onDelete(item.id)}
      >
        <Trash2 className="size-3.5 text-muted-foreground" />
      </Button>
    </li>
  );
}
