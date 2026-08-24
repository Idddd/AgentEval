import { defineHandler } from "nitro";
import { requireAuth, unauthorizedResponse } from "../../../../auth/auth";
import { errorResponse, jsonResponse } from "../../../../http/responses";
import { PersonalProfileService } from "../../../../profiles/personal-profile-service";

export default defineHandler(async (event) => {
  let auth;
  try {
    auth = requireAuth(event.req);
  } catch (error) {
    return unauthorizedResponse(error);
  }
  try {
    return jsonResponse(await new PersonalProfileService().get(auth));
  } catch (error) {
    return errorResponse(error);
  }
});
