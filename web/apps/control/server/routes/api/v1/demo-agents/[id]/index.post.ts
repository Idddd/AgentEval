import { defineHandler } from "nitro";
import { runDemoAgentMessage } from "../../../../../agent-garden/demo-agent-runtime";
import {
  errorResponse,
  jsonResponse,
} from "../../../../../http/responses";

export default defineHandler(async (event) => {
  try {
    const id = decodeURIComponent(event.context.params?.id ?? "");
    return jsonResponse(
      runDemoAgentMessage(id, await event.req.json()),
    );
  } catch (error) {
    return errorResponse(error);
  }
});
