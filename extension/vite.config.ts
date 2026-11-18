import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";

// Extension pages (popup, blocked, abort) + the background service worker.
// The content script is a separate IIFE build (vite.content.config.ts) because
// Chrome can't load content scripts as ES modules.
const here = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  root: here("./src"),
  // VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY come from the repo's .env.local.
  envDir: here(".."),
  publicDir: here("./public"),
  base: "/",
  build: {
    outDir: here("./dist"),
    emptyOutDir: true,
    target: "chrome120",
    modulePreload: false,
    rollupOptions: {
      input: {
        popup: here("./src/popup/index.html"),
        blocked: here("./src/pages/blocked.html"),
        abort: here("./src/pages/abort.html"),
        bad: here("./src/pages/bad.html"),
        siren: here("./src/pages/siren.html"),
        background: here("./src/background/index.ts"),
      },
      output: {
        entryFileNames: (chunk) => (chunk.name === "background" ? "background.js" : "assets/[name]-[hash].js"),
      },
    },
  },
});
