import { updateModelRoutingSchema } from "@tasklattice/contracts";
import { defineHandler } from "nitro";
import { requireAuth, unauthorizedResponse } from "../../../../../../../auth/auth";
import { errorResponse, jsonResponse } from "../../../../../../../http/responses";
import { getModelRoutingService, requireProjectRole } from "../../../../../../../services";

export default defineHandler(async (event) => {
  try { requireAuth(event.req); } catch (error) { return unauthorizedResponse(error); }
  try {
    await requireProjectRole(event.req, ["admin"]);
    const id = decodeURIComponent(event.context.params?.routingId ?? "");
    return jsonResponse(await (await getModelRoutingService(event.req)).update(id, updateModelRoutingSchema.parse(await event.req.json())));
  } catch (error) { return errorResponse(error); }
});
