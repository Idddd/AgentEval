import { defineHandler } from "nitro";
import { handleSsoStart } from "../../../../../auth/auth";

export default defineHandler((event) => handleSsoStart(event.req));
