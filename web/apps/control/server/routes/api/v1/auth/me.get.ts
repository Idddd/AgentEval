import { defineHandler } from "nitro";
import { handleAuthMe } from "../../../../auth/auth";

export default defineHandler((event) => handleAuthMe(event.req));
