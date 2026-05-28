import path from "node:path";
import { fileURLToPath } from "node:url";

import { cloudflare, type PluginConfig, type WorkerConfig } from "@cloudflare/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite-plus";
import { defaultExclude as defaultTestExclude } from "vite-plus/test/config";
import {
  FORMLESS_TURNSTILE_SECRET_KEY_ENV_NAME,
  FORMLESS_TURNSTILE_SITE_KEY_ENV_NAME,
} from "./src/shared/turnstile-config.ts";

const packageRoot = path.dirname(fileURLToPath(import.meta.url));
const installedNodeModulesRoot = packageInstallNodeModulesRoot(packageRoot);
const siteProjectRoot = process.env.FORMLESS_SITE_PROJECT_ROOT;
const wranglerPersistPath = process.env.FORMLESS_WRANGLER_PERSIST;
const workerRuntimeVars = runtimeWorkerVars(process.env);
const ignoredScratchGlobs = ["tmp/**", "**/tmp/**"];
const serverFsAllow = [
  packageRoot,
  ...(installedNodeModulesRoot ? [installedNodeModulesRoot] : []),
  ...(siteProjectRoot ? [siteProjectRoot] : []),
];
const cloudflarePluginConfig: PluginConfig | undefined =
  wranglerPersistPath || Object.keys(workerRuntimeVars).length > 0
    ? {
        ...(wranglerPersistPath ? { persistState: { path: wranglerPersistPath } } : {}),
        ...(Object.keys(workerRuntimeVars).length > 0
          ? {
              config: (config: WorkerConfig): Partial<WorkerConfig> => ({
                vars: {
                  ...config.vars,
                  ...workerRuntimeVars,
                },
              }),
            }
          : {}),
      }
    : undefined;

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    ...(process.env.VITEST ? [] : [cloudflare(cloudflarePluginConfig)]),
  ],
  server: {
    fs: {
      allow: serverFsAllow,
    },
  },
  optimizeDeps: {
    include: [
      "@juggle/resize-observer",
      "acorn-jsx",
      "debug",
      "direction",
      "extend",
      "highlight.js/lib/core",
      "highlight.js/lib/languages/bash",
      "highlight.js/lib/languages/css",
      "highlight.js/lib/languages/diff",
      "highlight.js/lib/languages/javascript",
      "highlight.js/lib/languages/json",
      "highlight.js/lib/languages/markdown",
      "highlight.js/lib/languages/scss",
      "highlight.js/lib/languages/sql",
      "highlight.js/lib/languages/typescript",
      "highlight.js/lib/languages/xml",
      "highlight.js/lib/languages/yaml",
      "is-hotkey",
      "lodash/castArray.js",
      "lodash/cloneDeep.js",
      "lodash/defaults.js",
      "lodash/defaultsDeep.js",
      "lodash/debounce",
      "lodash/every",
      "lodash/find",
      "lodash/first",
      "lodash/flatMap",
      "lodash/get",
      "lodash/isBoolean",
      "lodash/isEqual.js",
      "lodash/isEqual",
      "lodash/isFunction",
      "lodash/isNaN",
      "lodash/isNil",
      "lodash/isNumber",
      "lodash/isObject",
      "lodash/isPlainObject.js",
      "lodash/isPlainObject",
      "lodash/isString",
      "lodash/isUndefined.js",
      "lodash/kebabCase.js",
      "lodash/last",
      "lodash/map.js",
      "lodash/mapValues",
      "lodash/max",
      "lodash/maxBy",
      "lodash/memoize",
      "lodash/merge.js",
      "lodash/mergeWith.js",
      "lodash/min",
      "lodash/minBy",
      "lodash/omit.js",
      "lodash/omit",
      "lodash/omitBy.js",
      "lodash/pick.js",
      "lodash/range",
      "lodash/some",
      "lodash/sortBy",
      "lodash/sumBy",
      "lodash/throttle",
      "lodash/uniqBy",
      "lodash/upperFirst",
      "react-compiler-runtime",
      "scheduler",
      "use-sync-external-store/shim",
      "use-sync-external-store/shim/index.js",
      "use-sync-external-store/shim/with-selector",
      "use-sync-external-store/shim/with-selector.js",
    ],
  },
  fmt: { ignorePatterns: ignoredScratchGlobs },
  lint: { ignorePatterns: ignoredScratchGlobs, options: { typeAware: true, typeCheck: true } },
  test: {
    exclude: [...defaultTestExclude, ...ignoredScratchGlobs],
  },
});

function packageInstallNodeModulesRoot(root: string): string | null {
  const scopeRoot = path.dirname(root);
  const nodeModulesRoot = path.dirname(scopeRoot);

  return path.basename(scopeRoot) === "@dpeek" && path.basename(nodeModulesRoot) === "node_modules"
    ? nodeModulesRoot
    : null;
}

function runtimeWorkerVars(env: NodeJS.ProcessEnv): Record<string, string> {
  return {
    ...optionalWorkerVar("FORMLESS_LAUNCH_FIXTURE", env.FORMLESS_LAUNCH_FIXTURE),
    ...optionalWorkerVar("FORMLESS_RUNTIME_PROFILE", env.FORMLESS_RUNTIME_PROFILE),
    ...optionalWorkerVar(
      FORMLESS_TURNSTILE_SITE_KEY_ENV_NAME,
      env[FORMLESS_TURNSTILE_SITE_KEY_ENV_NAME],
    ),
    ...optionalWorkerVar(
      FORMLESS_TURNSTILE_SECRET_KEY_ENV_NAME,
      env[FORMLESS_TURNSTILE_SECRET_KEY_ENV_NAME],
    ),
  };
}

function optionalWorkerVar(name: string, value: string | undefined): Record<string, string> {
  return value && value.length > 0 ? { [name]: value } : {};
}
