import { resourceKindSchema } from "@tasklattice/contracts";
import { defineHandler } from "nitro";
import { requireAuth, unauthorizedResponse } from "../../../../../../../../auth/auth";
import { errorResponse, jsonResponse } from "../../../../../../../../http/responses";
import { getResourceCatalogService, requireProjectRole } from "../../../../../../../../services";

export default defineHandler(async (event) => {
  try { requireAuth(event.req); } catch (error) { return unauthorizedResponse(error); }
  try {
    await requireProjectRole(event.req, ["admin"]);
    const kind = resourceKindSchema.parse(event.context.params?.kind);
    const id = decodeURIComponent(event.context.params?.id ?? "");
    const deleted = await (await getResourceCatalogService(event.req)).delete(kind, id);
    if (!deleted) return jsonResponse({ error: "Resource was not found." }, { status: 404 });
    return jsonResponse({ message: "Resource deleted." });
  } catch (error) {
    return errorResponse(error);
  }
});
