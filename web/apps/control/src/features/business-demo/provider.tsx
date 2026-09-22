import {
  createContext,
  useContext,
  useEffect,
  useState,
  useRef,
  type ReactNode,
} from "react";
import {
  advanceProcessing,
  restoreIntegratedEntities,
  saveEntity,
  deletionBlocker,
  STORAGE_KEY,
  OWNER_STORAGE_KEY,
  type Draft,
  type Entity,
  type Kind,
} from "./model";
import {
  GuardAdapter,
  GuardApiError,
  SavedDraftError,
  jsonRequest,
  mayUseMock,
  runtimeSchema,
  type RuntimeConfig,
} from "./guard-api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MultiSourceAdapter } from "./multi-source-api";
import { saveBusinessPolicy, configurePolicy, type DemoRole, type WorkflowAction } from "./policy-workflow";
import { MarketplaceAdapter } from "./marketplace-adapter";

const DemoContext = createContext<{
  items: Entity[];
  sessionOnly: boolean;
  mode: "mock" | "live";
  policyAuthoring: boolean;
  dualSource?: boolean;
  crudOnly?: boolean;
  role?: DemoRole;
  switchRole?: (role: DemoRole) => void;
  configure?: (id: string, action: WorkflowAction, configs: Record<string, string>, comment?: string) => void;
  retrySync?: (item: Entity) => Promise<void>;
  connection?: ReactNode;
  busy?: boolean;
  currentOwner?: string;
  owners?: string[];
  switchOwner?: (owner: string) => void;
  disconnect?: () => void;
  publish?: (item: Entity) => Promise<void>;
  validate?: (item: Entity) => Promise<void>;
  remove?: (item: Entity) => void | Promise<void>;
  setActivation?: (item: Entity, active: boolean) => void | Promise<void>;
  save: (
    kind: Kind,
    draft: Draft,
    submit: boolean,
    existing?: Entity,
  ) => Entity | Promise<Entity>;
} | null>(null);

export function BusinessDemoProvider({
  children,
  config: supplied,
}: {
  children: ReactNode;
  config?: RuntimeConfig;
}) {
  const [config, setConfig] = useState(supplied);
  const [error, setError] = useState("");
  const [fallback, setFallback] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (supplied) return;
    let active = true;
    setError("");
    jsonRequest("/api/marketplace-config", "")
      .then(runtimeSchema.parse)
      .then((value) => {
        if (active) setConfig(value);
      })
      .catch(() => {
        if (active) setError("Cannot load connection settings.");
      });
    return () => {
      active = false;
    };
  }, [supplied, attempt]);
  if (!config)
    return (
      <div className="p-6" role={error ? "alert" : "status"}>
        {error || "Loading…"}
        {error && (
          <Button className="ml-3" onClick={() => setAttempt((n) => n + 1)}>
            Retry
          </Button>
        )}
      </div>
    );
  if (config.mode === "mock" || fallback)
    return (
      <MockProvider
        connection={
          fallback && (
            <div
              role="status"
              className="flex items-center gap-3 border-b bg-amber-50 px-6 py-2 text-sm"
            >
              Offline · Local data
              <Button
                variant="outline"
                size="sm"
                onClick={() => setFallback(false)}
              >
                Reconnect
              </Button>
            </div>
          )
        }
      >
        {children}
      </MockProvider>
    );
  return (
    <LiveProvider config={config} onFallback={() => setFallback(true)}>
      {children}
    </LiveProvider>
  );
}

