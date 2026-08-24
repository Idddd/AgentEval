import { defineHandler } from "nitro";
import { requireAuth, unauthorizedResponse } from "../../../../../../../../auth/auth";
import { errorResponse } from "../../../../../../../../http/responses";
import { getResourceCatalogService } from "../../../../../../../../services";

export default defineHandler(async (event) => {
  try {
    requireAuth(event.req);
  } catch (error) {
    return unauthorizedResponse(error);
  }
  try {
    const id = decodeURIComponent(event.context.params?.id ?? "");
    const service = await getResourceCatalogService(event.req);
    const artifact = await service.skillArtifact(id);
    const headers = new Headers({
      "access-control-allow-origin": "*",
      "access-control-expose-headers": "content-disposition, digest",
      "content-disposition": `attachment; filename="${artifact.fileName}"`,
      "content-type": artifact.contentType,
      digest: artifact.digest,
    });
    const body = new Uint8Array(artifact.archive).buffer;
    return new Response(body, { headers });
  } catch (error) {
    return errorResponse(error);
  }
});
