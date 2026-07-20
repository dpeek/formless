import { defineConfig } from "vite-plus";
import { defaultExclude as defaultTestExclude } from "vite-plus/test/config";

const ignoredScratchGlobs = [".agents/**"];

export default defineConfig({
  pack: {
    clean: true,
    deps: {
      skipNodeModulesBundle: true,
    },
    dts: {
      sourcemap: true,
    },
    exports: false,
    failOnWarn: true,
    format: "esm",
    minify: false,
    sourcemap: true,
    publint: true,
    attw: {
      level: "error",
      profile: "esm-only",
    },
  },
  fmt: { ignorePatterns: ignoredScratchGlobs },
  lint: { ignorePatterns: ignoredScratchGlobs, options: { typeAware: true, typeCheck: true } },
  test: {
    exclude: [...defaultTestExclude, ...ignoredScratchGlobs],
    cache: false,
    maxWorkers: "50%",
    reporters: ["minimal"],
    server: {
      deps: {
        external: ["typescript"],
        inline: ["vite-plus"],
      },
    },
  },
  run: {
    cache: {
      scripts: true,
    },
  },
});
