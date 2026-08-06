import { createModelRoutingSchema } from "@tasklattice/contracts";
import { defineHandler } from "nitro";
import { requireAuth, unauthorizedResponse } from "../../../../../../auth/auth";
import { errorResponse, jsonResponse } from "../../../../../../http/responses";
import { getModelRoutingService, requireProjectRole } from "../../../../../../services";

export default defineHandler(async (event) => {
  try { requireAuth(event.req); } catch (error) { return unauthorizedResponse(error); }
  try {
    await requireProjectRole(event.req, ["admin"]);
    const profile = await (await getModelRoutingService(event.req)).create(createModelRoutingSchema.parse(await event.req.json()));
    return jsonResponse(profile, { status: 201, headers: { location: `/api/v1/projects/${encodeURIComponent(event.context.params?.projectId ?? "")}/model-routings/${profile.id}` } });
  } catch (error) { return errorResponse(error); }
});
