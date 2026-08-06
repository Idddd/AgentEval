import { defineHandler } from "nitro";
import { unauthorizedResponse } from "../../../../../../auth/auth";
import { errorResponse, jsonResponse } from "../../../../../../http/responses";
import { ProjectService } from "../../../../../../projects/project-service";

export default defineHandler(async (event) => {
  const service = new ProjectService();
  try {
    const { userId } = await service.authenticate(event.req);
    return jsonResponse(await service.members(
      decodeURIComponent(event.context.params?.projectId ?? ""),
      userId,
    ));
  } catch (error) {
    if (error instanceof Error && error.message.includes("authentication")) return unauthorizedResponse(error);
    return errorResponse(error);
  }
});
