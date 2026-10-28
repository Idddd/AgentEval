import { defineHandler } from "nitro";
import { runtimeResponse } from "../../guard-api";
export default defineHandler(event => runtimeResponse(process.env, new URL(event.req.url).searchParams.get("workspace") === "v3"));
