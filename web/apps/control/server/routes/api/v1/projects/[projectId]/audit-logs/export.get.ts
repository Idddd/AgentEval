import { defineHandler } from "nitro";
import { requireAuth, unauthorizedResponse } from "../../../../../../auth/auth";
import {
  createAuditLogCsv,
  parseAuditLogQuery,
} from "../../../../../../audit-logs/audit-log-http";
import { errorResponse } from "../../../../../../http/responses";
import {
  getAuditLogService,
  requireProjectRole,
} from "../../../../../../services";

export default defineHandler(async (event) => {
  try {
    requireAuth(event.req);
  } catch (error) {
    return unauthorizedResponse(error);
  }

  try {
    await requireProjectRole(event.req, ["admin"]);
    const query = parseAuditLogQuery(event.req);
    const events = await (await getAuditLogService(event.req)).listForExport(query);
    const date = new Date().toISOString().slice(0, 10);
    return new Response(createAuditLogCsv(events), {
      headers: {
        "cache-control": "no-store",
        "content-disposition": `attachment; filename="audit-logs-${date}.csv"`,
        "content-type": "text/csv; charset=utf-8",
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
});
