import { createAgentSchema } from "@tasklattice/contracts";
import { defineHandler } from "nitro";
import { requireAuth, unauthorizedResponse } from "../../../../../../auth/auth";
import { errorResponse, jsonResponse } from "../../../../../../http/responses";
import { getAgentService } from "../../../../../../services";

export default defineHandler(async (event) => {
  try {
    requireAuth(event.req);
  } catch (error) {
    return unauthorizedResponse(error);
  }
  try {
    const input = createAgentSchema.parse(await event.req.json());
    const agent = await (await getAgentService(event.req)).create(input);
    return jsonResponse(agent, {
      status: 202,
      headers: { location: `/api/v1/projects/${encodeURIComponent(event.context.params?.projectId ?? "")}/instances/${agent.id}` },
    });
  } catch (error) {
    return errorResponse(error);
  }
});
