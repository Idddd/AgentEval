import { defineHandler } from "nitro";
import { requireAuth, unauthorizedResponse } from "../../../../../../auth/auth";
import { errorResponse, jsonResponse } from "../../../../../../http/responses";
import {
  parseCostQuery,
  parseGroupBy,
  parseLimit,
  parseTrendGranularity,
} from "../../../../../../providers/cost-request";
import { getCostService } from "../../../../../../services";

export default defineHandler(async (event) => {
  try { requireAuth(event.req); } catch (error) { return unauthorizedResponse(error); }
  try {
    return jsonResponse(await (await getCostService(event.req)).trend(
      parseCostQuery(event.req),
      parseGroupBy(event.req),
      parseTrendGranularity(event.req),
      parseLimit(event.req, "top_n", 5, 20),
    ));
  } catch (error) {
    return errorResponse(error);
  }
});
