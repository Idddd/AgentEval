import { defineHandler } from "nitro";
import { requireAuth, unauthorizedResponse } from "../../../../../../../auth/auth";
import { errorResponse, jsonResponse } from "../../../../../../../http/responses";
import {
  getProviderService,
  requireProjectRole,
} from "../../../../../../../services";

export default defineHandler(async (event) => {
  try {
    requireAuth(event.req);
  } catch (error) {
    return unauthorizedResponse(error);
  }
  try {
    await requireProjectRole(event.req, ["admin"]);
    const providerId = event.context.params?.providerId;
    if (!providerId) {
      return jsonResponse(
        { error: "Provider connection id is required." },
        { status: 400 },
      );
    }
    const discovery = await (
      await getProviderService(event.req)
    ).discoverAccount(providerId);
    return discovery
      ? jsonResponse(discovery)
      : jsonResponse(
          { error: "Provider connection not found." },
          { status: 404 },
        );
  } catch (error) {
    return errorResponse(error);
  }
});
