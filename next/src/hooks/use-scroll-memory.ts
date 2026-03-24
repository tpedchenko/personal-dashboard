"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

export function useScrollMemory() {
  const pathname = usePathname();

  useEffect(() => {
    // Restore scroll position
    const saved = sessionStorage.getItem(`scroll:${pathname}`);
    if (saved) {
      window.scrollTo(0, parseInt(saved, 10));
    }

    // Save scroll position on scroll
    const handleScroll = () => {
      sessionStorage.setItem(`scroll:${pathname}`, String(window.scrollY));
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, [pathname]);
}
