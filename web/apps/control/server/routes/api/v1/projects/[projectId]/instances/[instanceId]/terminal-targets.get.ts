import { defineHandler } from "nitro";
import { z } from "zod";
import { requireAuth, unauthorizedResponse } from "../../../../../../../auth/auth";
import { errorResponse, jsonResponse } from "../../../../../../../http/responses";
import { runtimeStatusFromHealth } from "../../../../../../../runtime/runtime-status";
import { getAgentService } from "../../../../../../../services";
import { terminalTargetsForAgent } from "../../../../../../../terminal/terminal-targets";

export default defineHandler(async (event) => {
  try {
    requireAuth(event.req);
  } catch (error) {
    return unauthorizedResponse(error);
  }
  try {
    const id = z.string().uuid().parse(event.context.params?.instanceId);
    const service = await getAgentService(event.req);
    const agent = await service.get(id);
    if (!agent)
      return jsonResponse({ error: "Agent not found." }, { status: 404 });
    const capability = runtimeStatusFromHealth(
      await service.runner.getHealth(),
    ).terminal;
    return jsonResponse({ data: terminalTargetsForAgent(agent, capability) });
  } catch (error) {
    return errorResponse(error);
  }
});
