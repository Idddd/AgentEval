import { defineHandler } from "nitro";
import { z } from "zod";
import { requireAuth, unauthorizedResponse } from "../../../../../../../auth/auth";
import { errorResponse, jsonResponse } from "../../../../../../../http/responses";
import { getAgentService } from "../../../../../../../services";

export default defineHandler(async (event) => {
  try {
    requireAuth(event.req);
  } catch (error) {
    return unauthorizedResponse(error);
  }
  try {
    const agentId = z.string().uuid().parse(event.context.params?.instanceId);
    const events = await (await getAgentService(event.req)).getAudit(agentId);
    if (!events) return jsonResponse({ error: "Agent not found." }, { status: 404 });
    return jsonResponse({ data: events });
  } catch (error) {
    return errorResponse(error);
  }
});
