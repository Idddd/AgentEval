import { defineHandler } from "nitro";
import { requireAuth, unauthorizedResponse } from "../../../../../../auth/auth";
import { errorResponse, jsonResponse } from "../../../../../../http/responses";
import { parseCostQuery, parseGroupBy, parseLimit } from "../../../../../../providers/cost-request";
import { getCostService } from "../../../../../../services";

export default defineHandler(async (event) => {
  try { requireAuth(event.req); } catch (error) { return unauthorizedResponse(error); }
  try {
    return jsonResponse(await (await getCostService(event.req)).ranking(
      parseCostQuery(event.req),
      parseGroupBy(event.req),
      parseLimit(event.req, "limit", 5, 100),
    ));
  } catch (error) {
    return errorResponse(error);
  }
});
