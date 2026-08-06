import { defineHandler } from "nitro";
import { requireAuth, unauthorizedResponse } from "../../../../../../auth/auth";
import { errorResponse, jsonResponse } from "../../../../../../http/responses";
import { parseCostQuery } from "../../../../../../providers/cost-request";
import { getCostService } from "../../../../../../services";

export default defineHandler(async (event) => {
  try { requireAuth(event.req); } catch (error) { return unauthorizedResponse(error); }
  try {
    return jsonResponse(await (await getCostService(event.req)).summary(parseCostQuery(event.req)));
  } catch (error) {
    return errorResponse(error);
  }
});
