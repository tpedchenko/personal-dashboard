"use client";

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from "react";
import { getEnabledModules } from "@/actions/settings";
import { ALL_MODULE_KEYS } from "@/lib/modules";

interface EnabledModulesContextValue {
  enabledModules: string[];
  isLoaded: boolean;
  refresh: () => Promise<void>;
}

const EnabledModulesContext = createContext<EnabledModulesContextValue>({
  enabledModules: ALL_MODULE_KEYS,
  isLoaded: false,
  refresh: async () => {},
});

export function EnabledModulesProvider({ children }: { children: ReactNode }) {
  const [enabledModules, setEnabledModules] = useState<string[]>(ALL_MODULE_KEYS);
  const [isLoaded, setIsLoaded] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const modules = await getEnabledModules();
      setEnabledModules(modules);
    } catch {
      // Keep defaults on error
    } finally {
      setIsLoaded(true);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return (
    <EnabledModulesContext.Provider value={{ enabledModules, isLoaded, refresh }}>
      {children}
    </EnabledModulesContext.Provider>
  );
}

export function useEnabledModules() {
  return useContext(EnabledModulesContext);
}
