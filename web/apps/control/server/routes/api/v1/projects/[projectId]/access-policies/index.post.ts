import { createAccessPolicySchema } from "@tasklattice/contracts";
import { defineHandler } from "nitro";
import { requireAuth, unauthorizedResponse } from "../../../../../../auth/auth";
import { errorResponse, jsonResponse } from "../../../../../../http/responses";
import { getAccessPolicyService, requireProjectRole } from "../../../../../../services";

export default defineHandler(async (event) => {
  let auth;
  try { auth = requireAuth(event.req); } catch (error) { return unauthorizedResponse(error); }
  try {
    await requireProjectRole(event.req, ["admin"]);
    const policy = await (await getAccessPolicyService(event.req)).create(
      createAccessPolicySchema.parse(await event.req.json()),
      auth.user.displayName || auth.user.username,
    );
    return jsonResponse(policy, {
      status: 201,
      headers: {
        location: `/api/v1/projects/${encodeURIComponent(event.context.params?.projectId ?? "")}/access-policies/${policy.id}`,
      },
    });
  } catch (error) { return errorResponse(error); }
});