function MockProvider({
  children,
  connection,
}: {
  children: ReactNode;
  connection?: ReactNode;
}) {
  const [role, setRole] = useState<DemoRole>(() => {
    try { return localStorage.getItem("marketplace.demo.role") === "Agent Wizard" ? "Agent Wizard" : "User"; } catch { return "User"; }
  });
  function switchRole(next: DemoRole) { setRole(next); try { localStorage.setItem("marketplace.demo.role", next); } catch { /* Session still works. */ } }
  const [items, setItems] = useState(() => {
    try {
      return restoreIntegratedEntities(localStorage.getItem(STORAGE_KEY));
    } catch {
      return restoreIntegratedEntities(null);
    }
  });
  const [sessionOnly, setSessionOnly] = useState(false);
  const owners = [
    ...new Set(["Admin", ...items.map((item) => item.owner).filter(Boolean)]),
  ];
  const [currentOwner, setCurrentOwner] = useState(() => {
    try {
      const saved = localStorage.getItem(OWNER_STORAGE_KEY);
      return saved && owners.includes(saved) ? saved : "Admin";
    } catch {
      return "Admin";
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(OWNER_STORAGE_KEY, currentOwner);
    } catch {
      /* Switching still works for this session. */
    }
  }, [currentOwner]);
  function switchOwner(owner: string) {
    if (owners.includes(owner)) setCurrentOwner(owner);
  }
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 3, items }));
      setSessionOnly(false);
    } catch {
      setSessionOnly(true);
    }
  }, [items]);
  useEffect(() => {
    const timer = window.setInterval(
      () => setItems((current) => advanceProcessing(current, Date.now())),
      500,
    );
    return () => window.clearInterval(timer);
  }, []);
  function save(kind: Kind, draft: Draft, submit: boolean, existing?: Entity) {
    const item = kind === "policies" ? saveBusinessPolicy(draft, submit, currentOwner, role, items, existing) : saveEntity(
      kind,
      draft,
      submit,
      Date.now(),
      existing?.id ?? crypto.randomUUID(),
      existing,
      items,
      currentOwner,
    );
    setItems((current) => [
      item,
      ...current.filter((entry) => entry.id !== item.id),
    ]);
    return item;
  }
  return (
    <DemoContext.Provider
      value={{
        items,
        sessionOnly,
        save,
        remove: (item) => {
          const reason = deletionBlocker(items, item);
          if (reason) throw new Error(reason);
          setItems((current) =>
            current.filter((entry) => entry.id !== item.id),
          );
        },
        setActivation: (item, active) => {
          if (
            item.kind !== "guardrails" ||
            item.status !== (active ? "Ready" : "Active")
          )
            throw new Error(
              "This profile's status has changed. Refresh and try again.",
            );
          setItems((current) =>
            current.map((entry) =>
              entry.id === item.id
                ? {
                    ...entry,
                    status: active ? "Active" : "Ready",
                    updatedAt: Date.now(),
                  }
                : entry,
            ),
          );
        },
        mode: "mock",
        role, switchRole,
        configure: (id, action, configs, comment) => setItems(configurePolicy(items, id, action, role, currentOwner, configs, comment)),
        currentOwner,
        owners,
        switchOwner,
        policyAuthoring: true,
        connection: connection || <div className="flex flex-wrap items-center gap-2 border-b bg-slate-50 px-6 py-2 text-xs text-slate-600"><span className="rounded border bg-white px-2 py-0.5 font-medium">Mock demo</span> F5 + Nemo · Changes are saved in this browser. No backend requests.</div>,
      }}
    >
      {children}
    </DemoContext.Provider>
  );
}

