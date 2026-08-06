import { defineHandler } from "nitro";
import { handleLogout } from "../../../../auth/auth";

export default defineHandler((event) => handleLogout(event.req));
