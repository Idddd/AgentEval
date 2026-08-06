import { createAgentGardenEntrySchema } from "@tasklattice/contracts";
import { defineHandler } from "nitro";
import {
  requireAuth,
  unauthorizedResponse,
} from "../../../../../../../auth/auth";
import {
  errorResponse,
  jsonResponse,
} from "../../../../../../../http/responses";
import {
  getAgentGardenService,
  requireProjectRole,
} from "../../../../../../../services";

export default defineHandler(async (event) => {
  try {
    requireAuth(event.req);
  } catch (error) {
    return unauthorizedResponse(error);
  }
  try {
    await requireProjectRole(event.req, ["admin"]);
    const input = createAgentGardenEntrySchema.parse(await event.req.json());
    const created = await (
      await getAgentGardenService(event.req)
    ).register(input);
    return jsonResponse(created, {
      status: 201,
      headers: {
        location:
          `/api/v1/projects/${encodeURIComponent(
            event.context.params?.projectId ?? "",
          )}/agent-garden/agents/${encodeURIComponent(created.id)}`,
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
});
