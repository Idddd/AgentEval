import { defineHandler } from "nitro";
import { requireAuth, unauthorizedResponse } from "../../../../../../auth/auth";
import { errorResponse, jsonResponse } from "../../../../../../http/responses";
import { parseBreakdownQuery } from "../../../../../../providers/cost-request";
import { getCostService } from "../../../../../../services";

export default defineHandler(async (event) => {
  try { requireAuth(event.req); } catch (error) { return unauthorizedResponse(error); }
  try {
    return jsonResponse(await (await getCostService(event.req)).breakdown(parseBreakdownQuery(event.req)));
  } catch (error) {
    return errorResponse(error);
  }
});
