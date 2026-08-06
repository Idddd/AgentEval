import { Pause, Play } from "lucide-react";
import {
  siKubernetes,
  siLangflow,
  siLanggraph,
  siNvidia,
  siPostgresql,
  siPydantic,
  type SimpleIcon,
} from "simple-icons";
import { useState, type CSSProperties } from "react";

type Technology = {
  name: string;
  role: string;
  asset?: string;
  icon?: SimpleIcon;
};

const technologies: Technology[] = [
  {
    name: "NemoClaw",
    role: "Built on · Runtime adapter",
    icon: siNvidia,
  },
  {
    name: "OpenShell",
    role: "Built on · Sandbox boundary",
    asset: "/assets/brands/openshell-mark-reversed.svg",
  },
  {
    name: "LiteLLM",
    role: "Built on · Model gateway",
    asset: "/assets/brands/litellm-train.webp",
  },
  {
    name: "Kubernetes",
    role: "Built on · Orchestration",
    icon: siKubernetes,
  },
  {
    name: "PostgreSQL",
    role: "Built on · Persistent state",
    icon: siPostgresql,
  },
  {
    name: "OpenClaw",
    role: "Agent runtime · Default",
    asset: "/assets/brands/openclaw-lobehub.webp",
  },
  {
    name: "Hermes",
    role: "Agent runtime · Supported",
    asset: "/assets/brands/hermesagent-lobehub.webp",
  },
  {
    name: "A2A",
    role: "Remote registration · Agent Card",
    asset: "/assets/agent-providers/a2a-agent.png",
  },
  {
    name: "LangGraph",
    role: "Remote registration · Agent Card",
    icon: siLanggraph,
  },
  {
    name: "LangFlow",
    role: "Remote registration · Endpoint",
    icon: siLangflow,
  },
  {
    name: "Pydantic AI",
    role: "Remote registration · Agent Card",
    icon: siPydantic,
  },
];

function TechnologyMark({ technology }: { technology: Technology }) {
  const color = technology.icon
    ? technology.icon.hex === "000000"
      ? "#ffffff"
      : `#${technology.icon.hex}`
    : undefined;
  const style = color
    ? ({ "--technology-color": color } as CSSProperties)
    : undefined;

  return (
    <span className="landing-technology-mark" style={style} aria-hidden="true">
      {technology.asset ? (
        <img src={technology.asset} alt="" loading="lazy" decoding="async" />
      ) : technology.icon ? (
        <svg viewBox="0 0 24 24">
          <path d={technology.icon.path} />
        </svg>
      ) : null}
    </span>
  );
}

function TechnologyGroup({ clone = false }: { clone?: boolean }) {
  return (
    <ul
      className={`landing-technology-group${clone ? " is-clone" : ""}`}
      aria-hidden={clone ? "true" : undefined}
    >
      {technologies.map((technology) => (
        <li className="landing-technology-item" key={technology.name}>
          <TechnologyMark technology={technology} />
          <span className="min-w-0">
            <strong className="landing-technology-name">
              {technology.name}
            </strong>
            <span className="landing-technology-role">{technology.role}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}

export function TechnologyMarquee() {
  const [paused, setPaused] = useState(false);

  return (
    <section
      className="landing-technology-strip border-b border-white/10 bg-[#0d0f12] text-white"
      aria-labelledby="landing-technology-title"
    >
      <div className="mx-auto grid max-w-[1480px] lg:grid-cols-[21rem_minmax(0,1fr)]">
        <div className="landing-technology-intro border-b border-white/10 px-5 py-5 sm:px-8 lg:border-b-0 lg:border-r lg:px-12 lg:py-6">
          <div className="flex items-start justify-between gap-5">
            <div>
              <p className="font-mono text-[9px] uppercase tracking-[0.1em] text-[#42e3ff]/65">
                Implementation evidence
              </p>
              <h2
                id="landing-technology-title"
                className="mt-2 text-lg font-medium tracking-[-0.015em]"
              >
                Built on. Connected with.
              </h2>
            </div>
            <button
              type="button"
              aria-label={
                paused
                  ? "Resume technology logo animation"
                  : "Pause technology logo animation"
              }
              aria-pressed={paused}
              onClick={() => setPaused((value) => !value)}
              className="landing-technology-pause inline-grid size-11 shrink-0 place-items-center border border-white/15 text-white/55 transition-colors hover:border-white/45 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2"
            >
              {paused ? (
                <Play className="size-3.5" fill="currentColor" />
              ) : (
                <Pause className="size-3.5" fill="currentColor" />
              )}
            </button>
          </div>
          <p className="mt-2 max-w-[17rem] text-xs leading-5 text-white/38">
            Core services run the control path. Agent adapters extend the
            Project boundary.
          </p>
        </div>

        <div
          className="landing-technology-viewport"
          data-paused={paused || undefined}
        >
          <div className="landing-technology-track">
            <TechnologyGroup />
            <TechnologyGroup clone />
          </div>
        </div>
      </div>
    </section>
  );
}
