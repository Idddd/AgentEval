import { createFileRoute, Link } from "@tanstack/react-router";
import {
  Activity,
  ArrowRight,
  Boxes,
  ExternalLink,
  FileClock,
  Fingerprint,
  Gauge,
  Menu,
  Route as RouteIcon,
  ShieldCheck,
  Sparkles,
  SquareTerminal,
  X,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/components/auth/auth-provider";
import { BrandLogo } from "@/components/brand/brand-logo";
import { TechnologyMarquee } from "@/components/landing/technology-marquee";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getStoredProjectId } from "@/lib/project-storage";

export const Route = createFileRoute("/")({ component: LandingPage });

const landingNavigation = [
  ["Product", "#platform"],
  ["Architecture", "#runtime"],
  ["Operations", "#operations"],
  ["Security", "#security"],
] as const;

const footerResources = [
  ["Documentation", "https://github.com/Sn0rt/TaskLattice/tree/main/docs"],
  ["Releases", "https://github.com/Sn0rt/TaskLattice/releases"],
  [
    "Install guide",
    "https://github.com/Sn0rt/TaskLattice/blob/main/README.md#install-the-latest-release",
  ],
] as const;

const footerOpenSource = [
  ["GitHub", "https://github.com/Sn0rt/TaskLattice"],
  [
    "Contributing",
    "https://github.com/Sn0rt/TaskLattice/blob/main/CONTRIBUTING.md",
  ],
  ["Apache-2.0", "https://github.com/Sn0rt/TaskLattice/blob/main/LICENSE"],
] as const;

const footerTechnology = [
  ["NVIDIA NemoClaw", "https://github.com/NVIDIA/NemoClaw"],
  ["NVIDIA OpenShell", "https://github.com/NVIDIA/OpenShell"],
  ["LiteLLM", "https://github.com/BerriAI/litellm"],
  ["Kubernetes", "https://kubernetes.io/"],
  ["PostgreSQL", "https://www.postgresql.org/"],
  ["NeMo Guardrails · roadmap", "https://github.com/NVIDIA-NeMo/Guardrails"],
] as const;

const runtimeComponents = [
  {
    id: "nemoclaw",
    label: "NEMOCLAW CONFIGURED",
    eyebrow: "01 / Runtime adapter",
    title: "Configuration becomes inspectable desired state.",
    description:
      "TaskLattice passes the selected Agent, Routing, Runtime Policy, and extensions through a pinned NemoClaw adapter instead of hand-editing a sandbox.",
    facts: [
      ["Manages", "OpenClaw or Hermes"],
      ["Evidence", "Desired + observed"],
    ],
  },
  {
    id: "openshell",
    label: "OPENSHELL POLICY BOUNDARY",
    eyebrow: "02 / Sandbox boundary",
    title: "Every Agent gets its own runtime boundary.",
    description:
      "OpenShell owns the sandbox lifecycle and applies workspace, process, credential, and network policy around the Agent runtime.",
    facts: [
      ["Boundary", "Filesystem · process · egress"],
      ["Surface", "Terminal + runtime state"],
    ],
  },
  {
    id: "litellm",
    label: "LITELLM GOVERNED",
    eyebrow: "03 / Model gateway",
    title: "Model access is scoped per Agent Instance.",
    description:
      "Routing controls model selection and every Instance receives an independently revocable LiteLLM key, while upstream provider secrets stay outside the workspace.",
    facts: [
      ["Credential", "Per-instance virtual key"],
      ["Control", "Routing · budget · MCP"],
    ],
  },
  {
    id: "agent-runtime",
    label: "OPENCLAW OR HERMES",
    eyebrow: "04 / Agent implementation",
    title: "Choose the primary Agent, then bind enhancements.",
    description:
      "One Instance runs OpenClaw or Hermes as its primary Agent. Skills, MCP Servers, Knowledge Bases, and authorized Agent connections are attached explicitly.",
    facts: [
      ["Primary", "OpenClaw / Hermes"],
      ["Enhance", "Skills · MCP · knowledge"],
    ],
  },
] as const;

