import { fileURLToPath, URL } from "node:url";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { nitro } from "nitro/vite";
import { defineConfig } from "vite";

export default defineConfig({
  server: {
    host: process.env.HOST || "0.0.0.0",
    port: Number(process.env.PORT) || 8080,
  },
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  plugins: [
    nitro({
      // Marketplace is a standalone UI. Do not boot the legacy control-plane
      // jobs, database seeds or runtime endpoints just to preview the catalog.
      serverDir: "marketplace-server",
    }),
    tailwindcss(),
    tanstackStart(),
    react(),
  ],
});
