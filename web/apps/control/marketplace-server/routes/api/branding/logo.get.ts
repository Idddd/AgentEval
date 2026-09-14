import { defineHandler } from "nitro";
import { brandingResponse } from "../../../branding";

export default defineHandler(() => brandingResponse("logo"));
