"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

const STORAGE_KEY = "beadoof:activeItem";

// Target bracelet/lanyard length in inches by item id. Anything not in this
// map falls back to DEFAULT_TARGET_IN.
export const TARGET_LENGTH_IN: Record<string, number> = {
  bracelet: 7,
  lanyard: 18,
};
export const DEFAULT_TARGET_IN = 7;

type Ctx = {
  activeItemId: string;
  setActiveItemId: (id: string) => void;
  targetLengthIn: number;
};

const ActiveItemContext = createContext<Ctx | null>(null);

export function ActiveItemProvider({
  children,
  defaultId = "bracelet",
}: {
  children: ReactNode;
  defaultId?: string;
}) {
  const [activeItemId, setActiveItemId] = useState(defaultId);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) setActiveItemId(stored);
    } catch {
      // ignore storage failures
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, activeItemId);
    } catch {
      // ignore
    }
  }, [activeItemId]);

  const targetLengthIn =
    TARGET_LENGTH_IN[activeItemId] ?? DEFAULT_TARGET_IN;

  return (
    <ActiveItemContext.Provider
      value={{ activeItemId, setActiveItemId, targetLengthIn }}
    >
      {children}
    </ActiveItemContext.Provider>
  );
}

export function useActiveItem(): Ctx {
  const ctx = useContext(ActiveItemContext);
  if (!ctx) {
    throw new Error("useActiveItem must be used inside <ActiveItemProvider>");
  }
  return ctx;
}
