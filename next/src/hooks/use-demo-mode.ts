"use client";

import { useState, useEffect } from "react";
import { isDemoMode } from "@/actions/settings";

export function useDemoMode() {
  const [isDemo, setIsDemo] = useState(false);
  useEffect(() => {
    isDemoMode().then(setIsDemo);
  }, []);
  return isDemo;
}
