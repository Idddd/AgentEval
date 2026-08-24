import { definePlugin } from "nitro";
import { applyDocumentCacheHeaders } from "../http/document-cache";

export default definePlugin((nitro) => {
  nitro.hooks.hook("response", async (response) => {
    applyDocumentCacheHeaders(response);
  });
});
