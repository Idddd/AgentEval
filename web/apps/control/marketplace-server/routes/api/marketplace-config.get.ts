import { defineHandler } from "nitro";
import { runtimeResponse } from "../../guard-api";
export default defineHandler(() => runtimeResponse());
