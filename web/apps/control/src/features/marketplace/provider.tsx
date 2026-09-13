import {
  createContext,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createMarketplaceApi } from "./api";
import type { DataSource, MarketplaceApi, ResourceKind } from "./contracts";

const Context = createContext<{
  api: MarketplaceApi;
  source: DataSource;
  configured: boolean;
} | null>(null);
export function MarketplaceProvider({
  children,
  client,
}: {
  children: ReactNode;
  client?: MarketplaceApi;
}) {
  const configured = Boolean(
    import.meta.env.VITE_MARKETPLACE_API_BASE_URL?.trim(),
  );
  const [source, setSource] = useState<DataSource>(configured ? "api" : "mock");
  const queryClient = useQueryClient();
  const api = useMemo(() => {
    let storage: Storage | undefined;
    try {
      if (typeof window !== "undefined") storage = window.localStorage;
    } catch {
      /* In-memory preview remains usable. */
    }
    const delegate =
      client ??
      createMarketplaceApi({
        ...(storage ? { storage } : {}),
        ...(configured
          ? { baseUrl: import.meta.env.VITE_MARKETPLACE_API_BASE_URL }
          : {}),
      });
    let lastSource: DataSource = configured ? "api" : "mock";
    const update = (next: DataSource) => {
      setSource(next);
      if (next !== lastSource) {
        lastSource = next;
        // Re-query previously loaded tabs when the client falls back to local data.
        void queryClient.invalidateQueries({ queryKey: ["marketplace"] });
      }
    };
    const wrap = async <T,>(
      request: Promise<{ data: T; source: DataSource }>,
    ) => {
      const result = await request;
      update(result.source);
      return result;
    };
    return {
      list: (kind) => wrap(delegate.list(kind)),
      get: (kind, id) => wrap(delegate.get(kind, id)),
      create: (kind, input) => wrap(delegate.create(kind, input)),
    } satisfies MarketplaceApi;
  }, [client, configured, queryClient]);
  return (
    <Context.Provider value={{ api, source, configured }}>
      {children}
    </Context.Provider>
  );
}
export function useMarketplace() {
  const context = useContext(Context);
  if (!context) throw new Error("MarketplaceProvider is required.");
  return context;
}
export function useMarketplaceCollection(kind: ResourceKind) {
  const { api } = useMarketplace();
  return useQuery({
    queryKey: ["marketplace", kind],
    queryFn: () => api.list(kind),
    retry: false,
    staleTime: 30_000,
  });
}