type RuntimeComponentId = (typeof runtimeComponents)[number]["id"];

const controlLayers: Array<[LucideIcon, string, string, string]> = [
  [
    Fingerprint,
    "Identity",
    "Project scoped",
    "Project membership defines who may operate an Agent, while each Instance references its Access Policies directly.",
  ],
  [
    RouteIcon,
    "Model access",
    "LiteLLM governed",
    "Routing configurations constrain model access, while every Agent Instance receives an independently revocable key.",
  ],
  [
    Boxes,
    "Runtime",
    "NemoClaw configured",
    "The selected Agent—OpenClaw or Hermes—runs inside an inspectable OpenShell policy boundary.",
  ],
  [
    Sparkles,
    "Capabilities",
    "Bound, not implied",
    "Skills, MCP Servers, Knowledge Bases, and authorized Agent connections enhance the primary Agent.",
  ],
];

const workflow = [
  {
    label: "Connect",
    detail:
      "Register a Provider and validate the models TaskLattice can route.",
  },
  {
    label: "Govern",
    detail:
      "Bind a Routing configuration, one or more Access Policies, and a Runtime Policy.",
  },
  {
    label: "Provision",
    detail:
      "NemoClaw configures OpenClaw or Hermes inside an OpenShell sandbox with the selected Runtime Policy.",
  },
  {
    label: "Extend",
    detail:
      "Attach Skills, MCP Servers, Knowledge Bases, and authorized Agent connections.",
  },
];

const operationalSurfaces: Array<[LucideIcon, string, string, string]> = [
  [
    Activity,
    "Reconciliation",
    "Desired → observed",
    "Compare the saved Agent specification with runtime phase, conditions, and the latest operation.",
  ],
  [
    SquareTerminal,
    "Live access",
    "Policy-gated session",
    "Open the Agent UI or OpenShell-backed terminal only when the Instance reports an available target.",
  ],
  [
    FileClock,
    "Audit evidence",
    "Actor → action → outcome",
    "Trace Project and Instance changes through recorded control-plane and sandbox events.",
  ],
  [
    Gauge,
    "Usage & cost",
    "Gateway → Project attribution",
    "Review LiteLLM-attributed model activity and spend by period, resource, and model.",
  ],
];

const securityBoundaries = [
  [
    "Project identity",
    "Membership, local authentication or configured OIDC, and resource ownership",
  ],
  ["Inference access", "Model scope, budget, and per-instance credentials"],
  ["Runtime boundary", "Sandbox, workspace, process, and egress policy"],
];

