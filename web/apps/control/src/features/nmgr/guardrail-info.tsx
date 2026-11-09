import { sourceLabel } from "./model";
import { ChevronRight } from "lucide-react";
import type { Entity, State } from "./model";

export function GuardrailInfo({
  item,
  state,
  onProfile,
  policyJson = false,
}: {
  item: Entity;
  state: State;
  onProfile: (id: string) => void;
  policyJson?: boolean;
}) {
  const profiles = state.entities.filter(
    (p) =>
      p.kind === "Profile" &&
      (p.refs.includes(item.id) || p.deployedRefs.includes(item.id)),
  );
  return (
    <div className="nm-info">
      <section aria-label="Control Intent">
        <h3>Control Intent</h3>
        <p className="nm-info-description">{item.description}</p>
      </section>
      <section aria-label="Ownership and scope">
        <h3>Ownership & scope</h3>
        <dl className="nm-info-facts">
          {[
            ["Control unit", item.unit],
            ["Custodian", item.custodian],
            ["Sign-off approver", item.approver],
            ["Mandatory", item.mandatory ? "Yes" : "No"],
            [
              "Target regions",
              item.location === "ALL" ? "All regions" : item.location,
            ],
            [
              "Last updated",
              new Date(item.updated).toLocaleString("en-GB", {
                timeZone: "Asia/Shanghai",
              }),
            ],
          ].map(([key, value]) => (
            <div key={key}>
              <dt>{key}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
      </section>
      <section aria-label={policyJson ? "NeMo Policy JSON" : "LLM prompt"}>
        <h3>{policyJson ? "NeMo Policy JSON" : "LLM prompt"}</h3>
        <p className="nm-prompt-content">
          {item.config?.content || (policyJson ? "No Policy definition configured." : "No prompt configured.")}
        </p>
        <dl className="nm-info-facts nm-config-meta">
          <div><dt>Guardrail provider</dt><dd>{sourceLabel(item)}</dd></div>
          <div>
            <dt>Scanner</dt>
            <dd>
              {item.config
                ? { custom: policyJson ? "Custom Policy (JSON)" : "GenAI", regex: "Regex", keyword: "Keywords" }[
                    item.config.scannerType
                  ]
                : "Not specified"}
            </dd>
          </div>
          <div>
            <dt>Direction</dt>
            <dd>{policyJson ? "Defined by Policy rule stages" : item.config?.direction ?? "Not specified"}</dd>
          </div>
          <div>
            <dt>Configuration version</dt>
            <dd>{item.config?.versionName ?? `v${item.version}.0`}</dd>
          </div>
        </dl>
      </section>
      <section aria-label="Used by Profiles">
        <div className="nm-info-section-head">
          <h3>Used by Profiles</h3>
          <span>{profiles.length}</span>
        </div>
        {profiles.length ? (
          <div
            className={`nm-profile-refs ${profiles.length > 3 ? "nm-module-scroll" : ""}`}
            aria-label="Profile references"
          >
            {profiles.map((profile) => (
              <button
                className="nm-profile-ref"
                key={profile.id}
                onClick={() => onProfile(profile.id)}
              >
                <span>
                  <strong>{profile.name}</strong>
                  <small>
                    {profile.deployed !== null &&
                    profile.deployedRefs.includes(item.id)
                      ? "Deployed reference"
                      : "Draft reference"}
                  </small>
                </span>
                <ChevronRight size={16} />
              </button>
            ))}
          </div>
        ) : (
          <p className="nm-muted">No Profile references this Guardrail.</p>
        )}
      </section>
    </div>
  );
}
