import { fileURLToPath, URL } from "node:url";
import { readFileSync } from "node:fs";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";

if (process.env.TALI_UI_DEMO !== "true") throw new Error("This preview requires TALI_UI_DEMO=true");
const fixtures = ["api/marketplace-config", "api/branding/logo", "api/branding/favicon"].map((path) => ({
  path,
  content: readFileSync(new URL(`./preview-public/${path}`, import.meta.url)),
  type: path === "api/marketplace-config" ? "application/json" : "image/svg+xml",
}));
export default defineConfig({ cacheDir: ".vite-preview",
  define: { __TALI_UI_DEMO__: "true" },
  server: { host: "127.0.0.1", port: 18085, strictPort: true },
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  plugins: [
    {
      name: "local-preview-api-fixtures",
      configureServer(server) {
        server.middlewares.use((request, response, next) => {
          const fixture = fixtures.find((item) => `/${item.path}` === request.url?.split("?")[0]);
          if (!fixture) return next();
          response.setHeader("Content-Type", fixture.type);
          response.end(fixture.content);
        });
      },
      generateBundle() {
        if (this.environment.name !== "client") return;
        for (const fixture of fixtures)
          this.emitFile({ type: "asset", fileName: fixture.path, source: fixture.content });
      },
    },
    tailwindcss(), tanstackStart({ spa: { enabled: true } }), react(),
  ],
});
