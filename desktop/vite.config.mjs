import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";

const here = (p) => fileURLToPath(new URL(p, import.meta.url));
const pkg = JSON.parse(readFileSync(here("./package.json"), "utf8"));

// Motor modülleri (ayrıştırma, hesap, PDF/Excel) ../assets/js altında kalır ve web sitesiyle paylaşılır.
export default defineConfig({
  plugins: [react()],
  base: "./",
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  resolve: {
    alias: {
      "@engine": here("../assets/js/app"),
      "@i18n": here("../assets/js/i18n.js"),
      "@common": here("../assets/js/common.js"),
      "@css": here("../assets/css")
    }
  },
  build: { outDir: "app", emptyOutDir: true, target: "es2022", chunkSizeWarningLimit: 2500 },
  server: { port: 5173, strictPort: true, fs: { allow: [here("..")] } }
});
