import path from "node:path";

import type { Plugin as EsbuildPlugin } from "esbuild";

import {
  FORMLESS_SITE_PROJECT_ROOT_ENV_NAME,
  FORMLESS_WORKSPACE_RUNTIME_EXTENSIONS_ENV_NAME,
  SITE_PUBLIC_RENDERER_BROWSER_ENTRYPOINT_MODULE_ID,
  SITE_PUBLIC_RENDERER_RUNTIME_EXTENSION_KEY,
  SITE_PUBLIC_RENDERER_WORKER_ENTRYPOINT_MODULE_ID,
  SITE_PUBLIC_RENDERER_WORKER_VIRTUAL_MODULE_ID,
} from "../shared/workspace-runtime-extensions.ts";

export {
  SITE_PUBLIC_RENDERER_BROWSER_ENTRYPOINT_MODULE_ID,
  SITE_PUBLIC_RENDERER_BROWSER_VIRTUAL_MODULE_ID,
  SITE_PUBLIC_RENDERER_WORKER_ENTRYPOINT_MODULE_ID,
  SITE_PUBLIC_RENDERER_WORKER_VIRTUAL_MODULE_ID,
} from "../shared/workspace-runtime-extensions.ts";

export type SitePublicRendererEntrypointTarget = "browser" | "worker";

export type SitePublicRendererResolvedEntrypoints = {
  browser: string;
  worker: string;
};

const workerVirtualModuleNamespace = "formless-site-public-renderer-worker";

export function sitePublicRendererWorkerVirtualModulesPlugin(
  input: {
    env?: NodeJS.ProcessEnv;
    renderer?: SitePublicRendererResolvedEntrypoints;
  } = {},
): EsbuildPlugin {
  const renderer =
    input.renderer ??
    resolveWorkspaceSitePublicRendererEntrypointsFromEnv(input.env ?? process.env);

  return {
    name: "formless-site-public-renderer-worker-virtual-modules",
    setup(build) {
      build.onResolve({ filter: /^virtual:formless\/site-public-renderer\/worker$/ }, (args) =>
        args.path === SITE_PUBLIC_RENDERER_WORKER_VIRTUAL_MODULE_ID
          ? { namespace: workerVirtualModuleNamespace, path: args.path }
          : undefined,
      );
      build.onLoad({ filter: /.*/, namespace: workerVirtualModuleNamespace }, () => ({
        contents: sitePublicRendererVirtualModuleCode("worker", renderer !== undefined),
        loader: "js",
      }));
      build.onResolve(
        { filter: /^virtual:formless\/site-public-renderer\/worker-entry$/ },
        (args) =>
          args.path === SITE_PUBLIC_RENDERER_WORKER_ENTRYPOINT_MODULE_ID && renderer
            ? { path: renderer.worker }
            : undefined,
      );
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
    browser: normalizeModulePath(path.resolve(workspaceRoot, extensions.browser)),
    worker: normalizeModulePath(path.resolve(workspaceRoot, extensions.worker)),
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

function normalizeModulePath(filePath: string): string {
  return filePath.replace(/\\/g, "/");
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
