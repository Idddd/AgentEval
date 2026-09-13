import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import {
  ArrowDownUp,
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  Layers2,
  LoaderCircle,
  MessageCircle,
  Plus,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  X,
} from "lucide-react";
import {
  businessAreas,
  protectionCatalog,
  type MarketplaceResource,
  type ResourceKind,
} from "./contracts";
import { areaClass, dateLabel } from "./presentation";
import { useMarketplaceCollection } from "./provider";
import { CreateResourceDialog } from "./create-dialog";
import { ResourceDetail } from "./detail";

export type MarketplaceSearch = { item?: string; template?: string };
export function validateMarketplaceSearch(
  search: Record<string, unknown>,
): MarketplaceSearch {
  return {
    ...(typeof search.item === "string" && search.item.length < 200
      ? { item: search.item }
      : {}),
    ...(typeof search.template === "string" && search.template.length < 200
      ? { template: search.template }
      : {}),
  };
}

export function MarketplaceCatalog({
  kind,
  search,
}: {
  kind: ResourceKind;
  search: MarketplaceSearch;
}) {
  const { data, isPending, error, refetch } = useMarketplaceCollection(kind);
  const templates = useMarketplaceCollection("templates");
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [area, setArea] = useState("All areas");
  const [sort, setSort] = useState("updated");
  const [page, setPage] = useState(1);
  const [creating, setCreating] = useState(false);
  const [notice, setNotice] = useState("");
  const isTemplate = kind === "templates";
  const singular = isTemplate ? "template" : "guardrail";
  const route = isTemplate ? "/templates" : "/guardrails";
  const starter = templates.data?.data.items.find(
    (item) => item.id === search.template,
  );
  const results = useMemo(
    () =>
      (data?.data.items ?? [])
        .filter((item) => {
          const terms =
            `${item.name} ${item.description} ${item.businessArea} ${item.protections.map((id) => protectionCatalog.find((p) => p.id === id)?.name).join(" ")}`.toLocaleLowerCase();
          return (
            (area === "All areas" || item.businessArea === area) &&
            terms.includes(query.trim().toLocaleLowerCase())
          );
        })
        .sort((a, b) =>
          sort === "name"
            ? a.name.localeCompare(b.name)
            : Date.parse(b.updatedAt) - Date.parse(a.updatedAt) ||
              a.name.localeCompare(b.name),
        ),
    [data, query, area, sort],
  );
  const pages = Math.max(1, Math.ceil(results.length / 6));
  const currentPage = Math.min(page, pages);
  useEffect(() => {
    setPage(1);
  }, [query, area, sort]);
  const closeCreate = () => {
    setCreating(false);
    if (search.template) void navigate({ to: route, search: {} });
  };

  return (
    <section className="mp-catalog" aria-labelledby="catalog-heading">
      <div className="mp-catalog-heading">
        <div>
          <h2 id="catalog-heading">
            {isTemplate
              ? "A head start for every use case."
              : "Your guardrails"}
          </h2>
          <p>
            {isTemplate
              ? "Reusable starting points, shaped around the way your business works."
              : "Define what good looks like for your AI. Your business needs come first."}
          </p>
        </div>
        <button
          className="mp-button mp-primary"
          onClick={() => setCreating(true)}
        >
          <Plus size={16} />
          Create {singular}
        </button>
      </div>
      {notice ? (
        <div className="mp-success-notice" role="status">
          <ShieldCheck size={16} />
          <span>{notice}</span>
          <button
            className="mp-icon-button"
            aria-label="Dismiss notification"
            onClick={() => setNotice("")}
          >
            <X size={15} />
          </button>
        </div>
      ) : null}
      {!isTemplate ? (
        <div className="mp-starter-banner">
          <span className="mp-starter-icon">
            <Layers2 size={20} />
          </span>
          <div>
            <strong>You don’t have to start from scratch.</strong>
            <span>
              Explore ready-to-use starting points for privacy, customer care
              and more.
            </span>
          </div>
          <Link to="/templates">
            Explore templates
            <ArrowRight size={15} />
          </Link>
        </div>
      ) : null}
      <div className="mp-toolbar">
        <label className="mp-search">
          <Search size={17} />
          <span className="sr-only">Search {kind}</span>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={`Search ${kind} by name, purpose or protection…`}
          />
          {query ? (
            <button aria-label="Clear search" onClick={() => setQuery("")}>
              <X size={15} />
            </button>
          ) : null}
        </label>
        <label className="mp-filter">
          <SlidersHorizontal size={15} />
          <span className="sr-only">Business area</span>
          <select
            value={area}
            onChange={(event) => setArea(event.target.value)}
          >
            <option>All areas</option>
            {businessAreas.map((value) => (
              <option key={value}>{value}</option>
            ))}
          </select>
        </label>
        <label className="mp-filter mp-sort">
          <ArrowDownUp size={15} />
          <span className="sr-only">Sort by</span>
          <select
            value={sort}
            onChange={(event) => setSort(event.target.value)}
          >
            <option value="updated">Recently updated</option>
            <option value="name">Name A–Z</option>
          </select>
        </label>
      </div>
      <p className="mp-result-count" aria-live="polite">
        {isPending
          ? "Loading your workspace…"
          : `${results.length} ${results.length === 1 ? singular : kind}${area !== "All areas" ? ` in ${area}` : ""}`}
      </p>
      {isPending ? (
        <div className="mp-empty" role="status">
          <LoaderCircle className="animate-spin" size={26} />
          <h3>Loading {kind}</h3>
        </div>
      ) : error ? (
        <div className="mp-empty" role="alert">
          <ShieldCheck size={28} />
          <h3>We couldn’t load your {kind}.</h3>
          <p>{error.message}</p>
          <button
            className="mp-button mp-secondary"
            onClick={() => void refetch()}
          >
            Try again
          </button>
        </div>
      ) : results.length ? (
        <div className="mp-card-grid">
          {results.slice((currentPage - 1) * 6, currentPage * 6).map((item) => (
            <ResourceCard key={item.id} item={item} />
          ))}
        </div>
      ) : (
        <div className="mp-empty">
          <Search size={28} />
          <h3>
            {query || area !== "All areas"
              ? "No matches just yet."
              : `Your first ${singular} starts here.`}
          </h3>
          <p>
            {query || area !== "All areas"
              ? "Try a different name or broaden your business area."
              : `Create a ${singular} to capture your business requirements.`}
          </p>
          <button
            className="mp-button mp-secondary"
            onClick={() => {
              if (query || area !== "All areas") {
                setQuery("");
                setArea("All areas");
              } else setCreating(true);
            }}
          >
            {query || area !== "All areas"
              ? "Clear filters"
              : `Create ${singular}`}
          </button>
        </div>
      )}
      {results.length > 6 ? (
        <nav aria-label="Catalog pagination" className="mp-pagination">
          <span>
            Showing {(currentPage - 1) * 6 + 1}–
            {Math.min(currentPage * 6, results.length)} of {results.length}
          </span>
          <div>
            <button
              className="mp-button mp-secondary"
              aria-label="Previous page"
              disabled={currentPage === 1}
              onClick={() => setPage(currentPage - 1)}
            >
              <ChevronLeft size={16} />
            </button>
            <span>
              {currentPage} / {pages}
            </span>
            <button
              className="mp-button mp-secondary"
              aria-label="Next page"
              disabled={currentPage === pages}
              onClick={() => setPage(currentPage + 1)}
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </nav>
      ) : null}
      {search.template && !starter && !templates.isPending ? (
        <div className="mp-success-notice" role="alert">
          This template is unavailable. Choose another template or create from
          scratch.
          <button className="mp-button mp-secondary" onClick={closeCreate}>
            Dismiss
          </button>
        </div>
      ) : null}
      {creating || (search.template && starter) ? (
        <CreateResourceDialog
          kind={kind}
          {...(starter ? { template: starter } : {})}
          onClose={closeCreate}
          onCreated={(result) => {
            setCreating(false);
            setQuery("");
            setArea("All areas");
            setSort("updated");
            setPage(1);
            setNotice(
              `${result.source === "mock" ? "Saved in your sample workspace" : "Created"}: ${result.data.name}.`,
            );
            void navigate({ to: route, search: { item: result.data.id } });
          }}
        />
      ) : null}
      {search.item ? (
        <ResourceDetail
          kind={kind}
          id={search.item}
          onClose={() => void navigate({ to: route, search: {} })}
        />
      ) : null}
    </section>
  );
}

