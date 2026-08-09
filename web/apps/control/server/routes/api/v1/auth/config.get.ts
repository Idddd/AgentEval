import { defineHandler } from "nitro";
import { publicAuthConfig } from "../../../../auth/auth";
import { jsonResponse } from "../../../../http/responses";

export default defineHandler(() => {
  try {
    return jsonResponse(publicAuthConfig());
  } catch (error) {
    return jsonResponse(
      {
        error: "Auth configuration error",
        message: error instanceof Error ? error.message : "Invalid auth configuration.",
      },
      { status: 500 },
    );
  }
});
