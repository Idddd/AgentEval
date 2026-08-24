import { z } from "zod";
import { defineHandler } from "nitro";
import { requireAuth, unauthorizedResponse } from "../../../../auth/auth";
import { errorResponse, jsonResponse } from "../../../../http/responses";
import { ProjectService } from "../../../../projects/project-service";

const inputSchema = z.object({
  confirmImmutableName: z.literal(true, {
    error: "Confirm that the Project name cannot be changed after creation.",
  }),
  name: z.string().trim().min(2).max(80),
  invitations: z.array(z.object({
    email: z.email().transform((email) => email.trim().toLowerCase()),
    role: z.enum(["admin", "member"]),
  })).max(25),
}).superRefine(({ invitations }, context) => {
  const seen = new Set<string>();
  invitations.forEach(({ email }, index) => {
    if (seen.has(email)) {
      context.addIssue({
        code: "custom",
        message: "Each invited email address must be unique.",
        path: ["invitations", index, "email"],
      });
    }
    seen.add(email);
  });
});

export default defineHandler(async (event) => {
  let auth;
  try { auth = requireAuth(event.req); } catch (error) { return unauthorizedResponse(error); }
  try {
    const service = new ProjectService();
    const input = inputSchema.parse(await event.req.json());
    return jsonResponse(
      await service.create(auth, input.name, input.invitations),
      { status: 201 },
    );
  } catch (error) {
    return errorResponse(error);
  }
});
