"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import type { CatalogProduct, ProductRules } from "@/lib/product-experience";

export interface HomeCatalogSnapshot {
  products: CatalogProduct[];
  rulesByProductId: Record<string, ProductRules>;
  loading: boolean;
  productUnavailable: boolean;
  rulesUnavailable: boolean;
}

const initialSnapshot: HomeCatalogSnapshot = {
  products: [],
  rulesByProductId: {},
  loading: true,
  productUnavailable: false,
  rulesUnavailable: false,
};

interface HomeCatalogContextValue {
  snapshot: HomeCatalogSnapshot;
  publish: (snapshot: HomeCatalogSnapshot) => void;
}

const HomeCatalogContext = createContext<HomeCatalogContextValue>({
  snapshot: initialSnapshot,
  publish: () => undefined,
});

export function HomeCatalogProvider({ children }: { children: ReactNode }) {
  const [snapshot, setSnapshot] = useState(initialSnapshot);
  const publish = useCallback((nextSnapshot: HomeCatalogSnapshot) => setSnapshot(nextSnapshot), []);
  const value = useMemo(() => ({ snapshot, publish }), [snapshot, publish]);

  return <HomeCatalogContext.Provider value={value}>{children}</HomeCatalogContext.Provider>;
}

export function useHomeCatalogSnapshot() {
  return useContext(HomeCatalogContext).snapshot;
}

export function useHomeCatalogPublisher() {
  return useContext(HomeCatalogContext).publish;
}
