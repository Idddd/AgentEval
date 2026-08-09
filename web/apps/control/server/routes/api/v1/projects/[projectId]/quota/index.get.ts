import { defineHandler } from "nitro";
import { requireAuth, unauthorizedResponse } from "../../../../../../auth/auth";
import { errorResponse, jsonResponse } from "../../../../../../http/responses";
import { getProjectQuotaService, requireProjectRole } from "../../../../../../services";

export default defineHandler(async (event) => {
  try { requireAuth(event.req); } catch (error) { return unauthorizedResponse(error); }
  try {
    await requireProjectRole(event.req, ["admin", "member"]);
    return jsonResponse(await (await getProjectQuotaService(event.req)).get());
  } catch (error) {
    return errorResponse(error);
  }
});
