"use client";

import { createContext, useContext, useMemo, useState, type ReactNode } from "react";

type PageTitleContextValue = {
  title: string;
  setTitle: (title: string) => void;
};

const PageTitleContext = createContext<PageTitleContextValue | null>(null);

export function PageTitleProvider({ children }: { children: ReactNode }) {
  const [title, setTitle] = useState("");
  const value = useMemo(() => ({ title, setTitle }), [title]);

  return <PageTitleContext.Provider value={value}>{children}</PageTitleContext.Provider>;
}

export function usePageTitle() {
  const ctx = useContext(PageTitleContext);
  if (!ctx) {
    throw new Error("usePageTitle harus dipakai di dalam PageTitleProvider");
  }
  return ctx;
}
