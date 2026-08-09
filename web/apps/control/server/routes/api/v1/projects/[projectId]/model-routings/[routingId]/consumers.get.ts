import { defineHandler } from "nitro";
import { requireAuth, unauthorizedResponse } from "../../../../../../../auth/auth";
import { errorResponse, jsonResponse } from "../../../../../../../http/responses";
import { getModelRoutingService } from "../../../../../../../services";

export default defineHandler(async (event) => {
  try { requireAuth(event.req); } catch (error) { return unauthorizedResponse(error); }
  try {
    const consumers = await (await getModelRoutingService(event.req)).consumers(decodeURIComponent(event.context.params?.routingId ?? ""));
    return jsonResponse({ data: consumers.map(({ liteLLMTokenId: _secretIdentifier, ...consumer }) => consumer) });
  }
  catch (error) { return errorResponse(error); }
});
