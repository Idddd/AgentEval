import { defineHandler } from "nitro";
import { handleLocalLogin } from "../../../../auth/auth";

export default defineHandler((event) => handleLocalLogin(event.req));
