import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    host: "127.0.0.1",
    port: Number(process.env.TRUECARE_WEB_PORT ?? 5173),
    strictPort: true,
    proxy: {
      "/api": `http://127.0.0.1:${process.env.TRUECARE_API_PORT ?? 3001}`,
    },
    watch: {
      ignored: [
        "**/.local/**",
        "**/.local-data/**",
        "**/test-results/**",
        "**/playwright-report/**",
        "**/docs/**",
      ],
    },
  },
  preview: { port: 4173 },
});
