import { defineHandler } from "nitro";
import { requireAuth, unauthorizedResponse } from "../../../../../../auth/auth";
import { errorResponse, jsonResponse } from "../../../../../../http/responses";
import { getProviderService } from "../../../../../../services";

export default defineHandler(async (event) => {
  try {
    requireAuth(event.req);
  } catch (error) {
    return unauthorizedResponse(error);
  }
  try {
    return jsonResponse({
      data: await (await getProviderService(event.req)).listAccounts(),
    });
  } catch (error) {
    return errorResponse(error);
  }
});
