import { defineHandler } from "nitro";
import {
  requireAuth,
  unauthorizedResponse,
} from "../../../../../../auth/auth";
import {
  errorResponse,
  jsonResponse,
} from "../../../../../../http/responses";
import { getAgentGardenService } from "../../../../../../services";

export default defineHandler(async (event) => {
  try {
    requireAuth(event.req);
  } catch (error) {
    return unauthorizedResponse(error);
  }
  try {
    return jsonResponse(
      await (await getAgentGardenService(event.req)).snapshot(),
    );
  } catch (error) {
    return errorResponse(error);
  }
});
