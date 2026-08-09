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
    const destroyed = await (await getAgentService(event.req)).destroy(id);
    return destroyed
      ? jsonResponse(
          { id, status: "DESTROYING", accepted: true },
          { status: 202 },
        )
      : jsonResponse({ error: "Agent not found." }, { status: 404 });
  } catch (error) {
    return errorResponse(error);
  }
});
