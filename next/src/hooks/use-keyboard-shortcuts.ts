"use client";

import { useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";

/**
 * Check whether the active element is an input/textarea/select/contenteditable
 * so we can skip shortcuts while the user is typing.
 */
function isTyping(): boolean {
  const el = document.activeElement as HTMLElement | null;
  if (!el) return false;
  const tag = el.tagName;
  return (
    tag === "INPUT" ||
    tag === "TEXTAREA" ||
    tag === "SELECT" ||
    el.isContentEditable
  );
}

/**
 * Global keyboard shortcuts for the dashboard.
 * Handles navigation (1-8) across all pages.
 */
export function useKeyboardShortcuts() {
  const router = useRouter();

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (isTyping()) return;

      switch (e.key) {
        case "1":
          router.push("/finance");
          break;
        case "2":
          router.push("/dashboard");
          break;
        case "3":
          router.push("/gym");
          break;
        case "4":
          router.push("/my-day");
          break;
        case "5":
          router.push("/food");
          break;
        case "6":
          router.push("/list");
          break;
        case "7":
          router.push("/ai-chat");
          break;
        case "8":
          router.push("/settings");
          break;
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [router]);
}

/**
 * Page-level keyboard shortcuts.
 *
 * Accepts a map of `key → callback`. The callbacks are only triggered when
 * no input / textarea / select / contenteditable is focused.
 *
 * @example
 *   usePageShortcuts({
 *     n: () => setDialogOpen(true),
 *     Escape: () => setDialogOpen(false),
 *   });
 */
export function usePageShortcuts(shortcuts: Record<string, () => void>) {
  // Wrap in useCallback-compatible ref to avoid re-attaching on every render
  const shortcutsRef = useCallback(
    (e: KeyboardEvent) => {
      if (isTyping() && e.key !== "Escape") return;

      const handler = shortcuts[e.key];
      if (handler) {
        e.preventDefault();
        handler();
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [shortcuts],
  );

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      shortcutsRef(e);
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [shortcutsRef]);
}
