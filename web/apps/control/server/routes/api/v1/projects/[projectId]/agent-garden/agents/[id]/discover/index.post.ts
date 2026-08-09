import { defineHandler } from "nitro";
import {
  requireAuth,
  unauthorizedResponse,
} from "../../../../../../../../../auth/auth";
import {
  errorResponse,
  jsonResponse,
} from "../../../../../../../../../http/responses";
import {
  getAgentGardenService,
  requireProjectRole,
} from "../../../../../../../../../services";

export default defineHandler(async (event) => {
  try {
    requireAuth(event.req);
  } catch (error) {
    return unauthorizedResponse(error);
  }
  try {
    await requireProjectRole(event.req, ["admin"]);
    const id = decodeURIComponent(event.context.params?.id ?? "");
    return jsonResponse(
      await (await getAgentGardenService(event.req)).discover(id),
    );
  } catch (error) {
    return errorResponse(error);
  }
});
