import { defineHandler } from "nitro";
import { openApiDocument } from "../../../http/openapi";
import { jsonResponse } from "../../../http/responses";

export default defineHandler(() => jsonResponse(openApiDocument));
