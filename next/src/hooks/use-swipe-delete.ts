"use client";

import { useRef, useCallback } from "react";
import { toast } from "sonner";

interface SwipeDeleteOptions {
  onDelete: () => void;
  threshold?: number;
  undoLabel?: string;
  deleteMessage?: string;
  undoDuration?: number;
}

export function useSwipeDelete({
  onDelete,
  threshold = 100,
  undoLabel = "Undo",
  deleteMessage = "Deleted",
  undoDuration = 4000,
}: SwipeDeleteOptions) {
  const startX = useRef(0);
  const currentX = useRef(0);
  const swiping = useRef(false);
  const elementRef = useRef<HTMLDivElement>(null);

  const onTouchStart = useCallback((e: React.TouchEvent) => {
    startX.current = e.touches[0].clientX;
    swiping.current = true;
    if (elementRef.current) {
      elementRef.current.style.transition = "none";
    }
  }, []);

  const onTouchMove = useCallback((e: React.TouchEvent) => {
    if (!swiping.current) return;
    currentX.current = e.touches[0].clientX;
    const diff = currentX.current - startX.current;
    if (diff < 0 && elementRef.current) {
      // Only allow left swipe
      elementRef.current.style.transform = `translateX(${Math.max(diff, -threshold)}px)`;
    }
  }, [threshold]);

  const onTouchEnd = useCallback(() => {
    swiping.current = false;
    const diff = currentX.current - startX.current;
    if (elementRef.current) {
      elementRef.current.style.transition = "transform 0.2s ease-out";
      if (diff < -threshold) {
        elementRef.current.style.transform = `translateX(-100%)`;

        // Hide the element visually after slide-out animation
        const el = elementRef.current;
        const originalDisplay = el.style.display;
        const originalTransform = el.style.transform;
        const originalTransition = el.style.transition;
        const originalHeight = el.style.height;
        const originalOverflow = el.style.overflow;
        const originalPadding = el.style.padding;
        const originalMargin = el.style.margin;
        const originalOpacity = el.style.opacity;

        setTimeout(() => {
          el.style.height = "0";
          el.style.overflow = "hidden";
          el.style.padding = "0";
          el.style.margin = "0";
          el.style.opacity = "0";
          el.style.transition = "height 0.2s ease-out, padding 0.2s ease-out, margin 0.2s ease-out, opacity 0.2s ease-out";
        }, 200);

        let undone = false;

        toast(deleteMessage, {
          duration: undoDuration,
          action: {
            label: undoLabel,
            onClick: () => {
              undone = true;
              // Restore the element
              el.style.display = originalDisplay;
              el.style.height = originalHeight;
              el.style.overflow = originalOverflow;
              el.style.padding = originalPadding;
              el.style.margin = originalMargin;
              el.style.opacity = originalOpacity;
              el.style.transform = "translateX(0)";
              el.style.transition = originalTransition || "transform 0.2s ease-out";
            },
          },
          onAutoClose: () => {
            if (!undone) {
              onDelete();
            }
          },
          onDismiss: () => {
            if (!undone) {
              onDelete();
            }
          },
        });
      } else {
        elementRef.current.style.transform = "translateX(0)";
      }
    }
    currentX.current = 0;
  }, [onDelete, threshold, undoLabel, deleteMessage, undoDuration]);

  return { elementRef, onTouchStart, onTouchMove, onTouchEnd };
}
