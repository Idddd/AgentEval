import { defineHandler } from "nitro";
import { requireAuth, unauthorizedResponse } from "../../../../../../../auth/auth";
import { errorResponse, noContentResponse } from "../../../../../../../http/responses";
import { getAccessPolicyService, requireProjectRole } from "../../../../../../../services";

export default defineHandler(async (event) => {
  try { requireAuth(event.req); } catch (error) { return unauthorizedResponse(error); }
  try {
    await requireProjectRole(event.req, ["admin"]);
    await (await getAccessPolicyService(event.req)).delete(
      decodeURIComponent(event.context.params?.policyId ?? ""),
    );
    return noContentResponse();
  } catch (error) { return errorResponse(error); }
});
