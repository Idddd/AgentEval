export function applyDocumentCacheHeaders(response: Response): void {
  const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
  if (!contentType.includes("text/html")) return;

  response.headers.set(
    "cache-control",
    "no-store, no-cache, must-revalidate, max-age=0",
  );
  response.headers.set("expires", "0");
  response.headers.set("pragma", "no-cache");
}
