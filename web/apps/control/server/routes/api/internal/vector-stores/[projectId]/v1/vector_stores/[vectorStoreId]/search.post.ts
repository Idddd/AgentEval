import { defineHandler } from "nitro";
import { ElasticsearchVectorStoreBridge } from "../../../../../../../../catalog/elasticsearch-vector-store-bridge";
import { isVectorStoreBridgeAuthorized } from "../../../../../../../../catalog/vector-store-bridge-auth";
import { errorResponse, jsonResponse } from "../../../../../../../../http/responses";
import { ProjectStore } from "../../../../../../../../projects/project-store";

export default defineHandler(async (event) => {
  if (!isVectorStoreBridgeAuthorized(event.req.headers.get("authorization"))) {
    return jsonResponse({ error: "Unauthorized." }, { status: 401 });
  }
  try {
    const projectId = decodeURIComponent(event.context.params?.projectId ?? "");
    const vectorStoreId = decodeURIComponent(event.context.params?.vectorStoreId ?? "");
    if (!projectId || !vectorStoreId) {
      return jsonResponse({ error: "Project and Vector Store IDs are required." }, { status: 400 });
    }
    const bridge = new ElasticsearchVectorStoreBridge(new ProjectStore(projectId));
    return jsonResponse(await bridge.search(vectorStoreId, await event.req.json()));
  } catch (error) {
    return errorResponse(error);
  }
});
