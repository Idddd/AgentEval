import { fileURLToPath, URL } from "node:url";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { nitro } from "nitro/vite";
import { defineConfig } from "vite";

const uiDemo = process.env.TALI_UI_DEMO === "true";

export default defineConfig({
  define: {
    __TALI_UI_DEMO__: JSON.stringify(uiDemo),
  },
  server: {
    host: process.env.HOST || "0.0.0.0",
    port: Number(process.env.PORT) || 8080,
  },
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  plugins: [
    ...(uiDemo
      ? []
      : [
          nitro({
            serverDir: "server",
            features: { websocket: true },
          }),
        ]),
    tailwindcss(),
    tanstackStart({ spa: { enabled: uiDemo } }),
    react(),
  ],
});
