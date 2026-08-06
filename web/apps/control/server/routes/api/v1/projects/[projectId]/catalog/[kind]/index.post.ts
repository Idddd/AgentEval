import {
  createKnowledgeSourceDefinitionSchema,
  createMcpServerDefinitionSchema,
  createSkillDefinitionSchema,
  resourceKindSchema,
} from "@tasklattice/contracts";
import { defineHandler } from "nitro";
import { requireAuth, unauthorizedResponse } from "../../../../../../../auth/auth";
import { errorResponse, jsonResponse } from "../../../../../../../http/responses";
import { getResourceCatalogService, requireProjectRole } from "../../../../../../../services";

export default defineHandler(async (event) => {
  try { requireAuth(event.req); } catch (error) { return unauthorizedResponse(error); }
  try {
    await requireProjectRole(event.req, ["admin"]);
    const kind = resourceKindSchema.parse(event.context.params?.kind);
    const body = await event.req.json();
    const service = await getResourceCatalogService(event.req);
    const created = await (kind === "skills"
      ? service.createSkill(createSkillDefinitionSchema.parse(body))
      : kind === "mcp-servers"
        ? service.createMcpServer(createMcpServerDefinitionSchema.parse(body))
        : service.createKnowledgeSource(createKnowledgeSourceDefinitionSchema.parse(body)));
    return jsonResponse(created, {
      status: 201,
      headers: { location: `/api/v1/projects/${encodeURIComponent(event.context.params?.projectId ?? "")}/catalog/${kind}/${created.id}` },
    });
  } catch (error) {
    return errorResponse(error);
  }
});
