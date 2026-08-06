import { defineHandler } from "nitro";
import { z } from "zod";
import { requireAuth, unauthorizedResponse } from "../../../../../../../auth/auth";
import { errorResponse, jsonResponse } from "../../../../../../../http/responses";
import { requireProjectRole } from "../../../../../../../services";
import { FixtureTraceRepository } from "../../../../../../../traces/fixture-trace-repository";

const repository = new FixtureTraceRepository();

export default defineHandler(async (event) => {
  try {
    requireAuth(event.req);
  } catch (error) {
    return unauthorizedResponse(error);
  }

  try {
    await requireProjectRole(event.req, ["admin", "member"]);
    const traceId = z.string().regex(/^[0-9a-f]{32}$/).parse(event.context.params?.traceId);
    const trace = await repository.getById(traceId);
    return trace
      ? jsonResponse(trace)
      : jsonResponse({ error: "Trace not found." }, { status: 404 });
  } catch (error) {
    return errorResponse(error);
  }
});
