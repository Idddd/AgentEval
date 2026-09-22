import { z } from "zod";
import { GuardAdapter, jsonRequest } from "./guard-api";
import { entitySchema, type Draft, type Entity, type Kind } from "./model";

export class MultiSourceAdapter extends GuardAdapter {
  async load(): Promise<Entity[]> {
    const [nemo, policies, profiles] = await Promise.all([
      super.load(),
      jsonRequest("/api/f5/policies", this.token),
      jsonRequest("/api/f5/guardrails", this.token),
    ]);
    const list = z.object({ items: z.array(entitySchema) });
    return [...list.parse(policies).items, ...list.parse(profiles).items, ...nemo.map((item) => ({ ...item, source: "Guard" as const }))];
  }
  async save(kind: Kind, draft: Draft, submit: boolean, existing?: Entity) {
    if (existing && (existing.source ?? "Guard") !== (draft.source ?? "Guard")) throw new Error("Source cannot be changed.");
    if ((existing?.source ?? draft.source) !== "F5") {
      if (draft.policies.some((p) => p.policyId.startsWith("f5-"))) throw new Error("Select Nemo policies only.");
      return super.save(kind, draft, false, existing);
    }
    const body = { name: draft.name, text: draft.text, source: "F5", policies: draft.policies,
      useCase: draft.useCase, busu: draft.busu, location: draft.location, agentType: draft.agentType, dataType: draft.dataType,
      ...(existing ? { expectedVersion: existing.version } : {}),
    };
    const saved = entitySchema.parse(await jsonRequest(`/api/f5/${kind}${existing ? `/${encodeURIComponent(existing.id)}` : ""}`, this.token, existing ? "PATCH" : "POST", body));
    return saved.id;
  }
  async remove(item: Entity) {
    if (item.source !== "F5") return super.remove(item);
    await jsonRequest(`/api/f5/${item.kind}/${encodeURIComponent(item.id)}`, this.token, "DELETE");
  }
}
