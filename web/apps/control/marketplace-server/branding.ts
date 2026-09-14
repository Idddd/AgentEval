import { readFile, stat } from "node:fs/promises";
import { extname } from "node:path";

type BrandAsset = "logo" | "favicon";
const MAX_BYTES = 2 * 1024 * 1024;
const MIME_TYPES: Record<string, string> = {
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".webp": "image/webp",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".ico": "image/x-icon",
};

function defaultIcon(asset: BrandAsset) {
  const favicon = asset === "favicon";
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
    ${favicon ? '<rect width="64" height="64" fill="#191a1b"/>' : ""}
    <g fill="none" stroke="${favicon ? "#f2f2f2" : "#191a1b"}" stroke-width="1.5">
      <path d="M8 10h48L32 56 8 10Z"/>
      <path d="M32 10v46M16 30h32M8 10l40 20M56 10 16 30M16 30l16 26M48 30 32 56"/>
    </g>
    <g fill="${favicon ? "#42e3ff" : "#008ca3"}" stroke="${favicon ? "#191a1b" : "#fafafa"}" stroke-width="1.5">
      <circle cx="8" cy="10" r="3.5"/><circle cx="32" cy="10" r="3.5"/><circle cx="56" cy="10" r="3.5"/>
      <circle cx="16" cy="30" r="3.5"/><circle cx="32" cy="30" r="3.5"/><circle cx="48" cy="30" r="3.5"/><circle cx="32" cy="56" r="3.5"/>
    </g>
  </svg>`;
}

// Paths are operator configuration only, never taken from request parameters.
// Read on each request so replacing a mounted file needs no image rebuild.
export async function brandingResponse(asset: BrandAsset): Promise<Response> {
  const path =
    process.env[asset === "logo" ? "BRAND_LOGO_PATH" : "BRAND_FAVICON_PATH"];
  let body: string | Uint8Array<ArrayBuffer> = defaultIcon(asset);
  let contentType = "image/svg+xml";
  let source = "default";
  const mime = path ? MIME_TYPES[extname(path).toLowerCase()] : undefined;
  if (path && mime) {
    try {
      const info = await stat(path);
      if (info.isFile() && info.size > 0 && info.size <= MAX_BYTES) {
        const bytes = await readFile(path);
        if (bytes.length > 0 && bytes.length <= MAX_BYTES) {
          body = new Uint8Array(bytes);
          contentType = mime;
          source = "custom";
        }
      }
    } catch {
      // Missing or unreadable optional branding must not break the application.
    }
  }
  return new Response(body, {
    headers: {
      "Content-Type": contentType,
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      "X-Branding-Source": source,
      // Uploaded SVGs are images, not a same-origin script execution surface.
      "Content-Security-Policy":
        "default-src 'none'; style-src 'unsafe-inline'; sandbox",
    },
  });
}
