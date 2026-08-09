import { defineHandler } from "nitro";
import { databaseHealth } from "../../db/prisma";
import { jsonResponse } from "../../http/responses";

export default defineHandler(async () => {
  try {
    await databaseHealth();
    return jsonResponse({ ok: true, database: "postgresql", runtime: "openshell" });
  } catch (error) {
    return jsonResponse(
      {
        ok: false,
        database: "unavailable",
        message: error instanceof Error ? error.message : "Database unavailable.",
      },
      { status: 503 },
    );
  }
});
