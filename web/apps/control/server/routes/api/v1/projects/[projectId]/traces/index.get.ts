import { defineHandler } from "nitro";
import { requireAuth, unauthorizedResponse } from "../../../../../../auth/auth";
import { errorResponse, jsonResponse } from "../../../../../../http/responses";
import { requireProjectRole } from "../../../../../../services";
import { FixtureTraceRepository } from "../../../../../../traces/fixture-trace-repository";

const repository = new FixtureTraceRepository();

export default defineHandler(async (event) => {
  try {
    requireAuth(event.req);
  } catch (error) {
    return unauthorizedResponse(error);
  }

  try {
    await requireProjectRole(event.req, ["admin", "member"]);
    return jsonResponse({ data: await repository.list(), source: "fixture" });
  } catch (error) {
    return errorResponse(error);
  }
});