function ResourceCard({ item }: { item: MarketplaceResource }) {
  const template = item.kind === "templates";
  const to = template ? "/templates" : "/guardrails";
  return (
    <article className={`mp-resource-card ${areaClass(item.businessArea)}`}>
      <div className="mp-card-top">
        <span className="mp-resource-icon">
          {template ? (
            <Layers2 size={23} strokeWidth={1.65} />
          ) : item.businessArea === "Customer service" ? (
            <MessageCircle size={23} strokeWidth={1.65} />
          ) : (
            <ShieldCheck size={23} strokeWidth={1.65} />
          )}
        </span>
        <span className="mp-area-badge">{item.businessArea}</span>
      </div>
      <Link to={to} search={{ item: item.id }} className="mp-card-title">
        <h3>{item.name}</h3>
        <ArrowRight size={17} />
      </Link>
      <p className="mp-card-description">{item.description}</p>
      <div className="mp-protection-tags">
        {item.protections.slice(0, 3).map((id) => (
          <span key={id}>
            {protectionCatalog.find((p) => p.id === id)?.name}
          </span>
        ))}
        {item.protections.length > 3 ? (
          <span>+{item.protections.length - 3} more</span>
        ) : null}
      </div>
      <div className="mp-card-bottom">
        {template ? (
          <>
            <span>
              <Sparkles size={13} />
              {item.protections.length} protections
            </span>
            <Link
              to="/guardrails"
              search={{ template: item.id }}
              className="mp-use-template"
            >
              Use template
              <ArrowRight size={14} />
            </Link>
          </>
        ) : (
          <>
            <span className="mp-draft-label">
              <i />
              {item.status === "draft" ? "Draft" : "Available"}
            </span>
            <span>Updated {dateLabel(item.updatedAt)}</span>
          </>
        )}
      </div>
    </article>
  );
}
