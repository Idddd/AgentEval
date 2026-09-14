import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { brandingResponse } from "./branding";

let directory: string;
beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), "marketplace-branding-"));
  vi.stubEnv("BRAND_LOGO_PATH", "");
  vi.stubEnv("BRAND_FAVICON_PATH", "");
});
afterEach(async () => {
  vi.unstubAllEnvs();
  await rm(directory, { recursive: true, force: true });
});

describe("runtime branding", () => {
  it("keeps default icons when no files are configured", async () => {
    for (const asset of ["logo", "favicon"] as const) {
      const response = await brandingResponse(asset);
      expect(response.status).toBe(200);
      expect(response.headers.get("X-Branding-Source")).toBe("default");
      expect(await response.text()).toContain(
        '<svg xmlns="http://www.w3.org/2000/svg"',
      );
    }
  });
  it("serves independently configured icons with safe headers", async () => {
    const logo = join(directory, "logo.svg");
    const favicon = join(directory, "favicon.ico");
    await writeFile(
      logo,
      '<svg xmlns="http://www.w3.org/2000/svg"><circle r="10"/></svg>',
    );
    await writeFile(favicon, new Uint8Array([0, 0, 1, 0, 1, 0]));
    vi.stubEnv("BRAND_LOGO_PATH", logo);
    vi.stubEnv("BRAND_FAVICON_PATH", favicon);
    const response = await brandingResponse("logo");
    expect(response.headers.get("X-Branding-Source")).toBe("custom");
    expect(response.headers.get("Content-Type")).toBe("image/svg+xml");
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(response.headers.get("Content-Security-Policy")).toContain(
      "sandbox",
    );
    expect(await response.text()).toContain('circle r="10"');
    const icon = await brandingResponse("favicon");
    expect(icon.headers.get("Content-Type")).toBe("image/x-icon");
    expect(new Uint8Array(await icon.arrayBuffer())).toEqual(
      new Uint8Array([0, 0, 1, 0, 1, 0]),
    );
  });
  it("reads replacements without restarting the server", async () => {
    const logo = join(directory, "logo.svg");
    vi.stubEnv("BRAND_LOGO_PATH", logo);
    expect(
      (await brandingResponse("logo")).headers.get("X-Branding-Source"),
    ).toBe("default");
    await writeFile(logo, '<svg id="first"/>');
    expect(await (await brandingResponse("logo")).text()).toContain("first");
    await writeFile(logo, '<svg id="second"/>');
    expect(await (await brandingResponse("logo")).text()).toContain("second");
  });
  it.each([".png", ".webp", ".jpg", ".jpeg", ".ico", ".SVG"])(
    "supports %s files",
    async (extension) => {
      const path = join(directory, `asset${extension}`);
      await writeFile(path, new Uint8Array([1, 2, 3]));
      vi.stubEnv("BRAND_LOGO_PATH", path);
      expect(
        (await brandingResponse("logo")).headers.get("X-Branding-Source"),
      ).toBe("custom");
    },
  );
  it("rejects unsupported, empty, oversized and directory inputs", async () => {
    const unsupported = join(directory, "secret.txt");
    const empty = join(directory, "empty.svg");
    const oversized = join(directory, "oversized.png");
    await writeFile(unsupported, "not an image");
    await writeFile(empty, "");
    await writeFile(oversized, new Uint8Array(2 * 1024 * 1024 + 1));
    for (const path of [
      unsupported,
      empty,
      oversized,
      directory,
      join(directory, "missing.svg"),
    ]) {
      vi.stubEnv("BRAND_LOGO_PATH", path);
      const response = await brandingResponse("logo");
      expect(response.headers.get("X-Branding-Source")).toBe("default");
      expect(await response.text()).not.toContain("not an image");
    }
  });
});
