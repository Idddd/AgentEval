import { defineHandler } from "nitro";
import {
  requireAuth,
  unauthorizedResponse,
} from "../../../../../../../../auth/auth";
import {
  errorResponse,
  jsonResponse,
} from "../../../../../../../../http/responses";
import {
  getAgentGardenService,
  requireProjectRole,
} from "../../../../../../../../services";

export default defineHandler(async (event) => {
  try {
    requireAuth(event.req);
  } catch (error) {
    return unauthorizedResponse(error);
  }
  try {
    await requireProjectRole(event.req, ["admin"]);
    const id = decodeURIComponent(event.context.params?.id ?? "");
    const removed = await (
      await getAgentGardenService(event.req)
    ).disconnect(id);
    if (!removed) {
      return jsonResponse(
        { error: "Agent connection was not found." },
        { status: 404 },
      );
    }
    return jsonResponse({ message: "Agent disconnected." });
  } catch (error) {
    return errorResponse(error);
  }
});
