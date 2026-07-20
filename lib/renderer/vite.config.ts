import path from "node:path";
import { fileURLToPath } from "node:url";

import { defineConfig } from "vite-plus";
import react from "@vitejs/plugin-react";
import { astryxStylex } from "@astryxdesign/build/vite";

const rendererRoot = path.dirname(fileURLToPath(import.meta.url));
const isUnitTest = process.env.VITEST === "true" && process.env.NODE_ENV !== "production";

export default defineConfig({
  // @ts-ignore
  plugins: [...(isUnitTest ? [] : astryxStylex()), react()],
  resolve: isUnitTest
    ? {
        alias: {
          "@stylexjs/stylex": path.resolve(rendererRoot, "../formless/src/test/stylex.ts"),
        },
      }
    : undefined,
  test: {
    reporters: ["minimal"],
    setupFiles: ["./test/setup.ts"],
  },
  server: {
    watch: {
      usePolling: true,
    },
  },
});
