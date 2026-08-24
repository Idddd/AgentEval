import { defineHandler } from "nitro";
import { z } from "zod";
import { requireAuth, unauthorizedResponse } from "../../../../../../../auth/auth";
import { errorResponse, jsonResponse } from "../../../../../../../http/responses";
import { getProviderService, requireProjectRole } from "../../../../../../../services";

export default defineHandler(async (event) => {
  try {
    requireAuth(event.req);
  } catch (error) {
    return unauthorizedResponse(error);
  }
  try {
    await requireProjectRole(event.req, ["admin"]);
    const modelId = z.string().uuid().parse(event.context.params?.modelId);
    const deleted = await (
      await getProviderService(event.req)
    ).deleteModelDeployment(modelId);
    return deleted
      ? jsonResponse({ message: "Model deployment removed." })
      : jsonResponse({ error: "Model deployment not found." }, { status: 404 });
  } catch (error) {
    return errorResponse(error);
  }
});
