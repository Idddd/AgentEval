import { createSandboxPolicySchema } from "@tasklattice/contracts";
import { defineHandler } from "nitro";
import { requireAuth, unauthorizedResponse } from "../../../../../../auth/auth";
import { errorResponse, jsonResponse } from "../../../../../../http/responses";
import { getPolicyService, requireProjectRole } from "../../../../../../services";

export default defineHandler(async (event) => {
  try { requireAuth(event.req); } catch (error) { return unauthorizedResponse(error); }
  try {
    await requireProjectRole(event.req, ["admin"]);
    const input = createSandboxPolicySchema.parse(await event.req.json());
    const policy = await (await getPolicyService(event.req)).create(input);
    return jsonResponse(policy, {
      status: 201,
      headers: { location: `/api/v1/projects/${encodeURIComponent(event.context.params?.projectId ?? "")}/policies/${policy.id}` },
    });
  } catch (error) { return errorResponse(error); }
});
