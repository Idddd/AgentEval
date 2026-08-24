import { createAgentConnectionSchema } from "@tasklattice/contracts";
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
    const input = createAgentConnectionSchema.parse(await event.req.json());
    const connection = await (
      await getAgentGardenService(event.req)
    ).connect(input);
    return jsonResponse(connection, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
});
