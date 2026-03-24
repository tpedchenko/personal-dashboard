"use client";

import { forwardRef, type ComponentPropsWithoutRef } from "react";
import { PlusIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type FabProps = ComponentPropsWithoutRef<typeof Button> & {
  "aria-label": string;
};

export const Fab = forwardRef<HTMLButtonElement, FabProps>(
  function Fab({ className, children, "aria-label": ariaLabel, ...props }, ref) {
    return (
      <Button
        ref={ref}
        size="icon"
        data-testid="fab"
        className={cn(
          "fixed bottom-20 right-4 z-50 size-14 rounded-full shadow-lg sm:hidden",
          "bg-primary text-primary-foreground hover:bg-primary/90",
          "active:scale-95 transition-transform",
          className
        )}
        aria-label={ariaLabel}
        {...props}
      >
        {children ?? <PlusIcon className="size-6" />}
      </Button>
    );
  }
);
