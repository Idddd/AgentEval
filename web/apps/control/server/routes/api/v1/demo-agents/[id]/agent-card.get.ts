import { defineHandler } from "nitro";
import { demoAgentCard } from "../../../../../agent-garden/demo-agent-runtime";
import {
  errorResponse,
  jsonResponse,
} from "../../../../../http/responses";

export default defineHandler((event) => {
  try {
    const id = decodeURIComponent(event.context.params?.id ?? "");
    return jsonResponse(demoAgentCard(id));
  } catch (error) {
    return errorResponse(error);
  }
});
