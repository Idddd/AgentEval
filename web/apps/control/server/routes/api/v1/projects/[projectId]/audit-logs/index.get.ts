import { defineHandler } from "nitro";
import { requireAuth, unauthorizedResponse } from "../../../../../../auth/auth";
import { errorResponse, jsonResponse } from "../../../../../../http/responses";
import {
  getAuditLogService,
  requireProjectRole,
} from "../../../../../../services";
import { parseAuditLogQuery } from "../../../../../../audit-logs/audit-log-http";

export default defineHandler(async (event) => {
  try {
    requireAuth(event.req);
  } catch (error) {
    return unauthorizedResponse(error);
  }

  try {
    await requireProjectRole(event.req, ["admin"]);
    return jsonResponse(
      await (await getAuditLogService(event.req)).list(
        parseAuditLogQuery(event.req),
      ),
    );
  } catch (error) {
    return errorResponse(error);
  }
});
