import path from "node:path";
import { fileURLToPath } from "node:url";

import { cloudflare, type PluginConfig, type WorkerConfig } from "@cloudflare/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { normalizePath, type Plugin } from "vite";
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
import {
  FORMLESS_SITE_PROJECT_ROOT_ENV_NAME,
  FORMLESS_WORKSPACE_RUNTIME_EXTENSIONS_ENV_NAME,
  SITE_PUBLIC_RENDERER_BROWSER_ENTRYPOINT_MODULE_ID,
  SITE_PUBLIC_RENDERER_BROWSER_VIRTUAL_MODULE_ID,
  SITE_PUBLIC_RENDERER_RUNTIME_EXTENSION_KEY,
  SITE_PUBLIC_RENDERER_WORKER_ENTRYPOINT_MODULE_ID,
  SITE_PUBLIC_RENDERER_WORKER_VIRTUAL_MODULE_ID,
} from "./src/shared/workspace-runtime-extensions.ts";

export {
  SITE_PUBLIC_RENDERER_BROWSER_ENTRYPOINT_MODULE_ID,
  SITE_PUBLIC_RENDERER_BROWSER_VIRTUAL_MODULE_ID,
  SITE_PUBLIC_RENDERER_WORKER_ENTRYPOINT_MODULE_ID,
  SITE_PUBLIC_RENDERER_WORKER_VIRTUAL_MODULE_ID,
} from "./src/shared/workspace-runtime-extensions.ts";

const packageRoot = path.dirname(fileURLToPath(import.meta.url));
const installedNodeModulesRoot = packageInstallNodeModulesRoot(packageRoot);
const siteProjectRoot = process.env[FORMLESS_SITE_PROJECT_ROOT_ENV_NAME];
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
    formlessWorkspaceRuntimeExtensionsPlugin({ env: process.env }),
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

export type SitePublicRendererEntrypointTarget = "browser" | "worker";

export type SitePublicRendererResolvedEntrypoints = {
  browser: string;
  worker: string;
};

export function formlessWorkspaceRuntimeExtensionsPlugin(
  input: {
    env?: NodeJS.ProcessEnv;
    renderer?: SitePublicRendererResolvedEntrypoints;
  } = {},
): Plugin {
  const renderer =
    input.renderer ??
    resolveWorkspaceSitePublicRendererEntrypointsFromEnv(input.env ?? process.env);

  return {
    name: "formless-workspace-runtime-extensions",
    resolveId(id) {
      if (
        id === SITE_PUBLIC_RENDERER_BROWSER_VIRTUAL_MODULE_ID ||
        id === SITE_PUBLIC_RENDERER_WORKER_VIRTUAL_MODULE_ID
      ) {
        return resolvedVirtualModuleId(id);
      }

      if (id === SITE_PUBLIC_RENDERER_BROWSER_ENTRYPOINT_MODULE_ID) {
        return renderer?.browser;
      }

      if (id === SITE_PUBLIC_RENDERER_WORKER_ENTRYPOINT_MODULE_ID) {
        return renderer?.worker;
      }

      return undefined;
    },
    load(id) {
      if (id === resolvedVirtualModuleId(SITE_PUBLIC_RENDERER_BROWSER_VIRTUAL_MODULE_ID)) {
        return sitePublicRendererVirtualModuleCode("browser", renderer !== undefined);
      }

      if (id === resolvedVirtualModuleId(SITE_PUBLIC_RENDERER_WORKER_VIRTUAL_MODULE_ID)) {
        return sitePublicRendererVirtualModuleCode("worker", renderer !== undefined);
      }

      return undefined;
    },
  };
}

export function resolveWorkspaceSitePublicRendererEntrypointsFromEnv(
  env: NodeJS.ProcessEnv,
): SitePublicRendererResolvedEntrypoints | undefined {
  const raw = env[FORMLESS_WORKSPACE_RUNTIME_EXTENSIONS_ENV_NAME]?.trim();

  if (!raw) {
    return undefined;
  }

  const extensions = parseRuntimeExtensionsEnvValue(raw);

  if (extensions === undefined) {
    return undefined;
  }

  const workspaceRoot = env[FORMLESS_SITE_PROJECT_ROOT_ENV_NAME]?.trim();

  if (!workspaceRoot) {
    throw new Error(
      `${FORMLESS_SITE_PROJECT_ROOT_ENV_NAME} is required when ${SITE_PUBLIC_RENDERER_RUNTIME_EXTENSION_KEY} is configured.`,
    );
  }

  return {
    browser: normalizePath(path.resolve(workspaceRoot, extensions.browser)),
    worker: normalizePath(path.resolve(workspaceRoot, extensions.worker)),
  };
}

