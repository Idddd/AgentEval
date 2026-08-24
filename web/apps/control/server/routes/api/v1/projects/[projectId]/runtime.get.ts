import { defineHandler } from "nitro";
import { requireAuth, unauthorizedResponse } from "../../../../../auth/auth";
import { errorResponse, jsonResponse } from "../../../../../http/responses";
import { getAgentService } from "../../../../../services";
import { runtimeStatusFromHealth } from "../../../../../runtime/runtime-status";

export default defineHandler(async (event) => {
  try {
    requireAuth(event.req);
  } catch (error) {
    return unauthorizedResponse(error);
  }
  try {
    const service = await getAgentService(event.req);
    return jsonResponse(
      runtimeStatusFromHealth(await service.runner.getHealth()),
    );
  } catch (error) {
    return errorResponse(error);
  }
});
