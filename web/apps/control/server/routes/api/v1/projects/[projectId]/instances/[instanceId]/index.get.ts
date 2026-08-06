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
    const id = z.string().uuid().parse(event.context.params?.instanceId);
    const agent = await (await getAgentService(event.req)).get(id);
    return agent
      ? jsonResponse(agent)
      : jsonResponse({ error: "Agent not found." }, { status: 404 });
  } catch (error) {
    return errorResponse(error);
  }
});
