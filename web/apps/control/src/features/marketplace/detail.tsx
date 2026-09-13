import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import {
  ArrowDown,
  ArrowRight,
  Check,
  Layers2,
  LoaderCircle,
  MessageSquare,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  protectionCatalog,
  type MarketplaceResource,
  type ResourceKind,
} from "./contracts";
import { useMarketplace } from "./provider";
import { dateLabel, areaClass } from "./presentation";

export function ResourceDetail({
  kind,
  id,
  onClose,
}: {
  kind: ResourceKind;
  id: string;
  onClose: () => void;
}) {
  const { api } = useMarketplace();
  const { data, isPending, error, refetch } = useQuery({
    queryKey: ["marketplace", kind, id],
    queryFn: () => api.get(kind, id),
    retry: false,
  });
  const item = data?.data;
  return (
    <Sheet
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <SheetContent className="mp-detail marketplace">
        <header className="mp-detail-heading">
          <span className="mp-eyebrow">
            {kind === "templates" ? "TEMPLATE DETAILS" : "GUARDRAIL DETAILS"}
          </span>
          <SheetTitle className="mp-detail-title">
            {item?.name ??
              (isPending ? "Loading details…" : "Item unavailable")}
          </SheetTitle>
          <SheetDescription className="mp-detail-description">
            {item?.description ??
              "View the business purpose and requested protections."}
          </SheetDescription>
          {item ? (
            <div className={areaClass(item.businessArea)}>
              <span className="mp-area-badge">{item.businessArea}</span>
              <span className="mp-detail-status">
                {kind === "templates"
                  ? "Reusable template"
                  : item.status === "draft"
                    ? "Draft · not deployed"
                    : "Available"}
              </span>
            </div>
          ) : null}
        </header>
        {isPending ? (
          <div className="mp-empty" role="status">
            <LoaderCircle size={24} className="animate-spin" />
            <p>Loading details…</p>
          </div>
        ) : error ? (
          <div className="mp-empty" role="alert">
            <p>{error.message}</p>
            <button
              className="mp-button mp-secondary"
              onClick={() => void refetch()}
            >
              Try again
            </button>
          </div>
        ) : item ? (
          <>
            <div className="mp-detail-scroll">
              <section className="mp-detail-section">
                <div className="mp-section-title">
                  <ShieldCheck size={17} />
                  <h3>Protections included</h3>
                  <span>{item.protections.length}</span>
                </div>
                <div className="mp-detail-protections">
                  {item.protections.map((id) => {
                    const protection = protectionCatalog.find(
                      (value) => value.id === id,
                    );
                    return (
                      <div key={id}>
                        <span className="mp-check-icon">
                          <Check size={14} />
                        </span>
                        <div>
                          <strong>{protection?.name}</strong>
                          <p>{protection?.description}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
              <section className="mp-detail-section">
                <div className="mp-section-title">
                  <MessageSquare size={17} />
                  <h3>Where checks apply</h3>
                </div>
                <div className="mp-check-flow">
                  <FlowStep
                    title="User messages"
                    description="Before your AI responds"
                    active={item.checkpoints.includes("input")}
                  />
                  <ArrowDown size={15} />
                  <span className="mp-flow-ai">
                    <Sparkles size={17} />
                    Your AI
                  </span>
                  <ArrowDown size={15} />
                  <FlowStep
                    title="AI responses"
                    description="Before people see an answer"
                    active={item.checkpoints.includes("output")}
                  />
                </div>
              </section>
              <section className="mp-detail-section">
                <div className="mp-section-title">
                  <Layers2 size={17} />
                  <h3>Business boundaries</h3>
                </div>
                <div className="mp-boundary-summary">
                  <div>
                    <h4>Topics to support</h4>
                    {item.allowedTopics.length ? (
                      <ul>
                        {item.allowedTopics.map((topic, index) => (
                          <li key={`${topic}-${index}`}>{topic}</li>
                        ))}
                      </ul>
                    ) : (
                      <p>No specific topics provided.</p>
                    )}
                  </div>
                  <div>
                    <h4>Topics to avoid</h4>
                    {item.restrictedTopics.length ? (
                      <ul>
                        {item.restrictedTopics.map((topic, index) => (
                          <li key={`${topic}-${index}`}>{topic}</li>
                        ))}
                      </ul>
                    ) : (
                      <p>No specific restrictions provided.</p>
                    )}
                  </div>
                </div>
              </section>
              <ResourceMetadata item={item} />
              <p className="mp-detail-note">
                {data?.source === "mock"
                  ? "This is a sample workspace. These settings describe the intended protection; no live traffic is checked."
                  : "This describes the requested protection. Runtime configuration and deployment are managed by your technical team."}
              </p>
            </div>
            <footer className="mp-detail-footer">
              {kind === "templates" ? (
                <Link
                  to="/guardrails"
                  search={{ template: item.id }}
                  className="mp-button mp-primary"
                >
                  Use this template
                  <ArrowRight size={16} />
                </Link>
              ) : (
                <button className="mp-button mp-secondary" onClick={onClose}>
                  Back to guardrails
                </button>
              )}
            </footer>
          </>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
function FlowStep({
  title,
  description,
  active,
}: {
  title: string;
  description: string;
  active: boolean;
}) {
  return (
    <div className={`mp-flow-step ${active ? "is-selected" : ""}`}>
      <div>
        <strong>{title}</strong>
        <small>{description}</small>
      </div>
      <span>
        {active ? (
          <>
            <ShieldCheck size={14} />
            Checks requested
          </>
        ) : (
          "Not selected"
        )}
      </span>
    </div>
  );
}
function ResourceMetadata({ item }: { item: MarketplaceResource }) {
  return (
    <dl className="mp-metadata">
      <div>
        <dt>Created by</dt>
        <dd>{item.createdBy}</dd>
      </div>
      <div>
        <dt>Created</dt>
        <dd>{dateLabel(item.createdAt)}</dd>
      </div>
      <div>
        <dt>Last updated</dt>
        <dd>{dateLabel(item.updatedAt)}</dd>
      </div>
    </dl>
  );
}
