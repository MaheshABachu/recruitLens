import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";

const here = (p: string) => fileURLToPath(new URL(p, import.meta.url));

// Content script: one self-contained IIFE file, appended to dist/ after the
// main build (emptyOutDir: false).
export default defineConfig({
  publicDir: false,
  build: {
    outDir: here("./dist"),
    emptyOutDir: false,
    target: "chrome120",
    lib: {
      entry: here("./src/content/index.ts"),
      formats: ["iife"],
      name: "VantageFocus",
      fileName: () => "content.js",
    },
  },
});
