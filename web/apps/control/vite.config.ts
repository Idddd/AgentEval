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
    proxy: {
      "/api": "http://127.0.0.1:8000",
    },
  },
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  plugins: [
    nitro({
      serverDir: "server",
      features: { websocket: true },
    }),
    tailwindcss(),
    tanstackStart(),
    react(),
  ],
});
