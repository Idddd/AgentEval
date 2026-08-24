import { defineHandler } from "nitro";
import { requireAuth, unauthorizedResponse } from "../../../../../../../auth/auth";
import { errorResponse, jsonResponse } from "../../../../../../../http/responses";
import { getModelRoutingService } from "../../../../../../../services";

export default defineHandler(async (event) => {
  try { requireAuth(event.req); } catch (error) { return unauthorizedResponse(error); }
  try {
    const routing = await (await getModelRoutingService(event.req)).get(decodeURIComponent(event.context.params?.routingId ?? ""));
    return routing ? jsonResponse(routing) : jsonResponse({ error: "Routing not found." }, { status: 404 });
  } catch (error) { return errorResponse(error); }
});
