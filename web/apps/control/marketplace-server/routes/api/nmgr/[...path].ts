import { defineHandler } from "nitro";
import { nmgrApi } from "../../../nmgr-api";
export default defineHandler(event => nmgrApi(event.req));