export function sitePublicRendererVirtualModuleCode(
  target: SitePublicRendererEntrypointTarget,
  configured: boolean,
): string {
  if (!configured) {
    return "export const sitePublicRenderer = undefined;\n";
  }

  const entrypointModuleId =
    target === "browser"
      ? SITE_PUBLIC_RENDERER_BROWSER_ENTRYPOINT_MODULE_ID
      : SITE_PUBLIC_RENDERER_WORKER_ENTRYPOINT_MODULE_ID;

  return `import * as rendererModule from ${JSON.stringify(entrypointModuleId)};

const resolvedSitePublicRenderer = rendererModule.SitePublicRenderer ?? rendererModule.default;

if (resolvedSitePublicRenderer === undefined) {
  throw new Error("Configured ${SITE_PUBLIC_RENDERER_RUNTIME_EXTENSION_KEY} ${target} entrypoint must export a default renderer or named SitePublicRenderer.");
}

export const sitePublicRenderer = resolvedSitePublicRenderer;
`;
}

function parseRuntimeExtensionsEnvValue(
  raw: string,
): { browser: string; worker: string } | undefined {
  const value = JSON.parse(raw) as unknown;

  if (!isRecord(value)) {
    throw new Error(`${FORMLESS_WORKSPACE_RUNTIME_EXTENSIONS_ENV_NAME} must be a JSON object.`);
  }

  assertOnlyKeys(
    value,
    new Set([SITE_PUBLIC_RENDERER_RUNTIME_EXTENSION_KEY]),
    FORMLESS_WORKSPACE_RUNTIME_EXTENSIONS_ENV_NAME,
  );

  const renderer = value[SITE_PUBLIC_RENDERER_RUNTIME_EXTENSION_KEY];

  if (renderer === undefined) {
    return undefined;
  }

  if (!isRecord(renderer)) {
    throw new Error(
      `${FORMLESS_WORKSPACE_RUNTIME_EXTENSIONS_ENV_NAME}.${SITE_PUBLIC_RENDERER_RUNTIME_EXTENSION_KEY} must be a JSON object.`,
    );
  }

  assertOnlyKeys(
    renderer,
    new Set(["browser", "worker"]),
    `${FORMLESS_WORKSPACE_RUNTIME_EXTENSIONS_ENV_NAME}.${SITE_PUBLIC_RENDERER_RUNTIME_EXTENSION_KEY}`,
  );

  return {
    browser: parseRuntimeExtensionEntrypointPath("browser", renderer.browser),
    worker: parseRuntimeExtensionEntrypointPath("worker", renderer.worker),
  };
}

function parseRuntimeExtensionEntrypointPath(field: "browser" | "worker", value: unknown): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(
      `${FORMLESS_WORKSPACE_RUNTIME_EXTENSIONS_ENV_NAME}.${SITE_PUBLIC_RENDERER_RUNTIME_EXTENSION_KEY}.${field} must be a non-empty string.`,
    );
  }

  const filePath = value.trim();
  const parts = filePath.split("/");

  if (
    filePath.startsWith("/") ||
    filePath.startsWith("~") ||
    filePath.includes("\\") ||
    /^[a-zA-Z][a-zA-Z\d+.-]*:/.test(filePath) ||
    parts.some((part) => part === "" || part === "." || part === "..")
  ) {
    throw new Error(
      `${FORMLESS_WORKSPACE_RUNTIME_EXTENSIONS_ENV_NAME}.${SITE_PUBLIC_RENDERER_RUNTIME_EXTENSION_KEY}.${field} must be a local workspace-relative path.`,
    );
  }

  return filePath;
}

function resolvedVirtualModuleId(id: string): string {
  return `\0${id}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function assertOnlyKeys(value: Record<string, unknown>, allowedKeys: Set<string>, context: string) {
  for (const key of Object.keys(value)) {
    if (!allowedKeys.has(key)) {
      throw new Error(`${context} has unsupported key "${key}".`);
    }
  }
}
