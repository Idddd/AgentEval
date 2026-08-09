import { updateSandboxPolicySchema } from "@tasklattice/contracts";
import { defineHandler } from "nitro";
import { requireAuth, unauthorizedResponse } from "../../../../../../../auth/auth";
import { errorResponse, jsonResponse } from "../../../../../../../http/responses";
import { getPolicyService, requireProjectRole } from "../../../../../../../services";

export default defineHandler(async (event) => {
  try { requireAuth(event.req); } catch (error) { return unauthorizedResponse(error); }
  try {
    await requireProjectRole(event.req, ["admin"]);
    const policyId = decodeURIComponent(event.context.params?.policyId ?? "");
    const input = updateSandboxPolicySchema.parse(await event.req.json());
    return jsonResponse(await (await getPolicyService(event.req)).update(policyId, input));
  } catch (error) { return errorResponse(error); }
});