function LandingPage() {
  const { user } = useAuth();
  const [activeRuntimeComponent, setActiveRuntimeComponent] =
    useState<RuntimeComponentId>("nemoclaw");
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const mobileNavButtonRef = useRef<HTMLButtonElement>(null);
  const mobileNavPanelRef = useRef<HTMLElement>(null);
  const projectId = getStoredProjectId() ?? "individual";
  const projectLink = user
    ? { to: "/$projectId" as const, params: { projectId } }
    : { to: "/login" as const };

  useEffect(() => {
    if (!mobileNavOpen) return;

    const previousOverflow = document.body.style.overflow;
    const desktopQuery = window.matchMedia("(min-width: 1024px)");
    const closeNavigation = () => setMobileNavOpen(false);
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        closeNavigation();
        return;
      }

      if (event.key !== "Tab") return;
      const focusableElements = Array.from(
        mobileNavPanelRef.current?.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ) ?? [],
      );
      if (focusableElements.length === 0) return;

      const firstElement = focusableElements[0]!;
      const lastElement = focusableElements[focusableElements.length - 1]!;
      if (event.shiftKey && document.activeElement === firstElement) {
        event.preventDefault();
        lastElement.focus();
      } else if (!event.shiftKey && document.activeElement === lastElement) {
        event.preventDefault();
        firstElement.focus();
      }
    };
    const handleViewportChange = (event: MediaQueryListEvent) => {
      if (event.matches) closeNavigation();
    };
    const focusTimer = window.setTimeout(() => {
      mobileNavPanelRef.current
        ?.querySelector<HTMLElement>("a, button")
        ?.focus();
    }, 0);

    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleKeyDown);
    desktopQuery.addEventListener("change", handleViewportChange);

    return () => {
      window.clearTimeout(focusTimer);
      window.removeEventListener("keydown", handleKeyDown);
      desktopQuery.removeEventListener("change", handleViewportChange);
      document.body.style.overflow = previousOverflow;
      mobileNavButtonRef.current?.focus();
    };
  }, [mobileNavOpen]);

  return (
    <div className="landing-page min-h-svh bg-background text-foreground">
      <header className="landing-header sticky top-0 z-50 border-b border-white/10 bg-[#07090c] text-white">
        <div className="mx-auto flex h-16 max-w-[1480px] items-center justify-between px-5 sm:h-[4.5rem] sm:px-8 lg:px-8 xl:px-12">
          <Link
            to="/"
            aria-label="TaskLattice home"
            className="inline-flex min-h-11 shrink-0 items-center"
          >
            <BrandLogo
              animated
              className="text-white [&_.text-muted-foreground]:text-white/50"
            />
          </Link>
          <nav
            className="hidden h-full items-center gap-5 text-sm text-white/55 lg:flex xl:gap-7"
            aria-label="Landing navigation"
          >
            {landingNavigation.map(([label, href]) => (
              <a key={href} href={href} className="landing-header-link">
                {label}
              </a>
            ))}
          </nav>
          <div className="hidden items-center gap-2 lg:flex xl:gap-3">
            <a
              href="https://github.com/Sn0rt/TaskLattice/tree/main/docs"
              target="_blank"
              rel="noreferrer"
              className="inline-flex min-h-11 items-center px-2 text-xs text-white/50 transition-colors hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2"
            >
              Docs
            </a>
            <a
              href="https://github.com/Sn0rt/TaskLattice"
              target="_blank"
              rel="noreferrer"
              className="inline-flex min-h-11 items-center gap-2 px-2 text-xs text-white/50 transition-colors hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2"
            >
              GitHub
              <ExternalLink className="size-3.5" />
            </a>
            <Link
              {...projectLink}
              className="inline-flex min-h-11 items-center gap-2 bg-[#4339ff] px-4 text-sm font-medium text-white transition-colors hover:bg-[#564dff] focus-visible:outline-2 focus-visible:outline-offset-2 xl:px-5"
            >
              {user ? "Open console" : "Sign in"}
              <ArrowRight className="size-4" />
            </Link>
          </div>
          <button
            ref={mobileNavButtonRef}
            type="button"
            aria-label={mobileNavOpen ? "Close navigation" : "Open navigation"}
            aria-expanded={mobileNavOpen}
            aria-controls="landing-mobile-navigation"
            onClick={() => setMobileNavOpen((open) => !open)}
            className="inline-flex size-11 items-center justify-center border border-white/20 text-white transition-colors hover:border-white/55 hover:bg-white/5 focus-visible:outline-2 focus-visible:outline-offset-2 lg:hidden"
          >
            {mobileNavOpen ? (
              <X className="size-4" />
            ) : (
              <Menu className="size-4" />
            )}
          </button>
        </div>
        {mobileNavOpen ? (
          <div className="fixed inset-x-0 bottom-0 top-16 z-50 sm:top-[4.5rem] lg:hidden">
            <button
              type="button"
              aria-label="Close navigation"
              aria-hidden="true"
              tabIndex={-1}
              onClick={() => setMobileNavOpen(false)}
              className="absolute inset-0 bg-black/70"
            />
            <nav
              ref={mobileNavPanelRef}
              id="landing-mobile-navigation"
              aria-label="Mobile landing navigation"
              className="absolute inset-y-0 right-0 flex w-full max-w-sm flex-col overflow-y-auto border-l border-white/10 bg-[#0d1014] px-5 py-6 sm:px-8"
            >
              <p className="font-mono text-[9px] uppercase tracking-[0.1em] text-white/30">
                Explore TaskLattice
              </p>
              <div className="mt-5 grid border-t border-white/10">
                {landingNavigation.map(([label, href], index) => (
                  <a
                    key={href}
                    href={href}
                    onClick={() => setMobileNavOpen(false)}
                    className="grid min-h-14 grid-cols-[2rem_1fr_auto] items-center border-b border-white/10 py-2 text-sm text-white/70 transition-colors hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2"
                  >
                    <span className="font-mono text-[9px] text-white/28">
                      0{index + 1}
                    </span>
                    <span>{label}</span>
                    <ArrowRight className="size-3.5" />
                  </a>
                ))}
              </div>
              <div className="mt-7 grid grid-cols-2 gap-px border border-white/10 bg-white/10">
                <a
                  href="https://github.com/Sn0rt/TaskLattice/tree/main/docs"
                  target="_blank"
                  rel="noreferrer"
                  onClick={() => setMobileNavOpen(false)}
                  className="inline-flex min-h-12 items-center justify-between bg-[#0d1014] px-4 text-sm text-white/62 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-[-2px]"
                >
                  Docs
                  <ExternalLink className="size-3.5" />
                </a>
                <a
                  href="https://github.com/Sn0rt/TaskLattice"
                  target="_blank"
                  rel="noreferrer"
                  onClick={() => setMobileNavOpen(false)}
                  className="inline-flex min-h-12 items-center justify-between bg-[#0d1014] px-4 text-sm text-white/62 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-[-2px]"
                >
                  GitHub
                  <ExternalLink className="size-3.5" />
                </a>
              </div>
              <Link
                {...projectLink}
                onClick={() => setMobileNavOpen(false)}
                className="mt-auto inline-flex min-h-12 items-center justify-between bg-[#4339ff] px-5 text-sm font-medium text-white transition-colors hover:bg-[#564dff] focus-visible:outline-2 focus-visible:outline-offset-2"
              >
                {user ? "Open console" : "Sign in"}
                <ArrowRight className="size-4" />
              </Link>
            </nav>
          </div>
        ) : null}
      </header>

      <main>
        <section className="landing-agent-hero relative isolate overflow-hidden border-b border-white/10 bg-[#07090c] text-white">
          <div className="relative mx-auto grid min-h-[calc(100svh-4rem)] max-w-[1480px] items-center px-5 py-14 sm:min-h-[calc(100svh-4.5rem)] sm:px-8 sm:py-16 lg:px-12 lg:py-20">
            <picture
              aria-hidden="true"
              className="landing-agent-backdrop relative order-2 mt-14 block aspect-[4/3] overflow-hidden border border-white/10 lg:absolute lg:inset-0 lg:mt-0 lg:aspect-auto lg:border-0"
            >
              <source
                media="(prefers-reduced-motion: reduce)"
                srcSet="/assets/landing/agent-control-layers-poster.png?v=5"
              />
              <img
                src="/assets/landing/agent-control-layers.gif?v=5"
                alt=""
                width={1280}
                height={720}
                loading="eager"
                decoding="async"
              />
            </picture>
            <div
              className="landing-agent-scrim pointer-events-none absolute inset-0 z-[1] hidden lg:block"
              aria-hidden="true"
            />

            <div className="relative z-10 order-1 max-w-[43rem]">
              <p className="mb-8 flex items-center gap-3 font-mono text-xs uppercase tracking-[0.08em] text-white/50">
                <span className="h-px w-8 bg-[#42e3ff]" />
                Kubernetes-native Agent Control Plane
              </p>
              <h1 className="max-w-4xl text-balance text-[clamp(3.5rem,7.2vw,7.5rem)] leading-[0.91] tracking-[-0.045em]">
                Operate agents.
                <span className="block text-[#9c96ff]">
                  Control every layer.
                </span>
              </h1>
              <p className="mt-9 max-w-[39rem] text-pretty text-lg leading-8 text-white/60 sm:text-xl">
                TaskLattice turns models, identities, policies, and extensions
                into Agent Instance desired state, then reconciles it through
                NemoClaw inside inspectable OpenShell sandboxes.
              </p>
              <div className="mt-10 flex flex-wrap items-center gap-4">
                <Link
                  {...projectLink}
                  className="inline-flex min-h-12 items-center gap-3 bg-[#4339ff] px-6 text-sm font-medium text-white transition-colors hover:bg-[#564dff] focus-visible:outline-2 focus-visible:outline-offset-2"
                >
                  {user ? "Open console" : "Sign in"}
                  <ArrowRight className="size-4" />
                </Link>
                <a
                  href="#runtime"
                  className="inline-flex min-h-12 items-center px-2 text-sm font-medium underline decoration-white/25 underline-offset-8 transition-colors hover:decoration-white"
                >
                  Explore the architecture
                </a>
              </div>
            </div>
          </div>
        </section>

        <TechnologyMarquee />

        <section
          id="platform"
          className="border-b border-white/10 bg-[#191a1b] text-white"
        >
          <div className="mx-auto grid max-w-[1480px] lg:grid-cols-[0.78fr_1.22fr]">
            <div className="border-b border-white/10 p-8 sm:p-12 lg:border-b-0 lg:border-r lg:p-16">
              <p className="font-mono text-xs uppercase tracking-[0.08em] text-[#9c96ff]">
                The control model
              </p>
              <h2 className="mt-8 max-w-lg text-4xl leading-tight tracking-[-0.025em] sm:text-5xl">
                One Agent Instance. Four explicit layers.
              </h2>
              <p className="mt-6 max-w-md leading-7 text-white/58">
                Desired configuration and observed runtime state remain
                separate. You can see what was requested, what is running, and
                which boundary rejected an action.
              </p>
            </div>
            <div className="control-layer-grid grid sm:grid-cols-2">
              {controlLayers.map(([Icon, title, kicker, copy], index) => (
                <article key={title} className="p-8 sm:p-10">
                  <div className="flex items-center justify-between">
                    <Icon className="size-5 text-[#9c96ff]" />
                    <span className="font-mono text-[10px] text-white/28">
                      0{index + 1}
                    </span>
                  </div>
                  <p className="mt-14 font-mono text-[10px] uppercase tracking-[0.08em] text-[#42e3ff]/70">
                    {kicker}
                  </p>
                  <h3 className="mt-3 text-xl font-medium">{title}</h3>
                  <p className="mt-3 max-w-sm text-sm leading-6 text-white/50">
                    {copy}
                  </p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section
          id="runtime"
          className="mx-auto max-w-[1480px] px-5 py-24 sm:px-8 lg:px-12 lg:py-32"
        >
          <div className="grid gap-12 lg:grid-cols-[0.72fr_1.28fr]">
            <div>
              <p className="font-mono text-xs uppercase tracking-[0.08em] text-[var(--landing-runtime-accent)]">
                Runtime path
              </p>
              <h2 className="mt-6 max-w-lg text-4xl leading-tight tracking-[-0.025em] sm:text-5xl">
                From model access to a live Agent.
              </h2>
              <p className="mt-6 max-w-md leading-7 text-muted-foreground">
                Each step creates an inspectable resource or policy. Nothing
                jumps directly from a prompt to an opaque process.
              </p>
            </div>
            <ol className="border-t border-border">
              {workflow.map((item, index) => (
                <li
                  key={item.label}
                  className="grid gap-4 border-b border-border py-7 sm:grid-cols-[4rem_0.65fr_1fr] sm:items-center"
                >
                  <span className="font-mono text-xs text-muted-foreground">
                    0{index + 1}
                  </span>
                  <strong className="text-xl font-medium">{item.label}</strong>
                  <span className="text-sm leading-6 text-muted-foreground">
                    {item.detail}
                  </span>
                </li>
              ))}
            </ol>
          </div>

          <div className="mt-20 border-t border-border lg:mt-28">
            <div className="grid gap-7 py-10 sm:py-12 lg:grid-cols-[0.72fr_1.28fr] lg:items-end">
              <div>
                <p className="font-mono text-xs uppercase tracking-[0.08em] text-[var(--landing-runtime-accent)]">
                  Runtime architecture
                </p>
                <h3 className="mt-5 max-w-xl text-3xl leading-tight tracking-[-0.025em] sm:text-4xl">
                  Clear responsibilities. One governed path.
                </h3>
              </div>
              <p className="max-w-2xl text-sm leading-7 text-muted-foreground lg:justify-self-end">
                Inspect how configuration, sandbox policy, model access, and the
                Agent runtime work together. Hover or focus a component to
                preview it; select it to keep the detail in view.
              </p>
            </div>

            <Tabs
              value={activeRuntimeComponent}
              onValueChange={(value) =>
                setActiveRuntimeComponent(value as RuntimeComponentId)
              }
              activationMode="automatic"
              orientation="vertical"
              className="landing-runtime-browser"
            >
              <TabsList
                aria-label="Runtime architecture components"
                className="landing-runtime-list"
              >
                {runtimeComponents.map((component, index) => (
                  <TabsTrigger
                    key={component.id}
                    value={component.id}
                    onFocus={() => setActiveRuntimeComponent(component.id)}
                    onMouseEnter={() => setActiveRuntimeComponent(component.id)}
                    className="landing-runtime-trigger"
                  >
                    <span className="landing-runtime-index">0{index + 1}</span>
                    <span className="landing-runtime-label">
                      {component.label}
                    </span>
                    <ArrowRight className="landing-runtime-arrow size-4" />
                  </TabsTrigger>
                ))}
              </TabsList>

              <div className="landing-runtime-detail">
                {runtimeComponents.map((component) => (
                  <TabsContent
                    key={component.id}
                    value={component.id}
                    className="landing-runtime-panel"
                  >
                    <div className="flex min-h-full flex-col justify-between gap-12">
                      <div>
                        <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-[var(--landing-runtime-accent)]">
                          {component.eyebrow}
                        </p>
                        <h4 className="mt-5 max-w-2xl text-3xl leading-tight tracking-[-0.02em] sm:text-4xl">
                          {component.title}
                        </h4>
                        <p className="mt-6 max-w-2xl text-base leading-7 text-muted-foreground">
                          {component.description}
                        </p>
                      </div>
                      <dl className="grid border-y border-border sm:grid-cols-2 sm:divide-x sm:divide-border">
                        {component.facts.map(([label, value]) => (
                          <div
                            key={label}
                            className="py-4 sm:px-5 sm:first:pl-0"
                          >
                            <dt className="font-mono text-[9px] uppercase tracking-[0.08em] text-muted-foreground">
                              {label}
                            </dt>
                            <dd className="mt-2 text-sm font-medium text-foreground">
                              {value}
                            </dd>
                          </div>
                        ))}
                      </dl>
                    </div>
                  </TabsContent>
                ))}
              </div>
            </Tabs>
          </div>
        </section>

        <section
          id="operations"
          className="border-y border-white/10 bg-[#0d0f12] text-white"
        >
          <div className="mx-auto grid max-w-[1480px] lg:grid-cols-[0.78fr_1.22fr]">
            <div className="border-b border-white/10 p-8 sm:p-12 lg:border-b-0 lg:border-r lg:p-16">
              <p className="font-mono text-xs uppercase tracking-[0.08em] text-[#42e3ff]/75">
                Operating evidence
              </p>
              <h2 className="mt-7 max-w-xl text-4xl leading-tight tracking-[-0.025em] sm:text-5xl">
                See intent, runtime, and evidence in one path.
              </h2>
              <p className="mt-6 max-w-lg leading-7 text-white/52">
                Operations do not end at provisioning. TaskLattice keeps the
                Agent specification, runtime access, audit history, and model
                attribution connected to the same Project-scoped Instance.
              </p>
              <Link
                {...projectLink}
                className="mt-9 inline-flex min-h-11 items-center gap-2 border-b border-white/45 text-sm font-medium text-white transition-colors hover:border-white focus-visible:outline-2 focus-visible:outline-offset-2"
              >
                {user ? "Open console" : "Sign in"}
                <ArrowRight className="size-4" />
              </Link>
            </div>

            <div className="operations-ledger grid">
              {operationalSurfaces.map(([Icon, title, signal, copy], index) => (
                <article
                  key={title}
                  className="operations-ledger-row grid gap-5 border-b border-white/10 p-8 last:border-b-0 sm:grid-cols-[3.5rem_0.75fr_1.25fr] sm:items-center sm:p-10"
                >
                  <div className="flex items-center justify-between sm:block">
                    <Icon className="size-5 text-[#9c96ff]" />
                    <span className="font-mono text-[9px] text-white/24 sm:mt-5 sm:block">
                      0{index + 1}
                    </span>
                  </div>
                  <div>
                    <p className="font-mono text-[9px] uppercase tracking-[0.08em] text-[#42e3ff]/62">
                      {signal}
                    </p>
                    <h3 className="mt-2 text-xl font-medium text-white">
                      {title}
                    </h3>
                  </div>
                  <p className="max-w-md text-sm leading-6 text-white/48">
                    {copy}
                  </p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section id="security" className="border-b border-border bg-muted">
          <div className="mx-auto grid max-w-[1480px] lg:grid-cols-[0.9fr_1.1fr]">
            <div className="border-b border-border p-8 sm:p-12 lg:border-b-0 lg:border-r lg:p-16">
              <ShieldCheck className="size-7 text-primary" />
              <p className="mt-8 font-mono text-xs uppercase tracking-[0.08em] text-primary">
                Inspectable boundaries
              </p>
              <h2 className="mt-6 max-w-2xl text-4xl leading-tight tracking-[-0.025em] sm:text-6xl">
                Security is explicit at every layer.
              </h2>
              <p className="mt-7 max-w-xl text-base leading-7 text-muted-foreground">
                Project identity controls ownership. LiteLLM scopes model and
                MCP access with per-instance credentials. OpenShell enforces
                filesystem, process, and network policy—while upstream provider
                secrets stay outside the Agent workspace.
              </p>
              <Link
                {...projectLink}
                className="mt-9 inline-flex min-h-11 items-center gap-2 border-b border-foreground text-sm font-medium"
              >
                {user ? "Open console" : "Sign in"}
                <ArrowRight className="size-4" />
              </Link>
            </div>

            <ol className="security-boundary-list grid">
              {securityBoundaries.map(([title, detail], index) => (
                <li
                  key={title}
                  className="grid gap-5 border-b border-border p-8 last:border-b-0 sm:grid-cols-[4rem_0.8fr_1.2fr] sm:items-center sm:p-10"
                >
                  <span className="font-mono text-xs text-primary">
                    0{index + 1}
                  </span>
                  <strong className="text-lg font-medium">{title}</strong>
                  <span className="text-sm leading-6 text-muted-foreground">
                    {detail}
                  </span>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section
          aria-labelledby="landing-final-cta"
          className="border-b border-white/10 bg-[#191a1b] text-white"
        >
          <div className="mx-auto grid max-w-[1480px] gap-8 px-5 py-14 sm:px-8 sm:py-16 lg:grid-cols-[1fr_auto] lg:items-end lg:px-12">
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-[#42e3ff]/70">
                Start inside a Project boundary
              </p>
              <h2
                id="landing-final-cta"
                className="mt-5 max-w-3xl text-3xl leading-tight tracking-[-0.025em] sm:text-5xl"
              >
                Operate your first Agent.
              </h2>
            </div>
            <div className="flex flex-wrap items-center gap-4">
              <Link
                {...projectLink}
                className="inline-flex min-h-12 w-fit items-center gap-3 bg-[#4339ff] px-6 text-sm font-medium text-white transition-colors hover:bg-[#564dff] focus-visible:outline-2 focus-visible:outline-offset-2"
              >
                {user ? "Open console" : "Sign in"}
                <ArrowRight className="size-4" />
              </Link>
              <a
                href="https://github.com/Sn0rt/TaskLattice/tree/main/docs"
                target="_blank"
                rel="noreferrer"
                className="inline-flex min-h-12 items-center gap-2 px-2 text-sm text-white/68 underline decoration-white/25 underline-offset-8 transition-colors hover:text-white hover:decoration-white focus-visible:outline-2 focus-visible:outline-offset-2"
              >
                Read documentation
                <ExternalLink className="size-3.5" />
              </a>
            </div>
          </div>
        </section>
      </main>

      <footer className="landing-footer bg-[#07090c] text-white">
        <div className="mx-auto grid max-w-[1480px] gap-12 px-5 py-14 sm:px-8 lg:grid-cols-[1.25fr_0.62fr_0.78fr_0.78fr_1fr] lg:gap-8 lg:px-12 lg:py-16 xl:gap-12">
          <div>
            <BrandLogo className="text-white [&_.text-muted-foreground]:text-white/42" />
            <p className="mt-6 max-w-sm text-sm leading-6 text-white/45">
              A Project-scoped Kubernetes control plane for configuring,
              operating, and auditing Agent Instances without hiding their
              runtime boundaries.
            </p>
            <p className="mt-7 font-mono text-[9px] uppercase tracking-[0.08em] text-white/25">
              Early preview · v0.1.x
            </p>
            <p className="mt-4 max-w-sm text-[10px] leading-5 text-white/25">
              Third-party marks identify technologies and integrations; they do
              not imply endorsement.
            </p>
          </div>

          <div className="col-span-full grid grid-cols-2 gap-x-8 gap-y-10 md:grid-cols-4 lg:contents">
            <nav aria-label="Product links">
              <p className="font-mono text-[9px] uppercase tracking-[0.1em] text-white/28">
                Product
              </p>
              <ul className="mt-5 grid gap-3 text-sm text-white/52">
                {landingNavigation.map(([label, href]) => (
                  <li key={href}>
                    <a
                      href={href}
                      className="inline-flex min-h-11 items-center transition-colors hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2"
                    >
                      {label}
                    </a>
                  </li>
                ))}
              </ul>
            </nav>

            <nav aria-label="TaskLattice resources">
              <p className="font-mono text-[9px] uppercase tracking-[0.1em] text-white/28">
                Resources
              </p>
              <ul className="mt-5 grid gap-3 text-sm text-white/52">
                {footerResources.map(([label, href]) => (
                  <li key={href}>
                    <a
                      href={href}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex min-h-11 items-center gap-2 transition-colors hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2"
                    >
                      {label}
                      <ExternalLink className="size-3" />
                    </a>
                  </li>
                ))}
              </ul>
            </nav>

            <nav aria-label="Open source links">
              <p className="font-mono text-[9px] uppercase tracking-[0.1em] text-white/28">
                Open source
              </p>
              <ul className="mt-5 grid gap-3 text-sm text-white/52">
                {footerOpenSource.map(([label, href]) => (
                  <li key={href}>
                    <a
                      href={href}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex min-h-11 items-center gap-2 transition-colors hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2"
                    >
                      {label}
                      <ExternalLink className="size-3" />
                    </a>
                  </li>
                ))}
              </ul>
            </nav>

            <nav aria-label="Technology links">
              <p className="font-mono text-[9px] uppercase tracking-[0.1em] text-white/28">
                Technology
              </p>
              <ul className="mt-5 grid gap-3 text-sm text-white/52">
                {footerTechnology.map(([label, href]) => (
                  <li key={href}>
                    <a
                      href={href}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex min-h-11 items-center gap-2 transition-colors hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2"
                    >
                      {label}
                      <ExternalLink className="size-3 shrink-0" />
                    </a>
                  </li>
                ))}
              </ul>
            </nav>
          </div>
        </div>

        <div className="border-t border-white/10">
          <div className="mx-auto flex max-w-[1480px] flex-wrap items-center justify-between gap-4 px-5 py-6 font-mono text-[9px] uppercase tracking-[0.08em] text-white/28 sm:px-8 lg:px-12">
            <span>© {new Date().getFullYear()} TaskLattice</span>
            <span>Kubernetes-native · Agent operations</span>
            <span>Self-hosted on Kubernetes</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
