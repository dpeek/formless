import { defineConfig } from "vite-plus";
import { defaultExclude as defaultTestExclude } from "vite-plus/test/config";
import { runtimeViteConfig } from "./src/runtime/vite-config.ts";

const ignoredScratchGlobs = [".agents/**"];

export default defineConfig({
  ...runtimeViteConfig(),
  fmt: { ignorePatterns: ignoredScratchGlobs },
  lint: { ignorePatterns: ignoredScratchGlobs, options: { typeAware: true, typeCheck: true } },
  test: {
    exclude: [...defaultTestExclude, ...ignoredScratchGlobs],
    cache: false,
    maxWorkers: "50%",
    reporters: ["minimal"],
    server: {
      deps: {
        inline: ["vite-plus"],
      },
    },
  },
});
