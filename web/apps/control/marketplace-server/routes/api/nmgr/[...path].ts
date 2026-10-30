import { defineHandler } from "nitro";
import { nmgrRequest } from "../../../nmgr-connection-api";
export default defineHandler(event => nmgrRequest(event.req));
