import { defineHandler } from "nitro";
import { requireAuth, unauthorizedResponse } from "../../../../../../auth/auth";
import { errorResponse, jsonResponse } from "../../../../../../http/responses";
import { getPolicyService } from "../../../../../../services";

export default defineHandler(async (event) => {
  try { requireAuth(event.req); } catch (error) { return unauthorizedResponse(error); }
  try {
    const catalog = await (await getPolicyService(event.req)).list();
    return jsonResponse({
      defaultPolicyId: catalog.defaultPolicyId,
      templatePolicyYaml: catalog.templatePolicyYaml,
      data: catalog.policies,
    });
  } catch (error) { return errorResponse(error); }
});
