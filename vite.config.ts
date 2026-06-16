import path from "node:path";
import { fileURLToPath } from "node:url";

import { cloudflare, type PluginConfig, type WorkerConfig } from "@cloudflare/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite-plus";
import { defaultExclude as defaultTestExclude } from "vite-plus/test/config";
import {
  FORMLESS_INSTANCE_AUTH_ORIGIN_ENV_NAME,
  FORMLESS_INSTANCE_AUTH_RELYING_PARTY_ID_ENV_NAME,
  FORMLESS_INSTANCE_AUTH_RELYING_PARTY_NAME_ENV_NAME,
} from "./src/shared/instance-auth.ts";
import {
  FORMLESS_TURNSTILE_SECRET_KEY_ENV_NAME,
  FORMLESS_TURNSTILE_SITE_KEY_ENV_NAME,
} from "./src/shared/turnstile-config.ts";
import {
  LOCAL_SESSION_BOOTSTRAP_TOKEN_ENV,
  WORKSPACE_GATEWAY_BOOTSTRAP_TOKEN_ENV,
  WORKSPACE_GATEWAY_CSRF_TOKEN_ENV,
  WORKSPACE_GATEWAY_PROXY_TOKEN_ENV,
  WORKSPACE_GATEWAY_SIDECAR_URL_ENV,
} from "@dpeek/formless-gateway";
import { FORMLESS_WORKSPACE_APP_PACKAGES_ENV_NAME } from "./src/shared/workspace-runtime-packages.ts";

const packageRoot = path.dirname(fileURLToPath(import.meta.url));
const installedNodeModulesRoot = packageInstallNodeModulesRoot(packageRoot);
const siteProjectRoot = process.env.FORMLESS_SITE_PROJECT_ROOT;
const wranglerPersistPath = process.env.FORMLESS_WRANGLER_PERSIST;
const workspaceAppPackages = process.env[FORMLESS_WORKSPACE_APP_PACKAGES_ENV_NAME]?.trim();
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
  define: {
    __FORMLESS_WORKSPACE_APP_PACKAGES_JSON__: JSON.stringify(workspaceAppPackages ?? ""),
  },
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
    ...optionalWorkerVar("FORMLESS_ADMIN_TOKEN", env.FORMLESS_ADMIN_TOKEN),
    ...optionalWorkerVar("FORMLESS_LAUNCH_FIXTURE", env.FORMLESS_LAUNCH_FIXTURE),
    ...optionalWorkerVar("FORMLESS_OWNER_SESSION_SECRET", env.FORMLESS_OWNER_SESSION_SECRET),
    ...optionalWorkerVar("FORMLESS_RUNTIME_PROFILE", env.FORMLESS_RUNTIME_PROFILE),
    ...optionalWorkerVar(LOCAL_SESSION_BOOTSTRAP_TOKEN_ENV, env[LOCAL_SESSION_BOOTSTRAP_TOKEN_ENV]),
    ...optionalWorkerVar(
      FORMLESS_INSTANCE_AUTH_ORIGIN_ENV_NAME,
      env[FORMLESS_INSTANCE_AUTH_ORIGIN_ENV_NAME],
    ),
    ...optionalWorkerVar(
      FORMLESS_INSTANCE_AUTH_RELYING_PARTY_ID_ENV_NAME,
      env[FORMLESS_INSTANCE_AUTH_RELYING_PARTY_ID_ENV_NAME],
    ),
    ...optionalWorkerVar(
      FORMLESS_INSTANCE_AUTH_RELYING_PARTY_NAME_ENV_NAME,
      env[FORMLESS_INSTANCE_AUTH_RELYING_PARTY_NAME_ENV_NAME],
    ),
    ...optionalWorkerVar(
      FORMLESS_TURNSTILE_SITE_KEY_ENV_NAME,
      env[FORMLESS_TURNSTILE_SITE_KEY_ENV_NAME],
    ),
    ...optionalWorkerVar(
      FORMLESS_TURNSTILE_SECRET_KEY_ENV_NAME,
      env[FORMLESS_TURNSTILE_SECRET_KEY_ENV_NAME],
    ),
    ...optionalWorkerVar(
      WORKSPACE_GATEWAY_BOOTSTRAP_TOKEN_ENV,
      env[WORKSPACE_GATEWAY_BOOTSTRAP_TOKEN_ENV],
    ),
    ...optionalWorkerVar(WORKSPACE_GATEWAY_CSRF_TOKEN_ENV, env[WORKSPACE_GATEWAY_CSRF_TOKEN_ENV]),
    ...optionalWorkerVar(WORKSPACE_GATEWAY_SIDECAR_URL_ENV, env[WORKSPACE_GATEWAY_SIDECAR_URL_ENV]),
    ...optionalWorkerVar(WORKSPACE_GATEWAY_PROXY_TOKEN_ENV, env[WORKSPACE_GATEWAY_PROXY_TOKEN_ENV]),
  };
}

function optionalWorkerVar(name: string, value: string | undefined): Record<string, string> {
  return value && value.length > 0 ? { [name]: value } : {};
}
