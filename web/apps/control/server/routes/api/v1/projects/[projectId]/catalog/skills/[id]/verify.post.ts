import { defineHandler } from "nitro";
import { requireAuth, unauthorizedResponse } from "../../../../../../../../auth/auth";
import { errorResponse, jsonResponse } from "../../../../../../../../http/responses";
import { getResourceCatalogService } from "../../../../../../../../services";

export default defineHandler(async (event) => {
  try {
    requireAuth(event.req);
  } catch (error) {
    return unauthorizedResponse(error);
  }
  try {
    const id = decodeURIComponent(event.context.params?.id ?? "");
    const service = await getResourceCatalogService(event.req);
    return jsonResponse(await service.verifySkillArtifact(id));
  } catch (error) {
    return errorResponse(error);
  }
});
