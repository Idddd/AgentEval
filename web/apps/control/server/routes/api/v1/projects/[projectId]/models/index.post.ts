import { createModelDeploymentSchema } from "@tasklattice/contracts";
import { defineHandler } from "nitro";
import { requireAuth, unauthorizedResponse } from "../../../../../../auth/auth";
import { errorResponse, jsonResponse } from "../../../../../../http/responses";
import { getProviderService, requireProjectRole } from "../../../../../../services";

export default defineHandler(async (event) => {
  try { requireAuth(event.req); } catch (error) { return unauthorizedResponse(error); }
  try {
    await requireProjectRole(event.req, ["admin"]);
    const input = createModelDeploymentSchema.parse(await event.req.json());
    const model = await (await getProviderService(event.req)).registerModel(input);
    return jsonResponse(model, { status: 201 });
  } catch (error) { return errorResponse(error); }
});
