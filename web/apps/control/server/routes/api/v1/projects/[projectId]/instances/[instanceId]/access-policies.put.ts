import { updateInstanceAccessPoliciesSchema } from "@tasklattice/contracts";
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
  getAgentService,
  requireProjectRole,
} from "../../../../../../../services";

export default defineHandler(async (event) => {
  let auth;
  try {
    auth = requireAuth(event.req);
  } catch (error) {
    return unauthorizedResponse(error);
  }
  try {
    await requireProjectRole(event.req, ["admin"]);
    const input = updateInstanceAccessPoliciesSchema.parse(
      await event.req.json(),
    );
    return jsonResponse(
      await (
        await getAgentService(event.req)
      ).updateAccessPolicies(
        decodeURIComponent(event.context.params?.instanceId ?? ""),
        input.accessPolicyIds,
        auth.user.displayName || auth.user.username,
      ),
    );
  } catch (error) {
    return errorResponse(error);
  }
});
