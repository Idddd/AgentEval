import { z } from "zod";
import { defineHandler } from "nitro";
import { requireAuth, unauthorizedResponse } from "../../../../auth/auth";
import { errorResponse, jsonResponse } from "../../../../http/responses";
import { PersonalProfileService } from "../../../../profiles/personal-profile-service";

const inputSchema = z.object({
  city: z.string().trim().max(120),
  theme: z.enum(["system", "light", "dark"]),
  timezone: z.string().trim().min(1).max(120).refine((timezone) => {
    try {
      new Intl.DateTimeFormat("en-US", { timeZone: timezone }).format();
      return true;
    } catch {
      return false;
    }
  }, "Invalid timezone."),
});

export default defineHandler(async (event) => {
  let auth;
  try {
    auth = requireAuth(event.req);
  } catch (error) {
    return unauthorizedResponse(error);
  }
  try {
    const input = inputSchema.parse(await event.req.json());
    return jsonResponse(await new PersonalProfileService().update(auth, input));
  } catch (error) {
    return errorResponse(error);
  }
});
