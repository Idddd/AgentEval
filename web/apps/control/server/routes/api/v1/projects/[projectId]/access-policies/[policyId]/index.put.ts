import { updateAccessPolicySchema } from "@tasklattice/contracts";
import { defineHandler } from "nitro";
import { requireAuth, unauthorizedResponse } from "../../../../../../../auth/auth";
import { errorResponse, jsonResponse } from "../../../../../../../http/responses";
import { getAccessPolicyService, requireProjectRole } from "../../../../../../../services";

export default defineHandler(async (event) => {
  let auth;
  try { auth = requireAuth(event.req); } catch (error) { return unauthorizedResponse(error); }
  try {
    await requireProjectRole(event.req, ["admin"]);
    return jsonResponse(await (await getAccessPolicyService(event.req)).update(
      decodeURIComponent(event.context.params?.policyId ?? ""),
      updateAccessPolicySchema.parse(await event.req.json()),
      auth.user.displayName || auth.user.username,
    ));
  } catch (error) { return errorResponse(error); }
});
