import { defineHandler } from "nitro";
import { f5Proxy } from "../../../f5-api";
export default defineHandler((event) => f5Proxy(event.req));
