import { defineHandler } from "nitro";
import { requireAuth, unauthorizedResponse } from "../../../../../../auth/auth";
import { errorResponse, jsonResponse } from "../../../../../../http/responses";
import { getProviderService } from "../../../../../../services";

export default defineHandler(async (event) => {
  try { requireAuth(event.req); } catch (error) { return unauthorizedResponse(error); }
  try {
    const accountId = new URL(event.req.url).searchParams.get("providerAccountId") ?? undefined;
    return jsonResponse({ data: await (await getProviderService(event.req)).listModels(accountId) });
  } catch (error) { return errorResponse(error); }
});
