import { defineHandler } from "nitro";
import { requireAuth, unauthorizedResponse } from "../../../../../../../auth/auth";
import { errorResponse, jsonResponse } from "../../../../../../../http/responses";
import { getAccessPolicyService } from "../../../../../../../services";

export default defineHandler(async (event) => {
  try { requireAuth(event.req); } catch (error) { return unauthorizedResponse(error); }
  try {
    return jsonResponse(await (await getAccessPolicyService(event.req)).get(
      decodeURIComponent(event.context.params?.policyId ?? ""),
    ));
  } catch (error) { return errorResponse(error); }
});
