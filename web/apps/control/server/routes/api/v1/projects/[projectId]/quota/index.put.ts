import { updateProjectQuotaSchema } from "@tasklattice/contracts";
import { defineHandler } from "nitro";
import { requireAuth, unauthorizedResponse } from "../../../../../../auth/auth";
import { errorResponse, jsonResponse } from "../../../../../../http/responses";
import { getProjectQuotaService, requireProjectRole } from "../../../../../../services";

export default defineHandler(async (event) => {
  let actor: string;
  try { actor = requireAuth(event.req).user.username; } catch (error) { return unauthorizedResponse(error); }
  try {
    await requireProjectRole(event.req, ["admin"]);
    const input = updateProjectQuotaSchema.parse(await event.req.json());
    return jsonResponse(await (await getProjectQuotaService(event.req)).update(input, actor));
  } catch (error) {
    return errorResponse(error);
  }
});
