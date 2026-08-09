import { z } from "zod";
import { defineHandler } from "nitro";
import { requireAuth, unauthorizedResponse } from "../../../../auth/auth";
import { errorResponse, noContentResponse } from "../../../../http/responses";
import { PersonalProfileService } from "../../../../profiles/personal-profile-service";

const inputSchema = z
  .object({
    currentPassword: z.string().min(1).max(128),
    newPassword: z
      .string()
      .min(12, "New password must contain at least 12 characters.")
      .max(128),
  })
  .refine(
    (input) => input.currentPassword !== input.newPassword,
    "New password must be different from the current password.",
  );

export default defineHandler(async (event) => {
  let auth;
  try {
    auth = requireAuth(event.req);
  } catch (error) {
    return unauthorizedResponse(error);
  }
  try {
    const input = inputSchema.parse(await event.req.json());
    await new PersonalProfileService().resetPassword(auth, input);
    return noContentResponse();
  } catch (error) {
    return errorResponse(error);
  }
});
