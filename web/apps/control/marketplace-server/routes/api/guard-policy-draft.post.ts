import { defineHandler } from "nitro";
import { guardProxy } from "../../guard-api";
export default defineHandler((event) => guardProxy(event.req));
