import { z } from "zod";
import { defineHandler } from "nitro";
import { unauthorizedResponse } from "../../../../../../auth/auth";
import { errorResponse, jsonResponse } from "../../../../../../http/responses";
import { ProjectService } from "../../../../../../projects/project-service";

const inputSchema = z.object({
  email: z.email(),
  role: z.enum(["admin", "member"]),
});

export default defineHandler(async (event) => {
  const service = new ProjectService();
  try {
    const { userId } = await service.authenticate(event.req);
    const input = inputSchema.parse(await event.req.json());
    return jsonResponse(await service.invite(
      decodeURIComponent(event.context.params?.projectId ?? ""),
      userId,
      input.email,
      input.role,
    ), { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message.includes("authentication")) return unauthorizedResponse(error);
    return errorResponse(error);
  }
});
