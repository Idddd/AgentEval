import { discoverProviderModelsSchema } from "@tasklattice/contracts";
import { defineHandler } from "nitro";
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
    const input = discoverProviderModelsSchema.parse(await event.req.json());
    return jsonResponse(await (await getProviderService(event.req)).discover(input));
  } catch (error) {
    return errorResponse(error);
  }
});