function LiveProvider({
  children,
  config,
  onFallback,
}: {
  children: ReactNode;
  config: RuntimeConfig;
  onFallback: () => void;
}) {
  const [token, setToken] = useState("");
  const [adapter, setAdapter] = useState<GuardAdapter>();
  const [items, setItems] = useState<Entity[]>([]);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const locked = useRef(false);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  async function connect() {
    if (busy || (!config.autoConnect && !token.trim())) return;
    setBusy(true);
    setError("");
    const next = config.marketplaceDb ? new MarketplaceAdapter(token.trim(), config) : config.f5Mock ? new MultiSourceAdapter(token.trim(), config) : new GuardAdapter(token.trim(), config);
    try {
      const loaded = await next.load();
      if (!alive.current) return;
      setItems(loaded);
      setAdapter(next);
      setReady(true);
      setToken("");
    } catch (e) {
      if (!alive.current) return;
      if (config.mode === "auto" && mayUseMock(e)) {
        onFallback();
        return;
      }
      setError(e instanceof Error ? e.message : "Connection failed.");
    } finally {
      if (alive.current) setBusy(false);
    }
  }
  useEffect(() => {
    if (config.autoConnect) void connect();
  }, [config.autoConnect]);
  async function refresh() {
    if (!adapter || locked.current) return;
    locked.current = true;
    try {
      const loaded = await adapter.load();
      if (alive.current) {
        setItems(loaded);
        setError("");
      }
    } catch (e) {
      if (alive.current)
        setError(
          e instanceof GuardApiError
            ? e.message
            : "Unable to refresh backend data.",
        );
    } finally {
      locked.current = false;
    }
  }
  useEffect(() => {
    if (!adapter) return;
    const timer = window.setInterval(() => {
      if (document.visibilityState !== "hidden") void refresh();
    }, 5000);
    return () => window.clearInterval(timer);
  }, [adapter]);
  async function write<T>(
    operation: (api: GuardAdapter) => Promise<T>,
  ): Promise<T> {
    if (!adapter) throw new Error("Connect before saving.");
    setBusy(true);
    while (locked.current) {
      await new Promise((resolve) => setTimeout(resolve, 50));
      if (!alive.current) throw new Error("Connection closed.");
    }
    locked.current = true;
    setBusy(true);
    try {
      return await operation(adapter);
    } finally {
      locked.current = false;
      if (alive.current) setBusy(false);
    }
  }
  async function save(
    kind: Kind,
    draft: Draft,
    submit: boolean,
    existing?: Entity,
  ) {
    return write(async (api) => {
      let id: string;
      try {
        id = await api.save(kind, draft, submit, existing);
      } catch (error) {
        if (error instanceof SavedDraftError) {
          try {
            const loaded = await api.load();
            if (alive.current) setItems(loaded);
          } catch {
            /* Keep original partial-success error. */
          }
        }
        throw error;
      }
      let loaded: Entity[];
      try {
        loaded = await api.load();
      } catch {
        throw new SavedDraftError(
          kind,
          id,
          `Saved (${id}), but refresh failed. Check this record before retrying.`,
        );
      }
      if (alive.current) setItems(loaded);
      const result = loaded.find((i) => i.kind === kind && i.id === id);
      if (!result)
        throw new Error(
          `Saved (${id}), but it is not in the current list. Refresh before retrying.`,
        );
      return result;
    });
  }
  async function publish(item: Entity) {
    await write(async (api) => {
      await api.publish(item);
      try {
        const loaded = await api.load();
        if (alive.current) setItems(loaded);
      } catch {
        throw new Error(
          "Publication was accepted, but refresh failed. Check the record before retrying.",
        );
      }
    });
  }
  async function validate(item: Entity) {
    await write(async (api) => {
      await api.validate(item);
      try {
        const loaded = await api.load();
        if (alive.current) setItems(loaded);
      } catch {
        throw new Error(
          "Validation was accepted, but refresh failed. Refresh to check progress.",
        );
      }
    });
  }
  if (!ready && config.autoConnect)
    return (
      <section className="mx-auto mt-16 max-w-md space-y-4 rounded-lg border bg-white p-6">
        <h1 className="text-xl font-medium">
          {error ? "Demo connection unavailable" : "Opening demo…"}
        </h1>
        {error ? (
          <>
            <p role="alert" className="text-sm text-red-700">
              {error}
            </p>
            <Button disabled={busy} onClick={() => void connect()}>
              {busy ? "Connecting…" : "Retry"}
            </Button>
          </>
        ) : (
          <p role="status" className="text-sm text-muted-foreground">
            Loading your workspace
          </p>
        )}
      </section>
    );
  if (!ready)
    return (
      <section className="mx-auto mt-16 max-w-md space-y-4 rounded-lg border bg-white p-6">
        <h1 className="text-xl font-medium">Connect to Guard</h1>
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            void connect();
          }}
        >
          <label className="grid gap-2 text-sm">
            Access token
            <Input
              type="password"
              autoComplete="off"
              value={token}
              onChange={(event) => setToken(event.target.value)}
              disabled={busy}
            />
          </label>
          {error && (
            <p role="alert" className="text-sm text-red-700">
              {error}
            </p>
          )}
          <Button disabled={busy || !token.trim()} type="submit">
            {busy ? "Connecting…" : "Connect"}
          </Button>
        </form>
      </section>
    );
  function disconnect() {
    if (busy || locked.current) return;
    setAdapter(undefined);
    setReady(false);
    setItems([]);
    setError("");
  }
  const connection = (
    <div className="flex flex-wrap items-center gap-3 border-b px-6 py-2 text-xs">
      <span>{config.marketplaceDb ? "Marketplace DB · Nemo backend / F5 Mock API · CRUD only" : config.f5Mock ? "Nemo · Live backend / F5 · Mock API · CRUD only" : "Connected to Nemo"}</span>
      {adapter instanceof MarketplaceAdapter && adapter.warnings.map((warning) => <span key={warning} role="alert" className="text-amber-700">{warning}</span>)}
      <Button
        variant="ghost"
        size="sm"
        disabled={busy}
        onClick={() => void refresh()}
      >
        Refresh
      </Button>
      {!config.autoConnect && (
        <Button
          variant="ghost"
          size="sm"
          disabled={busy || locked.current}
          onClick={disconnect}
        >
          Disconnect
        </Button>
      )}
      {error && (
        <span role="alert" className="text-red-700">
          {error} · Showing last retrieved data
        </span>
      )}
    </div>
  );
  return (
    <DemoContext.Provider
      value={{
        items,
        save,
        ...(config.crudOnly ? { remove: (item: Entity) => write(async (api) => {
          await api.remove(item);
          if (api instanceof MarketplaceAdapter) setItems(await api.load());
          else setItems((current) => current.filter((p) => p.id !== item.id));
        }) } : { publish, validate }),
        ...(config.marketplaceDb ? { retrySync: (item: Entity) => write(async (api) => {
          if (api instanceof MarketplaceAdapter) { await api.retry(item); setItems(await api.load()); }
        }) } : {}),
        dualSource: !!config.f5Mock,
        crudOnly: !!config.crudOnly,
        sessionOnly: false,
        mode: "live",
        ...(!config.autoConnect ? { disconnect } : {}),
        policyAuthoring: config.policyAuthoring,
        connection,
        busy,
      }}
    >
      {children}
    </DemoContext.Provider>
  );
}

export function BusinessConnectionStatus() {
  return useBusinessDemo().connection ?? null;
}

export function useBusinessDemo() {
  const value = useContext(DemoContext);
  if (!value) throw new Error("BusinessDemoProvider is required");
  return value;
}
