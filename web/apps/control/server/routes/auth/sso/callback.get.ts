import { defineHandler } from "nitro";
import { handleSsoCallback } from "../../../auth/auth";

export default defineHandler((event) => handleSsoCallback(event.req));
