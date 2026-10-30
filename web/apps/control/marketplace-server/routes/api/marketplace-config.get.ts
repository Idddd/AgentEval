import { defineHandler } from "nitro";
import { runtimeResponse } from "../../guard-api";
import { v3RuntimeResponse } from "../../nmgr-connection-api";
export default defineHandler(event => new URL(event.req.url).searchParams.get("workspace") === "v3" ? v3RuntimeResponse(event.req) : runtimeResponse(process.env));
